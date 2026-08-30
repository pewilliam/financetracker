import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Category, InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, InvoiceTemplate, Transaction, User
from app.routers.installments import update_installment_category
from app.routers.months import get_category_breakdown
from app.schemas.installments import InstallmentCategoryUpdate


class ExpenseCategoryBreakdownTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="teste@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_breakdown_uses_invoice_items_without_counting_invoice_transaction_twice(self):
        category = Category(user_id=self.user.id, name="Alimentação", color="#14A078")
        template = InvoiceTemplate(
            user_id=self.user.id,
            name="Cartão",
            color="#3B82F6",
            default_due_day=10,
            active=True,
        )
        self.db.add_all([category, template])
        self.db.flush()

        invoice = Invoice(
            user_id=self.user.id,
            template_id=template.id,
            due_date=date(2026, 8, 10),
            total_amount=Decimal("100.00"),
        )
        self.db.add(invoice)
        self.db.flush()

        linked = Transaction(
            user_id=self.user.id,
            date=invoice.due_date,
            type="expense",
            amount=Decimal("100.00"),
            description="Fatura: Cartão",
            invoice_id=invoice.id,
        )
        direct = Transaction(
            user_id=self.user.id,
            date=date(2026, 8, 5),
            type="expense",
            amount=Decimal("100.00"),
            description="Mercado",
            category_id=category.id,
        )
        uncategorized = Transaction(
            user_id=self.user.id,
            date=date(2026, 8, 6),
            type="expense",
            amount=Decimal("50.00"),
            description="Outro",
        )
        self.db.add_all([linked, direct, uncategorized])
        self.db.flush()
        invoice.linked_transaction_id = linked.id

        purchase = InstallmentPurchase(
            user_id=self.user.id,
            description="Compra",
            total_amount=Decimal("60.00"),
            installment_count=1,
            installment_value=Decimal("60.00"),
            first_invoice_id=invoice.id,
            category_id=category.id,
        )
        self.db.add(purchase)
        self.db.flush()
        self.db.add_all([
            InvoiceItem(
                invoice_id=invoice.id,
                description="Restaurante",
                amount=Decimal("40.00"),
                category_id=category.id,
            ),
            InstallmentItem(
                purchase_id=purchase.id,
                invoice_id=invoice.id,
                installment_number=1,
                amount=Decimal("60.00"),
                description="Compra (1/1)",
                status="pending",
            ),
        ])
        self.db.commit()

        result = get_category_breakdown(2026, 8, self.db, self.user)

        self.assertEqual(result.total_expenses, Decimal("250.00"))
        self.assertEqual(result.categorized_total, Decimal("250.00"))
        self.assertEqual([(item.name, item.amount) for item in result.items], [
            ("Alimentação", Decimal("200.00")),
            ("Sem categoria", Decimal("50.00")),
        ])
        self.assertEqual([item.percentage for item in result.items], [Decimal("80.00"), Decimal("20.00")])

    def test_installment_category_update_also_updates_existing_refund(self):
        category = Category(user_id=self.user.id, name="Assinaturas", color="#8B5CF6")
        template = InvoiceTemplate(
            user_id=self.user.id,
            name="Cartão",
            color="#3B82F6",
            default_due_day=10,
            active=True,
        )
        self.db.add_all([category, template])
        self.db.flush()
        invoice = Invoice(
            user_id=self.user.id,
            template_id=template.id,
            due_date=date(2026, 8, 10),
            total_amount=Decimal("0.00"),
        )
        self.db.add(invoice)
        self.db.flush()
        purchase = InstallmentPurchase(
            user_id=self.user.id,
            description="Assinatura anual",
            total_amount=Decimal("120.00"),
            installment_count=1,
            installment_value=Decimal("120.00"),
            first_invoice_id=invoice.id,
        )
        self.db.add(purchase)
        self.db.flush()
        refund = InvoiceItem(invoice_id=invoice.id, description="Reembolso", amount=Decimal("-120.00"))
        self.db.add(refund)
        self.db.flush()
        installment = InstallmentItem(
            purchase_id=purchase.id,
            invoice_id=invoice.id,
            installment_number=1,
            amount=Decimal("120.00"),
            description="Assinatura anual (1/1)",
            status="refunded",
            refund_invoice_item_id=refund.id,
        )
        self.db.add(installment)
        self.db.commit()

        result = update_installment_category(
            purchase.id,
            InstallmentCategoryUpdate(category_id=category.id),
            self.db,
            self.user,
        )

        self.db.refresh(refund)
        self.assertEqual(result.category_id, category.id)
        self.assertEqual(result.category.name, "Assinaturas")
        self.assertEqual(refund.category_id, category.id)


if __name__ == "__main__":
    unittest.main()
