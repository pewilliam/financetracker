import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CreditCard, InstallmentItem, InstallmentPurchase, Invoice, User
from app.routers.installments import create_installment, update_installment_item
from app.schemas.installments import InstallmentCreate, InstallmentItemUpdate
from app.services.credit_cards import (
    first_installment_due_allowed,
    invoice_period,
    latest_first_installment_purchase_date,
)


class FirstInstallmentWindowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Ana", email="ana@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        self.card = CreditCard(
            user_id=self.user.id,
            name="Nubank",
            color="#820AD1",
            due_day=5,
            closing_day=25,
            active=True,
        )
        self.db.add(self.card)
        self.db.flush()
        self.today = date.today()
        self.latest = latest_first_installment_purchase_date(25, 5, self.today)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_window_includes_the_month_twelve_months_ahead(self):
        from datetime import timedelta
        _, due = invoice_period(25, 5, self.latest)
        self.assertTrue(first_installment_due_allowed(due, self.today))
        too_late = self.latest + timedelta(days=1)
        _, late_due = invoice_period(25, 5, too_late)
        self.assertFalse(first_installment_due_allowed(late_due, self.today))

    def test_later_installments_may_pass_the_window(self):
        purchase = create_installment(
            InstallmentCreate(
                description="Notebook",
                total_amount=Decimal("300.00"),
                installment_count=3,
                credit_card_id=self.card.id,
                first_purchase_date=self.latest,
            ),
            self.db,
            self.user,
        )
        self.assertEqual(len(purchase.items), 3)
        self.assertTrue(first_installment_due_allowed(purchase.items[0].invoice.due_date, self.today))
        self.assertFalse(first_installment_due_allowed(purchase.items[-1].invoice.due_date, self.today))

    def test_first_installment_beyond_twelve_months_is_rejected(self):
        from datetime import timedelta
        with self.assertRaises(HTTPException) as caught:
            create_installment(
                InstallmentCreate(
                    description="Longe",
                    total_amount=Decimal("100.00"),
                    installment_count=2,
                    credit_card_id=self.card.id,
                    first_purchase_date=self.latest + timedelta(days=1),
                ),
                self.db,
                self.user,
            )
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(self.db.query(InstallmentPurchase).count(), 0)

    def test_existing_purchase_can_keep_a_far_first_invoice(self):
        far_due = date(self.today.year + 2, self.today.month, 5)
        invoice = Invoice(user_id=self.user.id, credit_card_id=self.card.id, due_date=far_due, total_amount=Decimal("100.00"), paid=False)
        self.db.add(invoice)
        self.db.flush()
        purchase = InstallmentPurchase(
            user_id=self.user.id,
            description="Antiga",
            total_amount=Decimal("100.00"),
            installment_count=1,
            installment_value=Decimal("100.00"),
            first_invoice_id=invoice.id,
        )
        self.db.add(purchase)
        self.db.flush()
        item = InstallmentItem(
            purchase_id=purchase.id,
            invoice_id=invoice.id,
            installment_number=1,
            amount=Decimal("80.00"),
            description="Antiga (1/1)",
        )
        self.db.add(item)
        self.db.commit()

        updated = update_installment_item(
            item.id,
            InstallmentItemUpdate(invoice_id=invoice.id, amount=Decimal("90.00"), status="pending"),
            self.db,
            self.user,
        )
        self.assertEqual(updated.items[0].invoice_id, invoice.id)
        self.assertEqual(updated.items[0].amount, Decimal("90.00"))

    def test_moving_only_the_first_installment_outside_the_window_is_rejected(self):
        purchase = create_installment(
            InstallmentCreate(
                description="Atual",
                total_amount=Decimal("200.00"),
                installment_count=2,
                credit_card_id=self.card.id,
                first_purchase_date=self.today,
            ),
            self.db,
            self.user,
        )
        far_due = date(self.today.year + 2, self.today.month, 5)
        far_invoice = Invoice(user_id=self.user.id, credit_card_id=self.card.id, due_date=far_due, total_amount=Decimal("0.00"), paid=False)
        self.db.add(far_invoice)
        self.db.commit()
        first_item = purchase.items[0]
        second_item = purchase.items[1]

        with self.assertRaises(HTTPException) as caught:
            update_installment_item(
                first_item.id,
                InstallmentItemUpdate(invoice_id=far_invoice.id, amount=first_item.amount, status="pending"),
                self.db,
                self.user,
            )
        self.assertEqual(caught.exception.status_code, 400)

        moved = update_installment_item(
            second_item.id,
            InstallmentItemUpdate(invoice_id=far_invoice.id, amount=second_item.amount, status="pending"),
            self.db,
            self.user,
        )
        moved_second = next(item for item in moved.items if item.installment_number == 2)
        self.assertEqual(moved_second.invoice_id, far_invoice.id)
