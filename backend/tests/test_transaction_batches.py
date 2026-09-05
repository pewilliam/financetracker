import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Category, Transaction, User
from app.routers.transactions import create_transaction_batch
from app.schemas.transactions import TransactionBatchCreate, TransactionBatchRule


class TransactionBatchTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="batch@example.com", password_hash="hash")
        self.category = Category(user=self.user, name="Transporte", color="#3B82F6")
        self.db.add_all([self.user, self.category])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_creates_multiple_weekly_rules_in_one_batch(self):
        result = create_transaction_batch(
            TransactionBatchCreate(
                start_date=date(2026, 9, 7),
                end_date=date(2026, 9, 11),
                type="expense",
                category_ids=[self.category.id],
                rules=[
                    TransactionBatchRule(description="Ônibus - ida", amount=Decimal("14.00"), weekdays=[0, 1, 2, 3]),
                    TransactionBatchRule(description="Ônibus - volta", amount=Decimal("12.00"), weekdays=[0, 1, 2, 3]),
                    TransactionBatchRule(description="Ônibus - sexta", amount=Decimal("14.00"), weekdays=[4]),
                ],
            ),
            self.db,
            self.user,
        )

        self.assertEqual(result.created_count, 9)
        self.assertEqual(sum((item.amount for item in result.transactions), Decimal("0.00")), Decimal("118.00"))
        self.assertEqual(
            [(item.date, item.description) for item in result.transactions[:3]],
            [
                (date(2026, 9, 7), "Ônibus - ida"),
                (date(2026, 9, 7), "Ônibus - volta"),
                (date(2026, 9, 8), "Ônibus - ida"),
            ],
        )
        self.assertTrue(all(item.category_ids == [self.category.id] for item in result.transactions))

    def test_rejects_an_invalid_period_without_creating_transactions(self):
        with self.assertRaises(HTTPException) as context:
            create_transaction_batch(
                TransactionBatchCreate(
                    start_date=date(2026, 9, 11),
                    end_date=date(2026, 9, 7),
                    rules=[TransactionBatchRule(description="Ônibus", amount=Decimal("14.00"), weekdays=[0])],
                ),
                self.db,
                self.user,
            )

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(self.db.query(Transaction).count(), 0)

    def test_invalid_category_keeps_the_batch_atomic(self):
        with self.assertRaises(HTTPException):
            create_transaction_batch(
                TransactionBatchCreate(
                    start_date=date(2026, 9, 7),
                    end_date=date(2026, 9, 11),
                    category_ids=[99999],
                    rules=[TransactionBatchRule(description="Ônibus", amount=Decimal("14.00"), weekdays=[0, 1, 2, 3, 4])],
                ),
                self.db,
                self.user,
            )

        self.assertEqual(self.db.query(Transaction).count(), 0)


if __name__ == "__main__":
    unittest.main()
