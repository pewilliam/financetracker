import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CardSubscription, CardSubscriptionSkip, CreditCard, Invoice, InvoiceItem, User, Wallet
from app.routers.cards import create_card_purchase
from app.routers.invoices import delete_invoice_item, present_invoices
from app.routers.subscriptions import cancel_card_subscription, list_card_subscriptions, update_card_subscription
from app.schemas.invoices import PurchaseCreate
from app.schemas.subscriptions import CardSubscriptionOut, CardSubscriptionUpdate
from app.schemas.installments import InstallmentCreate, InstallmentDraftIn
from app.routers.installments import create_installment
from app.services.credit_cards import committed_by_card, invoice_period, shift_month
from app.services.subscriptions import (
    apply_subscription_projections,
    charge_date_for_cycle,
    first_charge_on_or_after,
    materialize_due_subscriptions,
    next_cycle_due,
    update_card_subscription as save_card_subscription,
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

    def _add_subscription(
        self,
        charge_day=20,
        start=date(2026, 9, 20),
        amount="55.00",
        billing_interval_months=1,
        term_kind="indefinite",
        term_months=None,
        term_end_date=None,
    ):
        subscription = CardSubscription(
            user_id=self.user.id,
            credit_card_id=self.card.id,
            description="Netflix",
            amount=Decimal(amount),
            charge_day=charge_day,
            start_date=start,
            billing_interval_months=billing_interval_months,
            term_kind=term_kind,
            term_months=term_months,
            term_end_date=term_end_date,
            active=True,
        )
        self.db.add(subscription)
        self.db.commit()
        return subscription

    def _update(self, subscription, today=TODAY, **fields):
        payload = CardSubscriptionUpdate(
            description=fields.get("description", subscription.description),
            amount=Decimal(str(fields.get("amount", subscription.amount))),
            category_ids=fields.get("category_ids", list(subscription.category_ids)),
            credit_card_id=fields.get("credit_card_id", subscription.credit_card_id),
            charge_day=fields.get("charge_day", subscription.charge_day),
            billing_period=fields.get("billing_period", "monthly"),
            term_kind=fields.get("term_kind", subscription.term_kind or "indefinite"),
            term_months=fields.get("term_months", subscription.term_months),
            term_end_date=fields.get("term_end_date", subscription.term_end_date),
        )
        save_card_subscription(self.db, self.user, subscription.id, payload, today=today)
        self.db.commit()
        self.db.refresh(subscription)
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

    def test_indefinite_projection_stays_on_the_current_and_next_invoice(self):
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

        october = by_due[date(2026, 10, 5)]
        november = by_due[date(2026, 11, 5)]
        january = by_due[date(2027, 1, 5)]
        self.assertNotIn(date(2026, 12, 5), by_due)
        self.assertNotIn(date(2027, 2, 5), by_due)
        self.assertFalse(october.is_projected)
        self.assertEqual(october.total_amount, Decimal("100.00"))
        self.assertEqual(october.projected_amount, Decimal("55.00"))
        self.assertEqual(october.projected_total, Decimal("155.00"))
        self.assertTrue(november.is_projected)
        self.assertEqual(november.projected_amount, Decimal("55.00"))
        self.assertEqual(january.total_amount, Decimal("100.00"))
        self.assertEqual(january.projected_amount, Decimal("0.00"))
        self.assertEqual(self.db.query(Invoice).count(), 2)
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

    def test_finite_plan_creates_invoices_without_using_the_limit(self):
        self._add_subscription(term_kind="months", term_months=12)
        presented = self._project()
        dues = sorted(invoice.due_date for invoice in presented)
        self.assertEqual(len(dues), 12)
        self.assertEqual(dues[0], date(2026, 10, 5))
        self.assertEqual(dues[-1], date(2027, 9, 5))
        self.assertEqual(self.db.query(Invoice).count(), 12)
        self.assertEqual(self.db.query(InvoiceItem).count(), 0)
        self.assertTrue(all(invoice.is_projected and invoice.id > 0 for invoice in presented))
        self.assertTrue(all(invoice.projected_amount == Decimal("55.00") for invoice in presented))
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id]).get(self.card.id, Decimal("0.00")), Decimal("0.00"))

    def test_finite_plan_covers_gaps_and_stops_at_the_commitment(self):
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
        self._add_subscription(term_kind="months", term_months=4)
        presented = self._project()
        by_due = {invoice.due_date: invoice for invoice in presented}
        self.assertEqual(
            set(by_due),
            {date(2026, 10, 5), date(2026, 11, 5), date(2026, 12, 5), date(2027, 1, 5)},
        )
        self.assertFalse(by_due[date(2026, 10, 5)].is_projected)
        self.assertEqual(by_due[date(2026, 10, 5)].total_amount, Decimal("100.00"))
        self.assertEqual(by_due[date(2026, 10, 5)].projected_amount, Decimal("55.00"))
        self.assertTrue(by_due[date(2026, 11, 5)].is_projected)
        self.assertGreater(by_due[date(2026, 11, 5)].id, 0)
        self.assertEqual(by_due[date(2027, 1, 5)].total_amount, Decimal("100.00"))
        self.assertEqual(by_due[date(2027, 1, 5)].projected_amount, Decimal("55.00"))
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id])[self.card.id], Decimal("200.00"))

    def test_finite_charge_posts_on_its_date_and_keeps_the_rest_projected(self):
        self._add_subscription(start=date(2026, 9, 20), term_kind="months", term_months=12)
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 9, 20))
        self.db.commit()
        presented = apply_subscription_projections(
            self.db,
            self.user.id,
            self.db.query(Invoice).all(),
            include_virtual=True,
            today=date(2026, 9, 20),
        )
        self.assertEqual(self.db.query(Invoice).count(), 12)
        october = next(invoice for invoice in presented if invoice.due_date == date(2026, 10, 5))
        projected = [invoice for invoice in presented if invoice.is_projected]
        self.assertFalse(october.is_projected)
        self.assertEqual(october.total_amount, Decimal("55.00"))
        self.assertEqual(october.projected_amount, Decimal("0.00"))
        self.assertEqual(len(projected), 11)
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id])[self.card.id], Decimal("55.00"))

    def test_finite_term_does_not_project_after_it_ends(self):
        self._add_subscription(start=date(2026, 9, 20), term_kind="months", term_months=1)
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 9, 20))
        self.db.commit()
        presented = apply_subscription_projections(
            self.db,
            self.user.id,
            self.db.query(Invoice).all(),
            include_virtual=True,
            today=date(2026, 9, 20),
        )
        self.assertEqual(len(presented), 1)
        self.assertEqual(self.db.query(Invoice).count(), 1)
        self.assertEqual(presented[0].total_amount, Decimal("55.00"))
        self.assertEqual(presented[0].projected_amount, Decimal("0.00"))
        self.assertFalse(presented[0].is_projected)

    def test_end_date_includes_a_charge_on_the_final_day(self):
        self._add_subscription(term_kind="end_date", term_end_date=date(2026, 11, 20))
        presented = self._project()
        charges = sorted(item.charge_date for invoice in presented for item in invoice.projected_items)
        self.assertEqual(charges, [date(2026, 9, 20), date(2026, 10, 20), date(2026, 11, 20)])
        self.assertEqual(self.db.query(Invoice).count(), 3)

    def test_billing_periods_space_the_charges(self):
        cases = [
            (1, 12, 12),
            (2, 12, 6),
            (3, 12, 4),
            (6, 12, 2),
            (12, 12, 1),
            (12, 24, 2),
        ]
        for interval, months, expected in cases:
            with self.subTest(interval=interval, months=months):
                self.db.query(InvoiceItem).delete()
                self.db.query(Invoice).delete()
                self.db.query(CardSubscription).delete()
                self.db.commit()
                self._add_subscription(
                    billing_interval_months=interval,
                    term_kind="months",
                    term_months=months,
                )
                presented = self._project()
                charges = sorted(item.charge_date for invoice in presented for item in invoice.projected_items)
                self.assertEqual(len(charges), expected)
                self.assertEqual(self.db.query(Invoice).count(), expected)
                if len(charges) >= 2:
                    gap = (charges[1].year * 12 + charges[1].month) - (charges[0].year * 12 + charges[0].month)
                    self.assertEqual(gap, interval)

    def test_bimonthly_posts_only_on_its_cadence(self):
        self._add_subscription(
            start=date(2026, 9, 20),
            billing_interval_months=2,
            term_kind="months",
            term_months=6,
        )
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 11, 20))
        self.db.commit()
        dates = sorted(item.subscription_charge_date for item in self.db.query(InvoiceItem).all())
        self.assertEqual(dates, [date(2026, 9, 20), date(2026, 11, 20)])

    def test_indefinite_bimonthly_skips_months_without_a_charge(self):
        self._add_subscription(billing_interval_months=2)
        presented = self._project()
        dues = sorted(invoice.due_date for invoice in presented)
        self.assertEqual(dues, [date(2026, 10, 5)])
        self.assertEqual(self.db.query(Invoice).count(), 0)
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id]).get(self.card.id, Decimal("0.00")), Decimal("0.00"))

    def test_cancelling_a_finite_plan_keeps_posted_charges_and_removes_future_shells(self):
        subscription = self._add_subscription(start=date(2026, 9, 20), term_kind="months", term_months=12)
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 9, 20))
        self.db.commit()
        apply_subscription_projections(
            self.db,
            self.user.id,
            self.db.query(Invoice).all(),
            include_virtual=True,
            today=date(2026, 9, 20),
        )
        self.db.commit()
        self.assertEqual(self.db.query(Invoice).count(), 12)
        cancel_card_subscription(subscription.id, self.db, self.user)
        self.assertEqual(self.db.query(Invoice).count(), 1)
        self.assertEqual(self.db.query(InvoiceItem).count(), 1)
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

    def test_route_stores_a_finite_monthly_plan_without_using_the_limit(self):
        today = date.today()
        if today.day < 25:
            purchase_date = date(today.year, today.month, min(today.day + 1, 24))
        else:
            year, month = shift_month(today.year, today.month, 1)
            purchase_date = date(year, month, 1)
        create_card_purchase(
            self.card.id,
            PurchaseCreate(
                description="Academia",
                amount=Decimal("109.90"),
                purchase_date=purchase_date,
                recurring=True,
                charge_day=purchase_date.day,
                billing_period="monthly",
                term_kind="months",
                term_months=12,
            ),
            self.db,
            self.user,
        )
        self.assertEqual(self.db.query(Invoice).count(), 12)
        self.assertEqual(self.db.query(InvoiceItem).count(), 0)
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id]).get(self.card.id, Decimal("0.00")), Decimal("0.00"))
        payload = CardSubscriptionOut.model_validate(list_card_subscriptions(self.db, self.user)[0])
        self.assertEqual(payload.description, "Academia")
        self.assertEqual(payload.billing_period, "monthly")
        self.assertEqual(payload.billing_interval_months, 1)
        self.assertEqual(payload.term_kind, "months")
        self.assertEqual(payload.term_months, 12)
        self.assertIsNone(payload.term_end_date)

    def test_editing_keeps_the_posted_charge_and_updates_the_forecast(self):
        subscription = self._add_subscription(start=date(2026, 9, 20), amount="55.00", term_kind="months", term_months=12)
        materialize_due_subscriptions(self.db, self.user, today=date(2026, 9, 20))
        self.db.commit()
        apply_subscription_projections(
            self.db,
            self.user.id,
            self.db.query(Invoice).all(),
            include_virtual=True,
            today=date(2026, 9, 20),
        )
        self.db.commit()
        self._update(
            subscription,
            today=date(2026, 9, 20),
            description="Academia",
            amount="80.00",
            charge_day=24,
        )
        posted = self.db.query(InvoiceItem).one()
        self.assertEqual(posted.description, "Netflix")
        self.assertEqual(posted.amount, Decimal("55.00"))
        self.assertEqual(posted.subscription_charge_date, date(2026, 9, 20))
        self.assertEqual(subscription.start_date, date(2026, 9, 20))
        self.assertEqual(subscription.description, "Academia")
        self.assertEqual(self.db.query(Invoice).count(), 12)
        presented = apply_subscription_projections(
            self.db,
            self.user.id,
            self.db.query(Invoice).all(),
            include_virtual=True,
            today=date(2026, 9, 20),
        )
        forecasts = sorted(
            (item for invoice in presented for item in invoice.projected_items),
            key=lambda item: item.charge_date,
        )
        self.assertTrue(forecasts)
        self.assertTrue(all(item.amount == Decimal("80.00") and item.description == "Academia" for item in forecasts))
        self.assertEqual(forecasts[0].charge_date, date(2026, 10, 24))
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id])[self.card.id], Decimal("55.00"))

    def test_shrinking_the_term_removes_unused_projection_shells(self):
        subscription = self._add_subscription(term_kind="months", term_months=12)
        self._project()
        self.assertEqual(self.db.query(Invoice).count(), 12)
        self._update(subscription, term_months=2)
        self.assertEqual(self.db.query(Invoice).count(), 2)
        presented = self._project()
        charges = sorted(item.charge_date for invoice in presented for item in invoice.projected_items)
        self.assertEqual(charges, [date(2026, 9, 20), date(2026, 10, 20)])
        self.assertEqual(committed_by_card(self.db, self.user.id, [self.card.id]).get(self.card.id, Decimal("0.00")), Decimal("0.00"))

    def test_changing_to_quarterly_keeps_only_the_new_cadence(self):
        subscription = self._add_subscription(term_kind="months", term_months=12)
        self._project()
        self._update(subscription, billing_period="quarterly")
        self.assertEqual(self.db.query(Invoice).count(), 4)
        self.assertEqual(subscription.billing_interval_months, 3)
        presented = self._project()
        charges = sorted(item.charge_date for invoice in presented for item in invoice.projected_items)
        self.assertEqual(charges, [date(2026, 9, 20), date(2026, 12, 20), date(2027, 3, 20), date(2027, 6, 20)])

    def test_moving_the_card_releases_the_old_shells(self):
        other = CreditCard(
            user_id=self.user.id,
            name="Inter",
            color="#FF7A00",
            due_day=5,
            closing_day=25,
            credit_limit=Decimal("2000.00"),
            active=True,
        )
        self.db.add(other)
        self.db.commit()
        subscription = self._add_subscription(term_kind="months", term_months=3)
        self._project()
        self.assertEqual(self.db.query(Invoice).filter(Invoice.credit_card_id == self.card.id).count(), 3)
        self._update(subscription, credit_card_id=other.id)
        self.assertEqual(self.db.query(Invoice).filter(Invoice.credit_card_id == self.card.id).count(), 0)
        self.assertEqual(self.db.query(Invoice).filter(Invoice.credit_card_id == other.id).count(), 3)
        self.assertEqual(subscription.credit_card_id, other.id)

    def test_charge_day_realigns_when_nothing_was_posted(self):
        subscription = self._add_subscription(term_kind="months", term_months=2)
        self._update(subscription, charge_day=28)
        self.assertEqual(subscription.start_date, date(2026, 9, 28))
        presented = self._project()
        charges = sorted(item.charge_date for invoice in presented for item in invoice.projected_items)
        self.assertEqual(charges, [date(2026, 9, 28), date(2026, 10, 28)])
        dues = sorted(invoice.due_date for invoice in presented)
        self.assertEqual(dues, [date(2026, 11, 5), date(2026, 12, 5)])

    def test_editing_an_ended_subscription_is_rejected(self):
        subscription = self._add_subscription()
        subscription.active = False
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            self._update(subscription, description="Nope")
        self.assertEqual(caught.exception.status_code, 400)
        self.db.refresh(subscription)
        self.assertEqual(subscription.description, "Netflix")

    def test_route_updates_an_active_subscription(self):
        subscription = self._add_subscription(start=date(2027, 1, 15), charge_day=15)
        updated = update_card_subscription(
            subscription.id,
            CardSubscriptionUpdate(
                description="Disney",
                amount=Decimal("34.90"),
                credit_card_id=self.card.id,
                charge_day=15,
                billing_period="monthly",
                term_kind="indefinite",
            ),
            self.db,
            self.user,
        )
        payload = CardSubscriptionOut.model_validate(updated)
        self.assertEqual(payload.description, "Disney")
        self.assertEqual(payload.amount, Decimal("34.90"))
        self.assertEqual(payload.card_name, "Nubank")
        self.assertTrue(payload.active)
