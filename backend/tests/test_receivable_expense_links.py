import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import InstallmentItem, InstallmentPurchase, Invoice, InvoiceTemplate, Receivable, ReceivablePerson, Transaction, User
from app.routers.receivables import create_receivable, list_linked_receivable_transactions, list_receivable_expense_options
from app.routers.transactions import create_transaction, update_transaction
from app.schemas.receivables import ReceivableCreate, ReceivableExpenseLinkIn
from app.schemas.transactions import TransactionCreate, TransactionOut, TransactionUpdate


class ReceivableExpenseLinkTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="links@example.com", password_hash="hash")
        self.person = ReceivablePerson(user=self.user, name="Pessoa")
        self.db.add_all([self.user, self.person])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def payload(self, amount, link):
        return ReceivableCreate(
            person_id=self.person.id,
            description="Reembolso",
            total_amount=Decimal(amount),
            due_date=date(2026, 9, 10),
            expense_link=link,
        )

    def test_partial_receivable_can_link_to_month_expense(self):
        expense = Transaction(
            user_id=self.user.id,
            date=date(2026, 8, 29),
            type="expense",
            amount=Decimal("340.00"),
            description="Roupas",
        )
        self.db.add(expense)
        self.db.commit()

        result = create_receivable(
            self.payload("200.00", ReceivableExpenseLinkIn(source_type="transaction", source_id=expense.id)),
            self.db,
            self.user,
        )

        self.assertEqual(result.total_amount, Decimal("200.00"))
        self.assertEqual(result.source_transaction_id, expense.id)
        self.assertEqual(result.linked_expense["description"], "Roupas")

        with self.assertRaises(HTTPException) as context:
            create_receivable(
                self.payload("150.00", ReceivableExpenseLinkIn(source_type="transaction", source_id=expense.id)),
                self.db,
                self.user,
            )
        self.assertEqual(context.exception.status_code, 400)

    def test_partial_total_is_distributed_across_purchase_installments(self):
        template = InvoiceTemplate(
            user_id=self.user.id,
            name="Cartão",
            color="#3B82F6",
            default_due_day=10,
            active=True,
        )
        self.db.add(template)
        self.db.flush()
        invoices = [
            Invoice(user_id=self.user.id, template_id=template.id, due_date=date(2026, month, 10), total_amount=Decimal("0.00"))
            for month in (9, 10, 11)
        ]
        self.db.add_all(invoices)
        self.db.flush()
        purchase = InstallmentPurchase(
            user_id=self.user.id,
            description="Roupas",
            total_amount=Decimal("340.00"),
            installment_count=3,
            installment_value=Decimal("113.33"),
            first_invoice_id=invoices[0].id,
        )
        self.db.add(purchase)
        self.db.flush()
        for number, (invoice, amount) in enumerate(zip(invoices, ("113.33", "113.33", "113.34")), start=1):
            self.db.add(InstallmentItem(
                purchase_id=purchase.id,
                invoice_id=invoice.id,
                installment_number=number,
                amount=Decimal(amount),
                description=f"Roupas ({number}/3)",
                status="pending",
            ))
        self.db.commit()

        create_receivable(
            self.payload(
                "200.00",
                ReceivableExpenseLinkIn(
                    source_type="installment_purchase",
                    source_id=purchase.id,
                    installment_scope="all",
                    allocation_mode="total",
                ),
            ),
            self.db,
            self.user,
        )

        rows = self.db.query(Receivable).order_by(Receivable.series_installment_number).all()
        self.assertEqual(len(rows), 3)
        self.assertEqual(sum((row.total_amount for row in rows), Decimal("0.00")), Decimal("200.00"))
        self.assertEqual([row.due_date for row in rows], [invoice.due_date for invoice in invoices])
        self.assertTrue(rows[0].series_id)
        self.assertEqual([row.series_installment_number for row in rows], [1, 2, 3])
        self.assertEqual(len({row.series_id for row in rows}), 1)

    def test_income_transaction_can_link_to_expense_and_consumes_available_amount(self):
        expense = Transaction(
            user_id=self.user.id,
            date=date(2026, 8, 28),
            type="expense",
            amount=Decimal("340.00"),
            description="Roupas do casal",
        )
        self.db.add(expense)
        self.db.commit()

        income = create_transaction(
            TransactionCreate(
                date=date(2026, 8, 31),
                type="income",
                amount=Decimal("200.00"),
                description="Parte da roupa",
                expense_link=ReceivableExpenseLinkIn(source_type="transaction", source_id=expense.id),
            ),
            self.db,
            self.user,
        )

        self.assertEqual(income.linked_expense_transaction_id, expense.id)
        self.assertEqual(income.linked_expense["description"], "Roupas do casal")
        serialized = TransactionOut.model_validate(income)
        self.assertEqual(serialized.linked_expense.source_id, expense.id)
        option = next(item for item in list_receivable_expense_options(self.db, self.user) if item.source_type == "transaction" and item.source_id == expense.id)
        self.assertEqual(option.linked_amount, Decimal("200.00"))
        self.assertEqual(option.available_amount, Decimal("140.00"))
        self.assertEqual(option.transaction_ids, [income.id])

        updated = update_transaction(
            income.id,
            TransactionUpdate(
                amount=Decimal("140.00"),
                expense_link=ReceivableExpenseLinkIn(source_type="transaction", source_id=expense.id),
            ),
            self.db,
            self.user,
        )
        self.assertEqual(updated.amount, Decimal("140.00"))

        with self.assertRaises(HTTPException):
            create_receivable(
                self.payload("201.00", ReceivableExpenseLinkIn(source_type="transaction", source_id=expense.id)),
                self.db,
                self.user,
            )

    def test_linked_income_transaction_is_listed_as_receivable(self):
        expense = Transaction(
            user_id=self.user.id,
            date=date(2026, 8, 30),
            type="expense",
            amount=Decimal("220.00"),
            description="Compra para outra pessoa",
        )
        unrelated_income = Transaction(
            user_id=self.user.id,
            date=date(2026, 8, 31),
            type="income",
            amount=Decimal("50.00"),
            description="Renda comum",
        )
        self.db.add_all([expense, unrelated_income])
        self.db.commit()
        linked_income = create_transaction(
            TransactionCreate(
                date=date(2026, 9, 10),
                type="income",
                amount=Decimal("220.00"),
                description="Devolução da compra",
                expense_link=ReceivableExpenseLinkIn(source_type="transaction", source_id=expense.id),
            ),
            self.db,
            self.user,
        )

        result = list_linked_receivable_transactions(self.db, self.user)

        self.assertEqual([item.id for item in result], [linked_income.id])
        self.assertEqual(result[0].linked_expense["source_id"], expense.id)


if __name__ == "__main__":
    unittest.main()
