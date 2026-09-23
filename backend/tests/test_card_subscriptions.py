import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CardSubscription, CardSubscriptionSkip, CreditCard, Invoice, InvoiceItem, User, Wallet
from app.routers.cards import create_card_purchase
from app.routers.invoices import delete_invoice_item, present_invoices
from app.routers.subscriptions import cancel_card_subscription, list_card_subscriptions
from app.schemas.invoices import PurchaseCreate
from app.schemas.subscriptions import CardSubscriptionOut
from app.schemas.installments import InstallmentCreate, InstallmentDraftIn
from app.routers.installments import create_installment
from app.services.credit_cards import committed_by_card, invoice_period, shift_month
from app.services.subscriptions import (
    apply_subscription_projections,
    charge_date_for_cycle,
    first_charge_on_or_after,
    materialize_due_subscriptions,
    next_cycle_due,
)


TODAY = date(2026, 9, 10)


class ChargeCycleTests(unittest.TestCase):
    def test_charge_day_lands_on_the_same_invoice_as_a_purchase(self):
        cases = [
            (25, 5, date(2026, 3, 25)),
            (25, 5, date(2026, 3, 26)),
            (25, 5, date(2026, 3, 10)),
            (5, 10, date(2026, 3, 5)),
            (5, 10, date(2026, 3, 6)),
            (31, 10, date(2026, 2, 28)),
            (1, 10, date(2026, 5, 1)),
            (15, 10, date(2026, 12, 20)),
        ]
        for closing_day, due_day, purchase in cases:
            with self.subTest(purchase=purchase, closing_day=closing_day, due_day=due_day):
                _, due = invoice_period(closing_day, due_day, purchase)
                charge = charge_date_for_cycle(closing_day, due_day, due, purchase.day)
                self.assertEqual(charge, purchase)
                self.assertEqual(invoice_period(closing_day, due_day, charge)[1], due)


class CardSubscriptionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Ana", email="ana@example.com", password_hash="hash")
        self.db.add(self.user)
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
            credit_limit=Decimal("1000.00"),
            active=True,
        )
        self.db.add_all([self.wallet, self.card])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _project(self):
        materialize_due_subscriptions(self.db, self.user, today=TODAY)
        self.db.commit()
        invoices = self.db.query(Invoice).filter(Invoice.user_id == self.user.id).all()
        return apply_subscription_projections(
            self.db,
            self.user.id,
            invoices,
            include_virtual=True,
            today=TODAY,
        )

    def _add_subscription(self, charge_day=20, start=date(2026, 9, 20), amount="55.00"):
        subscription = CardSubscription(
            user_id=self.user.id,
            credit_card_id=self.card.id,
            description="Netflix",
            amount=Decimal(amount),
            charge_day=charge_day,
            start_date=start,
            active=True,
        )
        self.db.add(subscription)
        self.db.commit()
        return subscription

    def test_future_charge_is_projected_and_does_not_use_the_limit(self):
        self._add_subscription()
        presented = self._project()
        self.assertEqual(self.db.query(Invoice).count(), 0)
        self.assertEqual(self.db.query(InvoiceItem).count(), 0)
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id]).get(self.card.id, Decimal("0.00")), Decimal("0.00"))

        projected = [invoice for invoice in presented if invoice.is_projected]
        dues = sorted(invoice.due_date for invoice in projected)
        self.assertEqual(dues, [date(2026, 10, 5), date(2026, 11, 5)])
        october = next(invoice for invoice in projected if invoice.due_date == date(2026, 10, 5))
        self.assertEqual(october.total_amount, Decimal("0.00"))
        self.assertEqual(october.projected_amount, Decimal("55.00"))
        self.assertEqual(october.projected_total, Decimal("55.00"))
        self.assertEqual(october.projected_items[0].charge_date, date(2026, 9, 20))

    def test_projection_follows_real_invoices_and_skips_gaps(self):
        create_installment(
            InstallmentCreate(
                description="Notebook",
                total_amount=Decimal("200.00"),
                installment_count=2,
                credit_card_id=self.card.id,
                first_purchase_date=date(2026, 9, 10),
                items=[
                    InstallmentDraftIn(amount=Decimal("100.00"), purchase_date=date(2026, 9, 10)),
                    InstallmentDraftIn(amount=Decimal("100.00"), purchase_date=date(2026, 12, 10)),
                ],
            ),
            self.db,
            self.user,
        )
        self._add_subscription()
        presented = self._project()
        by_due = {invoice.due_date: invoice for invoice in presented}

        self.assertNotIn(date(2026, 11, 5), by_due)
        self.assertNotIn(date(2026, 12, 5), by_due)
        october = by_due[date(2026, 10, 5)]
        january = by_due[date(2027, 1, 5)]
        february = by_due[date(2027, 2, 5)]
        self.assertFalse(october.is_projected)
        self.assertEqual(october.total_amount, Decimal("100.00"))
        self.assertEqual(october.projected_amount, Decimal("55.00"))
        self.assertEqual(october.projected_total, Decimal("155.00"))
        self.assertEqual(january.total_amount, Decimal("100.00"))
        self.assertEqual(january.projected_amount, Decimal("55.00"))
        self.assertTrue(february.is_projected)
        self.assertEqual(february.total_amount, Decimal("0.00"))
        self.assertEqual(february.projected_total, Decimal("55.00"))
        committed = committed_by_card(self.db, self.user.id, [self.card.id])[self.card.id]
        self.assertEqual(committed, Decimal("200.00"))

    def test_charge_on_the_anchor_day_becomes_a_real_item(self):
        self._add_subscription(start=date(2026, 9, 20))
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 9, 20))
        self.db.commit()
        invoices = self.db.query(Invoice).all()
        self.assertEqual(len(invoices), 1)
        self.assertEqual(invoices[0].due_date, date(2026, 10, 5))
        self.assertEqual(invoices[0].total_amount, Decimal("55.00"))
        self.assertEqual(invoices[0].items[0].subscription_charge_date, date(2026, 9, 20))
        presented = apply_subscription_projections(
            self.db,
            self.user.id,
            invoices,
            include_virtual=True,
            today=date(2026, 9, 20),
        )
        october = next(invoice for invoice in presented if invoice.due_date == date(2026, 10, 5))
        november = next(invoice for invoice in presented if invoice.due_date == date(2026, 11, 5))
        self.assertEqual(october.projected_amount, Decimal("0.00"))
        self.assertEqual(october.total_amount, Decimal("55.00"))
        self.assertTrue(november.is_projected)
        self.assertEqual(november.projected_amount, Decimal("55.00"))
        self.assertEqual(november.projected_items[0].charge_date, date(2026, 10, 20))
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id])[self.card.id], Decimal("55.00"))

    def test_cancelling_keeps_posted_charges_and_drops_the_forecast(self):
        subscription = self._add_subscription(start=date(2026, 9, 20))
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 9, 20))
        self.db.commit()
        cancel_card_subscription(subscription.id, self.db, self.user)
        presented = apply_subscription_projections(
            self.db,
            self.user.id,
            self.db.query(Invoice).all(),
            include_virtual=True,
            today=date(2026, 9, 20),
        )
        self.assertEqual(len(presented), 1)
        self.assertEqual(presented[0].total_amount, Decimal("55.00"))
        self.assertEqual(presented[0].projected_amount, Decimal("0.00"))
        self.assertTrue(all(not getattr(invoice, "is_projected", False) for invoice in presented))

    def test_deleting_a_posted_charge_does_not_recreate_it(self):
        self._add_subscription(start=date(2026, 9, 20))
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 9, 20))
        self.db.commit()
        item = self.db.query(InvoiceItem).one()
        delete_invoice_item(item.invoice_id, item.id, self.db, self.user)
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 9, 20))
        self.db.commit()
        self.assertEqual(self.db.query(InvoiceItem).count(), 0)
        self.assertEqual(self.db.query(CardSubscriptionSkip).count(), 1)
        self.assertEqual(self.db.query(Invoice).one().total_amount, Decimal("0.00"))

    def test_route_creates_a_future_subscription_without_an_invoice(self):
        today = date.today()
        if today.day < 25:
            purchase_date = date(today.year, today.month, today.day + 1)
        else:
            year, month = shift_month(today.year, today.month, 1)
            purchase_date = date(year, month, 1)
        self.assertGreater(purchase_date, today)
        charge_day = purchase_date.day
        invoice = create_card_purchase(
            self.card.id,
            PurchaseCreate(
                description="Spotify",
                amount=Decimal("21.90"),
                purchase_date=purchase_date,
                recurring=True,
                charge_day=charge_day,
            ),
            self.db,
            self.user,
        )
        self.assertEqual(self.db.query(Invoice).count(), 0)
        self.assertTrue(invoice.is_projected)
        self.assertEqual(invoice.total_amount, Decimal("0.00"))
        self.assertEqual(invoice.projected_amount, Decimal("21.90"))
        self.assertEqual(first_charge_on_or_after(purchase_date, charge_day), purchase_date)
        self.assertEqual(invoice.due_date, invoice_period(25, 5, purchase_date)[1])
        listed = present_invoices(self.db, self.user, include_items=False, materialize=False)
        self.assertTrue(any(item.is_projected and item.projected_amount == Decimal("21.90") for item in listed))
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id]).get(self.card.id, Decimal("0.00")), Decimal("0.00"))
        listed_subscriptions = list_card_subscriptions(self.db, self.user)
        self.assertEqual(len(listed_subscriptions), 1)
        payload = CardSubscriptionOut.model_validate(listed_subscriptions[0])
        self.assertEqual(payload.description, "Spotify")
        self.assertEqual(payload.card_name, "Nubank")
        self.assertEqual(payload.card_color, "#820AD1")
        self.assertEqual(payload.charge_day, charge_day)
        self.assertTrue(payload.active)

    def test_next_cycle_due_uses_the_card_due_day(self):
        self.assertEqual(next_cycle_due(5, date(2026, 10, 5)), date(2026, 11, 5))
        self.assertEqual(next_cycle_due(31, date(2026, 1, 31)), date(2026, 2, 28))
