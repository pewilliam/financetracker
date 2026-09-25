import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Transaction, User, Wallet, WalletAdjustment, WalletTransfer
from app.routers.months import get_day_wallets, get_month
from app.routers.transactions import create_transaction, update_transaction
from app.schemas.transactions import TransactionCreate, TransactionUpdate
from app.services.dates import APP_TIMEZONE, app_today


class DayWalletDetailTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="dia@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        self.primary = Wallet(
            user_id=self.user.id,
            name="Conta principal",
            type="checking",
            initial_balance=Decimal("1000.00"),
            tracking_started_on=date(2026, 9, 1),
            color="#14A078",
            is_primary=True,
        )
        self.reserve = Wallet(
            user_id=self.user.id,
            name="Reserva",
            type="reserve",
            initial_balance=Decimal("500.00"),
            tracking_started_on=date(2026, 9, 1),
            color="#3B82F6",
        )
        self.db.add_all([self.primary, self.reserve])
        self.db.commit()
        self.current_user = type("CurrentUser", (), {"id": self.user.id})()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def detail(self, day, month=9, year=2026):
        return get_day_wallets(year, month, day, self.db, self.current_user)

    def wallet(self, payload, name):
        return next(item for item in payload.wallets if item.wallet_name == name)

    def test_income_expense_and_adjustment_are_separated(self):
        self.db.add_all([
            Transaction(user_id=self.user.id, wallet_id=self.primary.id, date=date(2026, 9, 14), type="income", amount=Decimal("80.00"), description="Freelance"),
            Transaction(user_id=self.user.id, wallet_id=self.primary.id, date=date(2026, 9, 14), type="expense", amount=Decimal("26.00"), description="Ônibus"),
            WalletAdjustment(
                user_id=self.user.id,
                wallet_id=self.reserve.id,
                date=date(2026, 9, 14),
                amount=Decimal("15.00"),
                balance_before=Decimal("500.00"),
                balance_after=Decimal("515.00"),
                description="Conferência",
            ),
        ])
        self.db.commit()

        payload = self.detail(14)
        primary = self.wallet(payload, "Conta principal")
        reserve = self.wallet(payload, "Reserva")

        self.assertEqual(primary.balance_before, Decimal("1000.00"))
        self.assertEqual(primary.variation, Decimal("54.00"))
        self.assertEqual(primary.balance, Decimal("1054.00"))
        self.assertEqual([item.kind for item in primary.movements], ["income", "expense"])
        self.assertEqual(primary.reasons, ["income", "expense"])
        self.assertTrue(primary.changed)
        self.assertEqual(reserve.variation, Decimal("15.00"))
        self.assertEqual(reserve.reasons, ["adjustment"])
        self.assertEqual(reserve.movements[0].description, "Conferência")
        self.assertEqual(reserve.movements[0].amount, Decimal("15.00"))
        self.assertEqual(payload.consolidated_balance, Decimal("1569.00"))
        self.assertEqual(payload.wallets_total, payload.consolidated_balance)

        month = get_month(2026, 9, self.db, self.current_user)
        self.assertEqual(payload.consolidated_balance, month.days[13].balance)

    def test_internal_transfer_does_not_change_consolidated_balance(self):
        self.db.add(WalletTransfer(
            user_id=self.user.id,
            source_wallet_id=self.primary.id,
            destination_wallet_id=self.reserve.id,
            date=date(2026, 9, 10),
            amount=Decimal("40.00"),
            description="Reserva do mês",
        ))
        self.db.commit()

        payload = self.detail(10)
        primary = self.wallet(payload, "Conta principal")
        reserve = self.wallet(payload, "Reserva")
        self.assertEqual(primary.variation, Decimal("-40.00"))
        self.assertEqual(primary.reasons, ["transfer_out"])
        self.assertFalse(primary.movements[0].counterpart_archived)
        self.assertEqual(primary.movements[0].counterpart_wallet_name, "Reserva")
        self.assertEqual(reserve.variation, Decimal("40.00"))
        self.assertEqual(reserve.reasons, ["transfer_in"])
        self.assertEqual(payload.consolidated_balance, Decimal("1500.00"))
        month = get_month(2026, 9, self.db, self.current_user)
        self.assertEqual(month.days[9].balance, Decimal("1500.00"))

    def test_archived_wallet_is_excluded_and_transfer_is_identified(self):
        archived = Wallet(
            user_id=self.user.id,
            name="Antiga",
            type="checking",
            initial_balance=Decimal("0.00"),
            tracking_started_on=date(2026, 9, 1),
            active=False,
        )
        self.db.add(archived)
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.user.id, wallet_id=archived.id, date=date(2026, 9, 12), type="expense", amount=Decimal("26.00"), description="Não entra"),
            WalletTransfer(
                user_id=self.user.id,
                source_wallet_id=self.primary.id,
                destination_wallet_id=archived.id,
                date=date(2026, 9, 12),
                amount=Decimal("30.00"),
                description="Saque antigo",
            ),
        ])
        self.db.commit()

        payload = self.detail(12)
        names = [item.wallet_name for item in payload.wallets]
        self.assertNotIn("Antiga", names)
        primary = self.wallet(payload, "Conta principal")
        self.assertEqual(primary.variation, Decimal("-30.00"))
        self.assertTrue(primary.movements[0].counterpart_archived)
        self.assertEqual(primary.movements[0].counterpart_wallet_name, "Antiga")
        self.assertEqual(payload.consolidated_balance, Decimal("1470.00"))
        month = get_month(2026, 9, self.db, self.current_user)
        self.assertEqual(month.days[11].balance, payload.consolidated_balance)

    def test_wallet_created_mid_period_enters_on_tracking_date(self):
        created = Wallet(
            user_id=self.user.id,
            name="Viagem",
            type="cash",
            initial_balance=Decimal("200.00"),
            tracking_started_on=date(2026, 9, 18),
            color="#F59E0B",
        )
        self.db.add(created)
        self.db.flush()
        self.db.add(Transaction(
            user_id=self.user.id,
            wallet_id=created.id,
            date=date(2026, 9, 18),
            type="expense",
            amount=Decimal("20.00"),
            description="Lanche",
        ))
        self.db.commit()

        before = self.detail(17)
        self.assertNotIn("Viagem", [item.wallet_name for item in before.wallets])
        self.assertEqual(before.consolidated_balance, Decimal("1500.00"))

        payload = self.detail(18)
        created_row = self.wallet(payload, "Viagem")
        self.assertEqual(created_row.balance_before, Decimal("0.00"))
        self.assertEqual(created_row.variation, Decimal("180.00"))
        self.assertEqual(created_row.balance, Decimal("180.00"))
        self.assertEqual([item.kind for item in created_row.movements], ["initial_balance", "expense"])
        self.assertEqual(payload.consolidated_balance, Decimal("1680.00"))
        month = get_month(2026, 9, self.db, self.current_user)
        self.assertEqual(month.days[16].balance, Decimal("1500.00"))
        self.assertEqual(month.days[17].balance, payload.consolidated_balance)

    def test_unchanged_wallet_is_marked(self):
        payload = self.detail(3)
        reserve = self.wallet(payload, "Reserva")
        self.assertFalse(reserve.changed)
        self.assertEqual(reserve.reasons, ["unchanged"])
        self.assertEqual(reserve.variation, Decimal("0.00"))
        self.assertEqual(reserve.balance, Decimal("500.00"))

    def test_updating_an_expense_keeps_the_selected_wallet(self):
        created = create_transaction(
            TransactionCreate(
                date=date(2026, 9, 14),
                type="expense",
                amount=Decimal("26.00"),
                description="Ônibus",
                wallet_id=self.primary.id,
            ),
            self.db,
            self.current_user,
        )

        updated = update_transaction(
            created.id,
            TransactionUpdate(wallet_id=self.reserve.id),
            self.db,
            self.current_user,
        )

        self.assertEqual(updated.wallet_id, self.reserve.id)
        self.db.refresh(created)
        self.assertEqual(created.wallet_id, self.reserve.id)

    def test_app_today_uses_sao_paulo_timezone(self):
        utc_evening = datetime(2026, 9, 24, 1, 30, tzinfo=timezone.utc)
        with patch("app.services.dates.datetime") as clock:
            clock.now.return_value = utc_evening.astimezone(APP_TIMEZONE)
            self.assertEqual(app_today(), date(2026, 9, 23))


if __name__ == "__main__":
    unittest.main()
