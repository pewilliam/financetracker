import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import MonthlyBalance, Transaction, User
from app.routers.months import _build_month_summary, _summarize_month_data, get_month, list_month_summaries


class MonthSummaryPerformanceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="meses@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_month_summaries_use_two_queries_and_preserve_balance_anchors(self):
        self.db.add_all([
            Transaction(user_id=self.user.id, date=date(2026, 1, 5), type="income", amount=Decimal("1000.00"), description="Salário"),
            Transaction(user_id=self.user.id, date=date(2026, 1, 10), type="expense", amount=Decimal("200.00"), description="Mercado"),
            Transaction(user_id=self.user.id, date=date(2026, 2, 12), type="expense", amount=Decimal("100.00"), description="Conta"),
            Transaction(user_id=self.user.id, date=date(2026, 3, 8), type="income", amount=Decimal("200.00"), description="Extra"),
            MonthlyBalance(user_id=self.user.id, year=2026, month=2, opening_balance=Decimal("500.00")),
        ])
        self.db.commit()
        current_user = type("CurrentUser", (), {"id": self.user.id})()

        statements = []
        listener = lambda *args: statements.append(args[2])
        event.listen(self.engine, "before_cursor_execute", listener)
        try:
            result = list_month_summaries(self.db, current_user)
        finally:
            event.remove(self.engine, "before_cursor_execute", listener)

        self.assertEqual(len(statements), 2)
        self.assertEqual([(item.year, item.month) for item in result], [(2026, 3), (2026, 2), (2026, 1)])
        self.assertEqual(
            [(item.opening_balance, item.total_income, item.total_expenses, item.closing_balance, item.transaction_count) for item in result],
            [
                (Decimal("400.00"), Decimal("200.00"), Decimal("0.00"), Decimal("600.00"), 1),
                (Decimal("500.00"), Decimal("0.00"), Decimal("100.00"), Decimal("400.00"), 1),
                (Decimal("0.00"), Decimal("1000.00"), Decimal("200.00"), Decimal("800.00"), 2),
            ],
        )

        february = get_month(2026, 2, self.db, current_user)
        march = get_month(2026, 3, self.db, current_user)
        self.assertEqual((february.opening_balance, february.closing_balance), (Decimal("500.00"), Decimal("400.00")))
        self.assertEqual((march.opening_balance, march.closing_balance), (Decimal("400.00"), Decimal("600.00")))

        comparison_date = date(2026, 2, 15)
        for target_month in (1, 2, 3):
            month_data = get_month(2026, target_month, self.db, current_user)
            self.assertEqual(
                _build_month_summary(self.db, 2026, target_month, current_user.id, today=comparison_date),
                _summarize_month_data(month_data, today=comparison_date),
            )


if __name__ == "__main__":
    unittest.main()
