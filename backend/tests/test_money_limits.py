import unittest
from datetime import date
from decimal import Decimal

from pydantic import ValidationError

from app.schemas.base import MAX_MONEY_AMOUNT
from app.schemas.budgets import MonthlyBudgetPlanUpdate
from app.schemas.categories import CategoryCreate
from app.schemas.invoices import InvoiceItemCreate
from app.schemas.months import OpeningBalancePayload
from app.schemas.receivables import ReceivableCreate
from app.schemas.simulations import SimulationItemPayload
from app.schemas.transactions import TransactionCreate


class MoneyLimitSchemaTests(unittest.TestCase):
    def test_accepts_the_database_safe_boundary(self):
        transaction = TransactionCreate(
            date=date(2026, 9, 10),
            type="expense",
            amount=MAX_MONEY_AMOUNT,
        )
        refund = InvoiceItemCreate(description="Refund", amount=-MAX_MONEY_AMOUNT)
        balance = OpeningBalancePayload(opening_balance=-MAX_MONEY_AMOUNT)

        self.assertEqual(transaction.amount, MAX_MONEY_AMOUNT)
        self.assertEqual(refund.amount, -MAX_MONEY_AMOUNT)
        self.assertEqual(balance.opening_balance, -MAX_MONEY_AMOUNT)

    def test_rejects_amounts_above_the_limit_across_request_types(self):
        excessive = MAX_MONEY_AMOUNT + Decimal("0.01")
        payloads = [
            lambda: TransactionCreate(date=date(2026, 9, 10), type="income", amount=excessive),
            lambda: InvoiceItemCreate(description="Expense", amount=excessive),
            lambda: ReceivableCreate(
                description="Receivable",
                total_amount=excessive,
                due_date=date(2026, 9, 10),
            ),
            lambda: CategoryCreate(name="Category", monthly_limit=excessive),
            lambda: MonthlyBudgetPlanUpdate(manual_income=excessive),
            lambda: SimulationItemPayload(
                type="expense",
                mode="single",
                start_month="2026-09",
                total_amount=excessive,
            ),
            lambda: OpeningBalancePayload(opening_balance=excessive),
        ]

        for build_payload in payloads:
            with self.subTest(payload=build_payload):
                with self.assertRaises(ValidationError):
                    build_payload()

    def test_rejects_signed_amounts_below_the_negative_limit(self):
        excessive_refund = -(MAX_MONEY_AMOUNT + Decimal("0.01"))

        with self.assertRaises(ValidationError):
            InvoiceItemCreate(description="Refund", amount=excessive_refund)
        with self.assertRaises(ValidationError):
            OpeningBalancePayload(opening_balance=excessive_refund)


if __name__ == "__main__":
    unittest.main()
