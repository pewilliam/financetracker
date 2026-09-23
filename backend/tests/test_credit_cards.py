import sqlite3
import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CreditCard, InstallmentItem, Invoice, InvoiceItem, User, Wallet
from app.routers.cards import create_card_purchase, update_card
from app.routers.installments import create_installment
from app.routers.invoices import update_invoice, update_invoice_item
from app.routers.months import _build_month_data
from app.schemas.cards import CardUpdate
from app.schemas.installments import InstallmentCreate
from app.schemas.invoices import InvoiceItemUpdate, InvoiceUpdate, PurchaseCreate
from app.services.credit_cards import get_or_create_invoice, invoice_period, legacy_closing_day
from app.services.invoices import create_invoice_with_transaction, invoice_payment_date


class InvoicePeriodTests(unittest.TestCase):
    def test_purchase_on_closing_day_starts_the_next_cycle(self):
        closing, due = invoice_period(25, 5, date(2026, 3, 25))
        self.assertEqual(closing, date(2026, 4, 25))
        self.assertEqual(due, date(2026, 5, 5))

    def test_purchase_after_closing_moves_to_the_next_cycle(self):
        closing, due = invoice_period(25, 5, date(2026, 3, 26))
        self.assertEqual(closing, date(2026, 4, 25))
        self.assertEqual(due, date(2026, 5, 5))

    def test_purchase_before_closing_uses_the_current_cycle(self):
        self.assertEqual(invoice_period(25, 5, date(2026, 3, 24))[1], date(2026, 4, 5))

    def test_due_day_after_closing_stays_in_the_closing_month(self):
        self.assertEqual(invoice_period(5, 10, date(2026, 3, 4)), (date(2026, 3, 5), date(2026, 3, 10)))
        self.assertEqual(invoice_period(5, 10, date(2026, 3, 5)), (date(2026, 4, 5), date(2026, 4, 10)))
        self.assertEqual(invoice_period(5, 10, date(2026, 3, 6))[1], date(2026, 4, 10))

    def test_short_months_year_wrap_and_edge_days(self):
        self.assertEqual(invoice_period(31, 10, date(2026, 2, 27)), (date(2026, 2, 28), date(2026, 3, 10)))
        self.assertEqual(invoice_period(31, 10, date(2026, 2, 28)), (date(2026, 3, 31), date(2026, 4, 10)))
        self.assertEqual(invoice_period(31, 10, date(2024, 2, 28)), (date(2024, 2, 29), date(2024, 3, 10)))
        self.assertEqual(invoice_period(31, 10, date(2024, 2, 29)), (date(2024, 3, 31), date(2024, 4, 10)))
        self.assertEqual(invoice_period(30, 5, date(2026, 1, 31)), (date(2026, 2, 28), date(2026, 3, 5)))
        self.assertEqual(invoice_period(1, 10, date(2026, 4, 30)), (date(2026, 5, 1), date(2026, 5, 10)))
        self.assertEqual(invoice_period(1, 10, date(2026, 5, 1)), (date(2026, 6, 1), date(2026, 6, 10)))
        self.assertEqual(invoice_period(1, 10, date(2026, 5, 2)), (date(2026, 6, 1), date(2026, 6, 10)))
        self.assertEqual(invoice_period(31, 31, date(2026, 1, 30)), (date(2026, 1, 31), date(2026, 2, 28)))
        self.assertEqual(invoice_period(31, 31, date(2026, 1, 31)), (date(2026, 2, 28), date(2026, 3, 31)))
        self.assertEqual(invoice_period(15, 10, date(2026, 12, 20)), (date(2027, 1, 15), date(2027, 2, 10)))
        self.assertEqual(invoice_period(15, 10, date(2026, 12, 15)), (date(2027, 1, 15), date(2027, 2, 10)))

    def test_legacy_closing_day_wraps_when_due_day_is_too_early(self):
        self.assertEqual(legacy_closing_day(10), 3)
        self.assertEqual(legacy_closing_day(8), 1)
        self.assertEqual(legacy_closing_day(7), 30)
        self.assertEqual(legacy_closing_day(1), 24)
        self.assertEqual(legacy_closing_day(31), 24)
        for due_day in range(1, 32):
            closing = legacy_closing_day(due_day)
            self.assertGreaterEqual(closing, 1)
            self.assertLessEqual(closing, 31)


class CreditCardFlowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Ana", email="ana@example.com", password_hash="hash", allow_overdue_invoice_edits=True)
        self.other = User(name="Bruno", email="bruno@example.com", password_hash="hash")
        self.db.add_all([self.user, self.other])
        self.db.flush()
        self.wallet = Wallet(
            user_id=self.user.id,
            name="Principal",
            type="checking",
            initial_balance=Decimal("0.00"),
            tracking_started_on=date(2026, 1, 1),
            is_primary=True,
        )
        self.card = CreditCard(
            user_id=self.user.id,
            name="Nubank",
            color="#820AD1",
            due_day=5,
            closing_day=25,
            credit_limit=Decimal("500.00"),
            active=True,
        )
        self.db.add_all([self.wallet, self.card])
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_get_or_create_reuses_the_same_cycle_invoice(self):
        first = get_or_create_invoice(self.db, self.user.id, self.card, date(2026, 10, 20))
        second = get_or_create_invoice(self.db, self.user.id, self.card, date(2026, 10, 10))
        self.db.flush()
        self.assertEqual(first.id, second.id)
        self.assertEqual(first.due_date, date(2026, 11, 5))
        self.assertEqual(self.db.query(Invoice).count(), 1)

    def test_another_user_cannot_use_the_card(self):
        with self.assertRaises(HTTPException) as caught:
            get_or_create_invoice(self.db, self.other.id, self.card, date(2026, 10, 20))
        self.assertEqual(caught.exception.status_code, 404)

    def test_purchase_is_attached_to_the_cycle_invoice(self):
        invoice = create_card_purchase(
            self.card.id,
            PurchaseCreate(description="Mercado", amount=Decimal("42.50"), purchase_date=date(2026, 10, 20)),
            self.db,
            self.user,
        )
        self.assertEqual(invoice.credit_card_id, self.card.id)
        self.assertEqual(invoice.due_date, date(2026, 11, 5))
        self.assertEqual(invoice.total_amount, Decimal("42.50"))
        self.assertEqual(invoice.items[0].purchase_date, date(2026, 10, 20))
        self.assertEqual(invoice.linked_transaction.wallet_id, self.wallet.id)

    def test_card_wallet_is_preferred_over_the_primary_wallet(self):
        extra = Wallet(
            user_id=self.user.id,
            name="Reserva",
            type="reserve",
            initial_balance=Decimal("0.00"),
            tracking_started_on=date(2026, 1, 1),
            active=True,
        )
        self.db.add(extra)
        self.db.flush()
        self.card.default_wallet_id = extra.id
        invoice = get_or_create_invoice(self.db, self.user.id, self.card, date(2026, 10, 20))
        self.assertEqual(invoice.linked_transaction.wallet_id, extra.id)

    def test_changing_purchase_date_moves_the_item(self):
        invoice = create_card_purchase(
            self.card.id,
            PurchaseCreate(description="Livro", amount=Decimal("30.00"), purchase_date=date(2026, 10, 20)),
            self.db,
            self.user,
        )
        item = invoice.items[0]
        moved = update_invoice_item(
            invoice.id,
            item.id,
            InvoiceItemUpdate(description="Livro", amount=Decimal("30.00"), purchase_date=date(2026, 10, 26)),
            self.db,
            self.user,
        )
        self.db.expire_all()
        origin = self.db.get(Invoice, invoice.id)
        self.assertEqual(moved.due_date, date(2026, 12, 5))
        self.assertEqual(moved.total_amount, Decimal("30.00"))
        self.assertEqual(origin.total_amount, Decimal("0.00"))
        self.assertEqual(len(origin.items), 0)

    def test_installments_follow_the_card_calendar(self):
        purchase = create_installment(
            InstallmentCreate(
                description="Notebook",
                total_amount=Decimal("300.00"),
                installment_count=3,
                credit_card_id=self.card.id,
                first_purchase_date=date(2026, 10, 20),
            ),
            self.db,
            self.user,
        )
        due_dates = [item.invoice.due_date for item in purchase.items]
        self.assertEqual(due_dates, [date(2026, 11, 5), date(2026, 12, 5), date(2027, 1, 5)])
        self.assertEqual(self.db.query(InstallmentItem).count(), 3)
        self.assertEqual(self.db.query(Invoice).count(), 3)

    def test_purchase_on_the_closing_day_joins_the_following_invoice(self):
        invoice = create_card_purchase(
            self.card.id,
            PurchaseCreate(description="Fechamento", amount=Decimal("15.00"), purchase_date=date(2026, 10, 25)),
            self.db,
            self.user,
        )
        self.assertEqual(invoice.due_date, date(2026, 12, 5))
        previous = create_card_purchase(
            self.card.id,
            PurchaseCreate(description="Véspera", amount=Decimal("10.00"), purchase_date=date(2026, 10, 24)),
            self.db,
            self.user,
        )
        self.assertEqual(previous.due_date, date(2026, 11, 5))

    def test_payment_forecast_dates_the_monthly_control_entry(self):
        self.card.payment_forecast_day = 2
        invoice = create_card_purchase(
            self.card.id,
            PurchaseCreate(description="Mercado", amount=Decimal("42.50"), purchase_date=date(2026, 10, 20)),
            self.db,
            self.user,
        )
        self.assertEqual(invoice.due_date, date(2026, 11, 5))
        self.assertEqual(invoice.linked_transaction.date, date(2026, 10, 2))
        self.assertEqual(
            invoice_payment_date(date(2026, 3, 5), 31, "day", due_day=5, closing_day=25),
            date(2026, 2, 28),
        )

        october = _build_month_data(self.db, 2026, 10, self.user.id)
        placed = [
            transaction
            for day in october.days
            for transaction in day.transactions
            if transaction.invoice_id == invoice.id
        ]
        self.assertEqual([item.date for item in placed], [date(2026, 10, 2)])
        november = _build_month_data(self.db, 2026, 11, self.user.id)
        november_invoice = [
            transaction
            for day in november.days
            for transaction in day.transactions
            if transaction.invoice_id == invoice.id
        ]
        self.assertEqual(november_invoice, [])

        paid = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 8, 5))
        paid.total_amount = Decimal("80.00")
        paid.paid = True
        paid.linked_transaction.amount = Decimal("80.00")
        paid.linked_transaction.date = date(2026, 8, 5)
        self.db.commit()

        update_card(
            self.card.id,
            CardUpdate(payment_forecast_day=1),
            self.db,
            self.user,
        )
        self.db.expire_all()
        open_invoice = self.db.get(Invoice, invoice.id)
        settled = self.db.get(Invoice, paid.id)
        self.assertEqual(open_invoice.due_date, date(2026, 11, 5))
        self.assertEqual(open_invoice.linked_transaction.date, date(2026, 10, 1))
        self.assertEqual(settled.linked_transaction.date, date(2026, 8, 5))

        update_card(
            self.card.id,
            CardUpdate(payment_forecast_day=None),
            self.db,
            self.user,
        )
        self.db.expire_all()
        open_invoice = self.db.get(Invoice, invoice.id)
        self.assertEqual(open_invoice.linked_transaction.date, date(2026, 11, 5))

    def test_forecast_rules_and_open_invoices_follow_the_card(self):
        self.assertEqual(
            invoice_payment_date(date(2026, 3, 5), 31, "day", due_day=5, closing_day=25),
            date(2026, 2, 28),
        )
        self.assertEqual(
            invoice_payment_date(date(2024, 3, 5), 31, "day", due_day=5, closing_day=25),
            date(2024, 2, 29),
        )
        self.assertEqual(
            invoice_payment_date(date(2026, 3, 5), None, "last", due_day=5, closing_day=25),
            date(2026, 2, 28),
        )
        self.assertEqual(
            invoice_payment_date(date(2026, 5, 5), None, "first", due_day=5, closing_day=25),
            date(2026, 4, 1),
        )

        drifted = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 11, 18))
        drifted.total_amount = Decimal("30.00")
        paid = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 8, 5))
        paid.paid = True
        paid.linked_transaction.date = date(2026, 8, 5)
        self.db.commit()

        update_card(
            self.card.id,
            CardUpdate(due_day=10, payment_forecast_kind="last"),
            self.db,
            self.user,
        )
        self.db.expire_all()
        open_invoice = self.db.get(Invoice, drifted.id)
        settled = self.db.get(Invoice, paid.id)
        self.assertEqual(open_invoice.due_date, date(2026, 11, 10))
        self.assertEqual(open_invoice.linked_transaction.date, date(2026, 10, 31))
        self.assertEqual(settled.due_date, date(2026, 8, 5))
        self.assertEqual(settled.linked_transaction.date, date(2026, 8, 5))
        self.assertEqual(self.db.get(CreditCard, self.card.id).payment_forecast_kind, "last")
        self.assertIsNone(self.db.get(CreditCard, self.card.id).payment_forecast_day)

        moved = update_invoice(
            open_invoice.id,
            InvoiceUpdate(planned_payment_date=date(2026, 12, 18)),
            self.db,
            self.user,
        )
        self.assertEqual(moved.due_date, date(2026, 11, 10))
        self.assertEqual(moved.planned_payment_date, date(2026, 12, 18))
        self.assertEqual(moved.linked_transaction.date, date(2026, 12, 18))

        update_card(
            self.card.id,
            CardUpdate(payment_forecast_kind="day", payment_forecast_day=2),
            self.db,
            self.user,
        )
        self.db.expire_all()
        kept = self.db.get(Invoice, open_invoice.id)
        self.assertEqual(kept.due_date, date(2026, 11, 10))
        self.assertEqual(kept.linked_transaction.date, date(2026, 12, 18))

    def test_due_before_closing_is_the_following_month(self):
        self.card.closing_day = 28
        self.card.due_day = 30
        invoice = create_card_purchase(
            self.card.id,
            PurchaseCreate(description="Mercado Pago", amount=Decimal("616.02"), purchase_date=date(2026, 9, 23)),
            self.db,
            self.user,
        )
        self.assertEqual(invoice.due_date, date(2026, 9, 30))

        update_card(
            self.card.id,
            CardUpdate(closing_day=29, due_day=5, payment_forecast_kind="day", payment_forecast_day=30),
            self.db,
            self.user,
        )
        self.db.expire_all()
        current = self.db.get(Invoice, invoice.id)
        self.assertEqual(current.due_date, date(2026, 10, 5))
        self.assertEqual(current.linked_transaction.date, date(2026, 9, 30))

    def test_forecast_change_does_not_merge_open_invoices(self):
        first = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 9, 5))
        second = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 9, 18))
        self.db.commit()

        update_card(
            self.card.id,
            CardUpdate(payment_forecast_kind="day", payment_forecast_day=30),
            self.db,
            self.user,
        )
        self.db.expire_all()
        self.assertEqual(self.db.get(Invoice, first.id).due_date, date(2026, 9, 5))
        self.assertEqual(self.db.get(Invoice, second.id).due_date, date(2026, 9, 18))
        self.assertEqual(self.db.get(Invoice, first.id).linked_transaction.date, date(2026, 8, 30))
        self.assertEqual(self.db.get(Invoice, second.id).linked_transaction.date, date(2026, 8, 30))

    def test_card_save_keeps_distinct_due_dates_when_cycles_overlap(self):
        staying = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 11, 5))
        moving = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 10, 20))
        self.db.add(InvoiceItem(
            invoice_id=staying.id,
            description="Assinatura",
            amount=Decimal("30.00"),
            purchase_date=None,
        ))
        self.db.add(InvoiceItem(
            invoice_id=moving.id,
            description="Compra",
            amount=Decimal("40.00"),
            purchase_date=date(2026, 10, 10),
        ))
        self.db.commit()

        update_card(
            self.card.id,
            CardUpdate(payment_forecast_kind="last"),
            self.db,
            self.user,
        )
        self.db.expire_all()
        self.assertEqual(self.db.get(Invoice, staying.id).due_date, date(2026, 11, 5))
        self.assertEqual(self.db.get(Invoice, moving.id).due_date, date(2026, 10, 20))
        self.assertEqual(self.db.get(Invoice, staying.id).linked_transaction.date, date(2026, 10, 31))

    def test_available_limit_uses_unpaid_invoice_totals(self):
        from app.routers.cards import list_cards

        paid = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 8, 5))
        paid.total_amount = Decimal("80.00")
        paid.paid = True
        open_invoice = create_invoice_with_transaction(self.db, self.user.id, self.card, date(2026, 11, 5))
        open_invoice.total_amount = Decimal("140.00")
        self.db.commit()

        listed = list_cards(active=None, db=self.db, current_user=self.user)
        card = listed[0]
        self.assertEqual(card.committed, Decimal("140.00"))
        self.assertEqual(card.available, Decimal("360.00"))


