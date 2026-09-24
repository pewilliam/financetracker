import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import MonthlyBalance, Receivable, ReceivablePerson, Transaction, User, Wallet, WalletAdjustment, WalletTransfer
from app.routers.months import _build_month_summary, _summarize_month_data, get_month, get_summary_series, list_month_summaries


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

        self.assertEqual(len(statements), 3)
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
        series = get_summary_series(2026, 3, 2, self.db, current_user)
        self.assertEqual([(item.year, item.month) for item in series], [(2026, 2), (2026, 3)])

        comparison_date = date(2026, 2, 15)
        for target_month in (1, 2, 3):
            month_data = get_month(2026, target_month, self.db, current_user)
            self.assertEqual(
                _build_month_summary(self.db, 2026, target_month, current_user.id, today=comparison_date),
                _summarize_month_data(month_data, today=comparison_date),
            )

    def test_current_month_card_uses_only_realized_transactions_for_current_balance(self):
        class FixedDate(date):
            @classmethod
            def today(cls):
                return cls(2026, 2, 15)

        self.db.add_all([
            MonthlyBalance(user_id=self.user.id, year=2026, month=2, opening_balance=Decimal("500.00")),
            Transaction(user_id=self.user.id, date=date(2026, 2, 10), type="income", amount=Decimal("200.00"), description="Recebido"),
            Transaction(user_id=self.user.id, date=date(2026, 2, 20), type="expense", amount=Decimal("75.00"), description="Previsto"),
        ])
        self.db.commit()
        current_user = type("CurrentUser", (), {"id": self.user.id})()

        with patch("app.routers.months.app_today", return_value=date(2026, 2, 15)):
            result = list_month_summaries(self.db, current_user)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].current_balance, Decimal("700.00"))
        self.assertEqual(result[0].closing_balance, Decimal("625.00"))

    def test_dashboard_ignores_transactions_from_archived_wallets(self):
        class FixedDate(date):
            @classmethod
            def today(cls):
                return cls(2026, 2, 15)

        primary = Wallet(
            user_id=self.user.id,
            name="Conta ativa",
            type="checking",
            initial_balance=Decimal("1000.00"),
            tracking_started_on=date(2026, 1, 1),
            is_primary=True,
        )
        archived = Wallet(
            user_id=self.user.id,
            name="Conta arquivada",
            type="checking",
            initial_balance=Decimal("0.00"),
            tracking_started_on=date(2026, 1, 1),
            active=False,
        )
        self.db.add_all([primary, archived])
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.user.id, wallet_id=primary.id, date=date(2026, 2, 14), type="income", amount=Decimal("6.11")),
            Transaction(user_id=self.user.id, wallet_id=archived.id, date=date(2026, 2, 14), type="expense", amount=Decimal("26.00")),
        ])
        self.db.commit()

        with patch("app.routers.months.app_today", return_value=date(2026, 2, 15)):
            summary = _build_month_summary(self.db, 2026, 2, self.user.id)
            month = get_month(2026, 2, self.db, type("CurrentUser", (), {"id": self.user.id})())

        self.assertEqual(summary.current_balance, Decimal("1006.11"))
        self.assertEqual(summary.current_balance, month.days[14].balance)

    def test_wallet_month_summaries_use_a_fixed_number_of_queries(self):
        primary = Wallet(
            user_id=self.user.id,
            name="Conta principal",
            type="checking",
            initial_balance=Decimal("1000.00"),
            tracking_started_on=date(2026, 1, 1),
            is_primary=True,
        )
        reserve = Wallet(
            user_id=self.user.id,
            name="Reserva",
            type="reserve",
            initial_balance=Decimal("200.00"),
            tracking_started_on=date(2026, 2, 15),
        )
        self.db.add_all([primary, reserve])
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.user.id, wallet_id=primary.id, date=date(2026, 1, 5), type="income", amount=Decimal("1000.00")),
            Transaction(user_id=self.user.id, wallet_id=primary.id, date=date(2026, 1, 10), type="expense", amount=Decimal("200.00")),
            Transaction(user_id=self.user.id, wallet_id=primary.id, date=date(2026, 2, 12), type="expense", amount=Decimal("100.00")),
            Transaction(user_id=self.user.id, wallet_id=reserve.id, date=date(2026, 3, 8), type="income", amount=Decimal("200.00")),
            WalletAdjustment(
                user_id=self.user.id,
                wallet_id=reserve.id,
                date=date(2026, 2, 20),
                amount=Decimal("25.00"),
                balance_before=Decimal("250.00"),
                balance_after=Decimal("275.00"),
            ),
            WalletTransfer(
                user_id=self.user.id,
                source_wallet_id=primary.id,
                destination_wallet_id=reserve.id,
                date=date(2026, 2, 18),
                amount=Decimal("50.00"),
            ),
        ])
        self.db.commit()
        current_user = type("CurrentUser", (), {"id": self.user.id})()

        expected = {}
        for target_month in (1, 2, 3):
            data = get_month(2026, target_month, self.db, current_user)
            expected[target_month] = (
                data.opening_balance,
                data.total_income,
                data.total_expenses,
                data.closing_balance,
            )

        statements = []
        listener = lambda *args: statements.append(args[2])
        event.listen(self.engine, "before_cursor_execute", listener)
        try:
            result = list_month_summaries(self.db, current_user)
        finally:
            event.remove(self.engine, "before_cursor_execute", listener)

        self.assertEqual(len(statements), 5)
        self.assertEqual([(item.year, item.month) for item in result], [(2026, 3), (2026, 2), (2026, 1)])
        for item in result:
            self.assertEqual(
                (item.opening_balance, item.total_income, item.total_expenses, item.closing_balance),
                expected[item.month],
            )

    def test_month_cards_add_open_receivables_to_current_and_future_projections(self):
        class FixedDate(date):
            @classmethod
            def today(cls):
                return cls(2026, 9, 15)

        person = ReceivablePerson(user_id=self.user.id, name="Ana")
        self.db.add(person)
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.user.id, date=date(2026, 8, 5), type="income", amount=Decimal("1000.00"), description="Agosto"),
            Transaction(user_id=self.user.id, date=date(2026, 9, 5), type="income", amount=Decimal("500.00"), description="Setembro"),
            Transaction(user_id=self.user.id, date=date(2026, 10, 5), type="expense", amount=Decimal("100.00"), description="Outubro"),
            Receivable(
                user_id=self.user.id,
                person_id=person.id,
                description="Atrasado",
                total_amount=Decimal("30.00"),
                received_amount=Decimal("0.00"),
                due_date=date(2026, 8, 20),
                status="pending",
            ),
            Receivable(
                user_id=self.user.id,
                person_id=person.id,
                description="Parcial",
                total_amount=Decimal("80.00"),
                received_amount=Decimal("30.00"),
                due_date=date(2026, 9, 20),
                status="partial",
            ),
            Receivable(
                user_id=self.user.id,
                person_id=person.id,
                description="Pago",
                total_amount=Decimal("40.00"),
                received_amount=Decimal("40.00"),
                due_date=date(2026, 9, 12),
                status="paid",
            ),
            Receivable(
                user_id=self.user.id,
                person_id=person.id,
                description="Futuro",
                total_amount=Decimal("25.00"),
                received_amount=Decimal("0.00"),
                due_date=date(2026, 10, 8),
                status="pending",
            ),
        ])
        self.db.commit()
        current_user = type("CurrentUser", (), {"id": self.user.id})()

        with patch("app.routers.months.app_today", return_value=date(2026, 9, 15)):
            result = { (item.year, item.month): item for item in list_month_summaries(self.db, current_user) }

        august = result[(2026, 8)]
        september = result[(2026, 9)]
        october = result[(2026, 10)]
        self.assertEqual(august.planned_receivables_total, Decimal("0.00"))
        self.assertEqual(august.closing_balance, Decimal("1000.00"))
        self.assertEqual(september.prior_planned_receivables_total, Decimal("30.00"))
        self.assertEqual(september.planned_receivables_total, Decimal("80.00"))
        self.assertEqual(september.current_balance, Decimal("1500.00"))
        self.assertEqual(september.closing_balance, Decimal("1500.00"))
        self.assertEqual(october.prior_planned_receivables_total, Decimal("80.00"))
        self.assertEqual(october.planned_receivables_total, Decimal("105.00"))
        self.assertEqual(october.opening_balance, Decimal("1500.00"))
        self.assertEqual(october.closing_balance, Decimal("1400.00"))


if __name__ == "__main__":
    unittest.main()
