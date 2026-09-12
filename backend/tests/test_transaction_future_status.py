import unittest
from datetime import date, timedelta
from decimal import Decimal

from app.schemas.transactions import TransactionOut


class TransactionFutureStatusTests(unittest.TestCase):
    def build_transaction(self, transaction_date: date, is_future: bool) -> TransactionOut:
        return TransactionOut(
            id=1,
            date=transaction_date,
            type="expense",
            amount=Decimal("14.00"),
            description="Onibus",
            is_future=is_future,
        )

    def test_planned_transaction_is_realized_when_its_date_arrives(self):
        transaction = self.build_transaction(date.today(), True)

        self.assertFalse(transaction.is_future)

    def test_past_planned_transaction_is_realized(self):
        transaction = self.build_transaction(date.today() - timedelta(days=1), True)

        self.assertFalse(transaction.is_future)

    def test_future_planned_transaction_remains_planned(self):
        transaction = self.build_transaction(date.today() + timedelta(days=1), True)

        self.assertTrue(transaction.is_future)

    def test_future_transaction_realized_early_remains_realized(self):
        transaction = self.build_transaction(date.today() + timedelta(days=1), False)

        self.assertFalse(transaction.is_future)


if __name__ == "__main__":
    unittest.main()
