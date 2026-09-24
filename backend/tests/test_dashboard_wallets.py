import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.main import app
from app.models import Transaction, User, Wallet, WalletAdjustment, WalletTransfer
from app.routers.months import _build_month_summary
from app.services.wallets import dashboard_wallet_summary


class DashboardWalletTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Dashboard", email="dashboard-wallets@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        self.today = date(2026, 9, 15)
        self.primary = Wallet(
            user_id=self.user.id, name="Conta principal", type="checking", institution="Banco",
            initial_balance=Decimal("1000.00"), tracking_started_on=date(2026, 9, 1), color="#14A078", is_primary=True,
        )
        self.reserve = Wallet(
            user_id=self.user.id, name="Caixinha", type="reserve", institution="Banco",
            initial_balance=Decimal("200.00"), tracking_started_on=date(2026, 9, 1), color="#8B5CF6",
        )
        self.db.add_all([self.primary, self.reserve])
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def summary(self):
        return dashboard_wallet_summary(self.db, self.user.id, 2026, 9, today=self.today)

    def test_dashboard_route_is_registered(self):
        paths = {route.path for route in app.routes}
        self.assertIn("/api/wallets/dashboard", paths)

    def test_active_wallets_match_the_month_consolidated_balance(self):
        self.db.add_all([
            Transaction(user_id=self.user.id, wallet_id=self.primary.id, date=date(2026, 9, 10), type="income", amount=Decimal("300.00")),
            Transaction(user_id=self.user.id, wallet_id=self.primary.id, date=date(2026, 9, 12), type="expense", amount=Decimal("40.00")),
            Transaction(user_id=self.user.id, wallet_id=self.reserve.id, date=date(2026, 9, 11), type="expense", amount=Decimal("25.00")),
        ])
        self.db.commit()

        payload = self.summary()
        month = _build_month_summary(self.db, 2026, 9, self.user.id, today=self.today)
        by_name = {item["name"]: item for item in payload["wallets"]}

        self.assertEqual(payload["active_count"], 2)
        self.assertEqual(by_name["Conta principal"]["current_balance"], Decimal("1260.00"))
        self.assertEqual(by_name["Conta principal"]["period_income"], Decimal("300.00"))
        self.assertEqual(by_name["Conta principal"]["period_expenses"], Decimal("40.00"))
        self.assertEqual(by_name["Caixinha"]["current_balance"], Decimal("175.00"))
        self.assertEqual(payload["total_balance"], Decimal("1435.00"))
        self.assertEqual(payload["total_balance"], month.current_balance)

    def test_internal_transfer_keeps_the_consolidated_total(self):
        before = self.summary()["total_balance"]
        self.db.add(WalletTransfer(
            user_id=self.user.id,
            source_wallet_id=self.primary.id,
            destination_wallet_id=self.reserve.id,
            date=date(2026, 9, 8),
            amount=Decimal("150.00"),
        ))
        self.db.commit()

        payload = self.summary()
        by_name = {item["name"]: item for item in payload["wallets"]}
        self.assertEqual(by_name["Conta principal"]["current_balance"], Decimal("850.00"))
        self.assertEqual(by_name["Caixinha"]["current_balance"], Decimal("350.00"))
        self.assertEqual(by_name["Conta principal"]["period_income"], Decimal("0.00"))
        self.assertEqual(by_name["Conta principal"]["period_expenses"], Decimal("0.00"))
        self.assertEqual(payload["total_balance"], before)
        self.assertTrue(by_name["Conta principal"]["changed_in_period"])
        self.assertTrue(by_name["Caixinha"]["changed_in_period"])

    def test_adjustment_is_separate_from_income_and_expenses(self):
        self.db.add(WalletAdjustment(
            user_id=self.user.id,
            wallet_id=self.primary.id,
            date=date(2026, 9, 9),
            amount=Decimal("80.00"),
            balance_before=Decimal("1000.00"),
            balance_after=Decimal("1080.00"),
            description="Conciliação",
        ))
        self.db.commit()

        wallet = self.summary()["wallets"][0]
        self.assertEqual(wallet["name"], "Conta principal")
        self.assertEqual(wallet["period_income"], Decimal("0.00"))
        self.assertEqual(wallet["period_expenses"], Decimal("0.00"))
        self.assertEqual(wallet["period_adjustments"], Decimal("80.00"))
        self.assertEqual(wallet["period_variation"], Decimal("80.00"))
        self.assertEqual(wallet["current_balance"], Decimal("1080.00"))

    def test_archived_wallet_is_omitted_from_the_dashboard(self):
        archived = Wallet(
            user_id=self.user.id, name="Antiga", type="cash", initial_balance=Decimal("500.00"),
            tracking_started_on=date(2026, 9, 1), active=False,
        )
        self.db.add(archived)
        self.db.flush()
        self.db.add(Transaction(
            user_id=self.user.id, wallet_id=archived.id, date=date(2026, 9, 4), type="income", amount=Decimal("50.00"),
        ))
        self.db.commit()

        payload = self.summary()
        month = _build_month_summary(self.db, 2026, 9, self.user.id, today=self.today)

        self.assertNotIn("Antiga", {item["name"] for item in payload["wallets"]})
        self.assertTrue(all(item["active"] for item in payload["wallets"]))
        self.assertEqual(payload["active_count"], 2)
        self.assertEqual(payload["total_balance"], Decimal("1200.00"))
        self.assertEqual(payload["total_balance"], month.current_balance)

    def test_balance_ignores_activity_before_tracking_starts(self):
        late = Wallet(
            user_id=self.user.id, name="Nova", type="digital", institution="App",
            initial_balance=Decimal("10.00"), tracking_started_on=date(2026, 9, 20), color="#2F80ED",
        )
        self.db.add(late)
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.user.id, wallet_id=late.id, date=date(2026, 9, 2), type="income", amount=Decimal("999.00")),
            Transaction(user_id=self.user.id, wallet_id=late.id, date=date(2026, 9, 21), type="income", amount=Decimal("15.00")),
        ])
        self.db.commit()

        card = next(item for item in self.summary()["wallets"] if item["name"] == "Nova")
        self.assertEqual(card["current_balance"], Decimal("0.00"))
        self.assertEqual(card["period_income"], Decimal("15.00"))
        self.assertEqual(card["period_variation"], Decimal("0.00"))
        self.assertTrue(card["changed_in_period"])

    def test_empty_summary_when_the_user_has_no_wallets(self):
        self.db.query(Wallet).delete()
        self.db.commit()
        payload = self.summary()
        self.assertEqual(payload, {"total_balance": Decimal("0.00"), "active_count": 0, "wallets": []})