class CreditCardMigrationShapeTests(unittest.TestCase):
    def test_backfill_keeps_ids_and_fills_closing_and_purchase_dates(self):
        connection = sqlite3.connect(":memory:")
        connection.execute("""
            CREATE TABLE invoice_templates (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                default_due_day INTEGER NOT NULL
            )
        """)
        connection.execute("""
            CREATE TABLE invoices (
                id INTEGER PRIMARY KEY,
                template_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                due_date TEXT NOT NULL
            )
        """)
        connection.execute("""
            CREATE TABLE invoice_items (
                id INTEGER PRIMARY KEY,
                invoice_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                amount NUMERIC NOT NULL
            )
        """)
        connection.execute("INSERT INTO invoice_templates VALUES (4, 1, 'Nubank', 10)")
        connection.execute("INSERT INTO invoice_templates VALUES (5, 1, 'Inter', 1)")
        connection.execute("INSERT INTO invoices VALUES (9, 4, 1, '2026-04-10')")
        connection.execute("INSERT INTO invoices VALUES (10, 5, 1, '2026-05-01')")
        connection.execute("INSERT INTO invoice_items VALUES (3, 9, 'Mercado', 80)")
        connection.execute("INSERT INTO invoice_items VALUES (4, 10, 'Uber', 20)")

        before = {
            "templates": connection.execute("SELECT COUNT(*) FROM invoice_templates").fetchone()[0],
            "invoices": connection.execute("SELECT COUNT(*) FROM invoices").fetchone()[0],
            "items": connection.execute("SELECT COUNT(*) FROM invoice_items").fetchone()[0],
        }
        connection.execute("ALTER TABLE invoice_templates RENAME TO credit_cards")
        connection.execute("ALTER TABLE credit_cards RENAME COLUMN default_due_day TO due_day")
        connection.execute("ALTER TABLE credit_cards ADD COLUMN closing_day INTEGER")
        connection.execute(
            "UPDATE credit_cards SET closing_day = CASE "
            "WHEN due_day - 7 >= 1 THEN due_day - 7 ELSE due_day - 7 + 30 END"
        )
        connection.execute("ALTER TABLE invoices RENAME COLUMN template_id TO credit_card_id")
        connection.execute("ALTER TABLE invoice_items ADD COLUMN purchase_date TEXT")
        connection.execute(
            "UPDATE invoice_items SET purchase_date = ("
            "SELECT due_date FROM invoices WHERE invoices.id = invoice_items.invoice_id)"
        )

        self.assertEqual(connection.execute("SELECT COUNT(*) FROM credit_cards").fetchone()[0], before["templates"])
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM invoices").fetchone()[0], before["invoices"])
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM invoice_items").fetchone()[0], before["items"])
        self.assertEqual(connection.execute("SELECT id, closing_day FROM credit_cards ORDER BY id").fetchall(), [(4, 3), (5, 24)])
        self.assertEqual(connection.execute("SELECT id, credit_card_id FROM invoices ORDER BY id").fetchall(), [(9, 4), (10, 5)])
        self.assertEqual(
            connection.execute("SELECT id, purchase_date FROM invoice_items ORDER BY id").fetchall(),
            [(3, "2026-04-10"), (4, "2026-05-01")],
        )
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM invoices WHERE credit_card_id IS NULL").fetchone()[0], 0)

    def test_duplicate_cycles_are_detectable_before_the_unique_index(self):
        connection = sqlite3.connect(":memory:")
        connection.execute("CREATE TABLE invoices (credit_card_id INTEGER, due_date TEXT)")
        connection.execute("INSERT INTO invoices VALUES (1, '2026-04-10')")
        connection.execute("INSERT INTO invoices VALUES (1, '2026-04-10')")
        duplicates = connection.execute(
            "SELECT credit_card_id, due_date, COUNT(*) FROM invoices "
            "GROUP BY credit_card_id, due_date HAVING COUNT(*) > 1"
        ).fetchall()
        self.assertEqual(duplicates, [(1, "2026-04-10", 2)])


if __name__ == "__main__":
    unittest.main()
