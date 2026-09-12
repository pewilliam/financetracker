import unittest
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.main import app
from app.models import Transaction, User, Wallet, WalletAdjustment, WalletTransfer
from app.routers.wallets import adjust_wallet_balance, archive_wallet, list_wallet_movements, list_wallets, transfer_between_wallets
from app.schemas.wallets import WalletAdjustmentCreate, WalletMovementPageOut, WalletTransferCreate
from app.services.wallets import wallet_balance


class WalletTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Carteiras", email="wallets@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        start = date.today() - timedelta(days=10)
        self.primary = Wallet(user_id=self.user.id, name="Conta principal", type="checking", initial_balance=Decimal("1000.00"), tracking_started_on=start)
        self.reserve = Wallet(user_id=self.user.id, name="Caixinha", type="reserve", initial_balance=Decimal("0.00"), tracking_started_on=start)
        self.db.add_all([self.primary, self.reserve])
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_each_wallet_has_an_independent_balance_and_consolidated_total(self):
        self.db.add_all([
            Transaction(user_id=self.user.id, wallet_id=self.primary.id, date=date.today(), type="income", amount=Decimal("200.00")),
            Transaction(user_id=self.user.id, wallet_id=self.primary.id, date=date.today(), type="expense", amount=Decimal("50.00")),
        ])
        self.db.commit()

        summary = list_wallets(True, self.db, self.user)

        balances = {item["name"]: item["current_balance"] for item in summary["wallets"]}
        self.assertEqual(balances, {"Conta principal": Decimal("1150.00"), "Caixinha": Decimal("0.00")})
        self.assertEqual(summary["total_balance"], Decimal("1150.00"))

    def test_wallet_router_is_registered_in_the_application(self):
        paths = {route.path for route in app.routes}
        self.assertIn("/api/wallets", paths)
        self.assertIn("/api/wallets/transfers", paths)
        self.assertIn("/api/wallets/{wallet_id}/movements", paths)

    def test_transfer_moves_balance_without_changing_total(self):
        before = wallet_balance(self.db, self.primary) + wallet_balance(self.db, self.reserve)

        transfer_between_wallets(WalletTransferCreate(
            source_wallet_id=self.primary.id,
            destination_wallet_id=self.reserve.id,
            amount=Decimal("300.00"),
            date=date.today(),
        ), self.db, self.user)

        self.assertEqual(wallet_balance(self.db, self.primary), Decimal("700.00"))
        self.assertEqual(wallet_balance(self.db, self.reserve), Decimal("300.00"))
        self.assertEqual(wallet_balance(self.db, self.primary) + wallet_balance(self.db, self.reserve), before)
        self.assertEqual(self.db.query(WalletTransfer).count(), 1)

    def test_adjustment_is_recorded_instead_of_overwriting_initial_balance(self):
        detail = adjust_wallet_balance(self.primary.id, WalletAdjustmentCreate(
            actual_balance=Decimal("1050.00"),
            date=date.today(),
            description="Conciliação",
        ), self.db, self.user)

        self.db.refresh(self.primary)
        adjustment = self.db.query(WalletAdjustment).one()
        self.assertEqual(self.primary.initial_balance, Decimal("1000.00"))
        self.assertEqual((adjustment.amount, adjustment.balance_before, adjustment.balance_after), (
            Decimal("50.00"), Decimal("1000.00"), Decimal("1050.00")
        ))
        self.assertEqual(wallet_balance(self.db, self.primary), Decimal("1050.00"))
        self.assertEqual(detail["movements"], [])
        history = list_wallet_movements(
            self.primary.id,
            year=date.today().year,
            month=date.today().month,
            page=1,
            page_size=10,
            db=self.db,
            current_user=self.user,
        )
        validated = WalletMovementPageOut.model_validate(history)
        self.assertIn("adjustment", {movement.kind for movement in validated.items})

    def test_wallet_history_is_filtered_by_month_and_paginated(self):
        current = date.today()
        previous_month = (current.replace(day=1) - timedelta(days=1)).replace(day=1)
        self.db.add_all([
            Transaction(
                user_id=self.user.id,
                wallet_id=self.primary.id,
                date=current,
                type="income",
                amount=Decimal(index + 1),
                description=f"Movimento {index + 1}",
            )
            for index in range(12)
        ])
        self.db.add(Transaction(
            user_id=self.user.id,
            wallet_id=self.primary.id,
            date=previous_month,
            type="expense",
            amount=Decimal("999.00"),
            description="Fora do período",
        ))
        self.db.commit()

        first_page = list_wallet_movements(
            self.primary.id,
            year=current.year,
            month=current.month,
            page=1,
            page_size=5,
            db=self.db,
            current_user=self.user,
        )
        second_page = list_wallet_movements(
            self.primary.id,
            year=current.year,
            month=current.month,
            page=2,
            page_size=5,
            db=self.db,
            current_user=self.user,
        )

        expected_total = 12 + int(
            self.primary.tracking_started_on.year == current.year
            and self.primary.tracking_started_on.month == current.month
        )
        self.assertEqual(first_page["total"], expected_total)
        self.assertEqual(first_page["total_pages"], (expected_total + 4) // 5)
        self.assertEqual(len(first_page["items"]), 5)
        self.assertEqual(len(second_page["items"]), 5)
        self.assertNotIn("Fora do período", {item["description"] for item in first_page["items"] + second_page["items"]})

    def test_wallet_with_balance_cannot_be_archived_and_history_is_preserved(self):
        with self.assertRaises(HTTPException):
            archive_wallet(self.primary.id, self.db, self.user)

        transfer_between_wallets(WalletTransferCreate(
            source_wallet_id=self.primary.id,
            destination_wallet_id=self.reserve.id,
            amount=Decimal("1000.00"),
            date=date.today(),
        ), self.db, self.user)
        archived = archive_wallet(self.primary.id, self.db, self.user)

        self.assertFalse(archived["active"])
        self.assertEqual(self.db.query(WalletTransfer).count(), 1)


if __name__ == "__main__":
    unittest.main()
