import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from fastapi import HTTPException

from app.models import Category, InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, InvoiceTemplate, Receivable, ReceivablePerson, Recurrence, Transaction, User
from app.routers.categories import delete_category, update_category
from app.routers.installments import update_installment_category
from app.routers.months import get_category_breakdown
from app.routers.receivables import mark_receivable_paid
from app.routers.transactions import create_transaction
from app.schemas.categories import CategoryUpdate
from app.schemas.installments import InstallmentCategoryUpdate
from app.schemas.receivables import ReceivablePaidPayload
from app.schemas.transactions import TransactionCreate


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
        self.db.add_all([
            Transaction(
                user_id=self.user.id,
                date=date(2026, 8, 7),
                type="income",
                amount=Decimal("300.00"),
                description="Salário",
                category_id=category.id,
            ),
            Transaction(
                user_id=self.user.id,
                date=date(2026, 8, 8),
                type="income",
                amount=Decimal("100.00"),
                description="Outro ganho",
            ),
        ])
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

        summary_result = get_category_breakdown(2026, 8, self.db, self.user)
        self.assertTrue(all(not item.details for item in summary_result.chart_items))

        result = get_category_breakdown(2026, 8, self.db, self.user, include_details=True)

        self.assertEqual(result.total_expenses, Decimal("250.00"))
        self.assertEqual(result.categorized_total, Decimal("250.00"))
        self.assertEqual([(item.name, item.amount) for item in result.items], [
            ("Alimentação", Decimal("200.00")),
            ("Sem categoria", Decimal("50.00")),
        ])
        self.assertEqual([item.percentage for item in result.items], [Decimal("80.00"), Decimal("20.00")])
        food_group = next(item for item in result.chart_items if item.name == "Alimentação")
        self.assertEqual(
            [(detail.source_type, detail.description, detail.amount, detail.date) for detail in food_group.details],
            [
                ("invoice_item", "Restaurante", Decimal("40.00"), date(2026, 8, 10)),
                ("installment_item", "Compra", Decimal("60.00"), date(2026, 8, 10)),
                ("transaction", "Mercado", Decimal("100.00"), date(2026, 8, 5)),
            ],
        )
        self.assertEqual(food_group.details[1].invoice_name, "Cartão")
        self.assertEqual(food_group.details[1].installment_number, 1)
        self.assertEqual(food_group.details[1].installment_count, 1)
        self.assertEqual(result.total_income, Decimal("400.00"))
        self.assertEqual([(item.name, item.amount) for item in result.income_items], [
            ("Alimentação", Decimal("300.00")),
            ("Sem categoria", Decimal("100.00")),
        ])

    def test_multiple_categories_use_full_limits_and_combined_chart_group(self):
        food = Category(user_id=self.user.id, name="Alimentação", color="#14A078")
        dating = Category(user_id=self.user.id, name="Saída com Namorada", color="#EC4899")
        self.db.add_all([food, dating])
        self.db.flush()

        transaction = create_transaction(
            TransactionCreate(
                date=date(2026, 8, 15),
                type="expense",
                amount=Decimal("100.00"),
                description="Jantar",
                category_ids=[food.id, dating.id],
            ),
            self.db,
            self.user,
        )

        self.assertEqual(transaction.category_id, food.id)
        self.assertEqual(set(transaction.category_ids), {food.id, dating.id})

        create_transaction(
            TransactionCreate(
                date=date(2026, 8, 16),
                type="expense",
                amount=Decimal("40.00"),
                description="Almoço",
                category_ids=[food.id],
            ),
            self.db,
            self.user,
        )

        result = get_category_breakdown(2026, 8, self.db, self.user, include_details=True)
        self.assertEqual(result.total_expenses, Decimal("140.00"))
        self.assertEqual(result.categorized_total, Decimal("140.00"))
        self.assertEqual(
            {(item.name, item.amount) for item in result.items},
            {("Alimentação", Decimal("140.00")), ("Saída com Namorada", Decimal("100.00"))},
        )
        self.assertEqual(
            {(item.name, item.amount) for item in result.chart_items},
            {
                ("Alimentação + Saída com Namorada", Decimal("100.00")),
                ("Alimentação", Decimal("40.00")),
            },
        )
        combined_group = next(item for item in result.chart_items if len(item.category_ids) == 2)
        self.assertEqual(len(combined_group.details), 1)
        self.assertEqual(combined_group.details[0].description, "Jantar")
        self.assertEqual(combined_group.details[0].amount, Decimal("100.00"))
        self.assertEqual(combined_group.details[0].date, date(2026, 8, 15))

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

    def test_receivable_payment_inherits_selected_category(self):
        category = Category(user_id=self.user.id, name="Freelance", color="#3B82F6")
        person = ReceivablePerson(user_id=self.user.id, name="Cliente")
        self.db.add_all([category, person])
        self.db.flush()
        receivable = Receivable(
            user_id=self.user.id,
            person_id=person.id,
            description="Projeto",
            total_amount=Decimal("500.00"),
            received_amount=Decimal("0.00"),
            due_date=date.today(),
            status="pending",
        )
        self.db.add(receivable)
        self.db.commit()

        result = mark_receivable_paid(
            receivable.id,
            ReceivablePaidPayload(paid_at=date.today(), category_id=category.id),
            self.db,
            self.user,
        )

        transaction = self.db.get(Transaction, result.payments[0].transaction_id)
        self.assertEqual(result.category_id, category.id)
        self.assertEqual(transaction.category_id, category.id)

    def test_category_can_be_edited_without_allowing_duplicate_name(self):
        category = Category(user_id=self.user.id, name="Mercado", color="#14A078")
        duplicate = Category(user_id=self.user.id, name="Transporte", color="#3B82F6")
        self.db.add_all([category, duplicate])
        self.db.commit()

        result = update_category(
            category.id,
            CategoryUpdate(
                name="  Alimentação   geral  ",
                color="#8b5cf6",
                monthly_limit=Decimal("850.00"),
                ignore_in_category_analysis=True,
                include_in_income_planning=True,
            ),
            self.db,
            self.user,
        )

        self.assertEqual(result.name, "Alimentação geral")
        self.assertEqual(result.color, "#8B5CF6")
        self.assertEqual(result.monthly_limit, Decimal("850.00"))
        self.assertTrue(result.ignore_in_category_analysis)
        self.assertTrue(result.include_in_income_planning)
        with self.assertRaises(HTTPException) as context:
            update_category(
                category.id,
                CategoryUpdate(name="transporte"),
                self.db,
                self.user,
            )
        self.assertEqual(context.exception.status_code, 409)

    def test_deleting_category_preserves_items_as_uncategorized(self):
        category = Category(user_id=self.user.id, name="Temporária", color="#EF4444")
        person = ReceivablePerson(user_id=self.user.id, name="Cliente categoria")
        self.db.add_all([category, person])
        self.db.flush()
        recurrence = Recurrence(
            user_id=self.user.id,
            description="Mensalidade",
            type="income",
            amount=Decimal("100.00"),
            day_of_month=10,
            recurrence_months=2,
            category_id=category.id,
        )
        transaction = Transaction(
            user_id=self.user.id,
            date=date.today(),
            type="income",
            amount=Decimal("100.00"),
            description="Mensalidade",
            category_id=category.id,
        )
        purchase = InstallmentPurchase(
            user_id=self.user.id,
            description="Compra categorizada",
            total_amount=Decimal("100.00"),
            installment_count=1,
            installment_value=Decimal("100.00"),
            category_id=category.id,
        )
        receivable = Receivable(
            user_id=self.user.id,
            person_id=person.id,
            description="Projeto categorizado",
            total_amount=Decimal("100.00"),
            received_amount=Decimal("0.00"),
            due_date=date.today(),
            status="pending",
            category_id=category.id,
        )
        self.db.add_all([recurrence, transaction, purchase, receivable])
        self.db.commit()

        delete_category(category.id, self.db, self.user)

        self.assertIsNone(self.db.get(Transaction, transaction.id).category_id)
        self.assertIsNone(self.db.get(Recurrence, recurrence.id).category_id)
        self.assertIsNone(self.db.get(InstallmentPurchase, purchase.id).category_id)
        self.assertIsNone(self.db.get(Receivable, receivable.id).category_id)
        self.assertIsNone(self.db.get(Category, category.id))


if __name__ == "__main__":
    unittest.main()
