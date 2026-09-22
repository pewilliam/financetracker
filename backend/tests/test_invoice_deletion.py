import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, InvoiceTemplate, Transaction, User
from app.routers.invoices import delete_invoice, list_invoices
from app.services.invoices import create_invoice_with_transaction


class InvoiceDeletionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="invoice-deletion@example.com", password_hash="hash")
        self.other_user = User(name="Outro", email="invoice-deletion-other@example.com", password_hash="hash")
        self.db.add_all([self.user, self.other_user])
        self.db.flush()
        self.current_user = type("CurrentUser", (), {"id": self.user.id})()
        self.template = InvoiceTemplate(
            user_id=self.user.id,
            name="Nubank",
            color="#8A05BE",
            default_due_day=10,
            active=True,
        )
        self.db.add(self.template)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _invoice(self):
        invoice = create_invoice_with_transaction(self.db, self.user.id, self.template, date(2026, 9, 10))
        self.db.commit()
        return invoice

    def test_empty_invoice_is_deleted_with_its_generated_transaction(self):
        invoice = self._invoice()

        delete_invoice(invoice.id, db=self.db, current_user=self.current_user)

        self.assertIsNone(self.db.get(Invoice, invoice.id))
        self.assertEqual(self.db.query(Transaction).count(), 0)

    def test_invoice_with_items_is_protected(self):
        invoice = self._invoice()
        self.db.add(InvoiceItem(invoice_id=invoice.id, description="Compra", amount=Decimal("25.00")))
        invoice.total_amount = Decimal("25.00")
        self.db.commit()

        with self.assertRaises(HTTPException) as context:
            delete_invoice(invoice.id, db=self.db, current_user=self.current_user)

        self.assertEqual(context.exception.status_code, 409)
        self.assertIsNotNone(self.db.get(Invoice, invoice.id))

    def test_invoice_with_installment_items_is_protected(self):
        invoice = self._invoice()
        purchase = InstallmentPurchase(
            user_id=self.user.id,
            description="Notebook",
            total_amount=Decimal("1200.00"),
            installment_count=12,
            installment_value=Decimal("100.00"),
        )
        self.db.add(purchase)
        self.db.flush()
        self.db.add(InstallmentItem(
            purchase_id=purchase.id,
            invoice_id=invoice.id,
            installment_number=1,
            amount=Decimal("100.00"),
            description="Notebook 1/12",
        ))
        self.db.commit()

        with self.assertRaises(HTTPException) as context:
            delete_invoice(invoice.id, db=self.db, current_user=self.current_user)

        self.assertEqual(context.exception.status_code, 409)
        self.assertIsNotNone(self.db.get(Invoice, invoice.id))

    def test_invoice_from_another_user_is_not_found(self):
        invoice = self._invoice()
        intruder = type("CurrentUser", (), {"id": self.other_user.id})()

        with self.assertRaises(HTTPException) as context:
            delete_invoice(invoice.id, db=self.db, current_user=intruder)

        self.assertEqual(context.exception.status_code, 404)
        self.assertIsNotNone(self.db.get(Invoice, invoice.id))

    def test_invoice_summary_counts_items_without_returning_them(self):
        invoice = self._invoice()
        self.db.add(InvoiceItem(invoice_id=invoice.id, description="Compra", amount=Decimal("25.00")))
        self.db.commit()

        rows = list_invoices(include_items=False, db=self.db, current_user=self.current_user)
        detailed = list_invoices(include_items=True, ids=[invoice.id], db=self.db, current_user=self.current_user)

        self.assertEqual(len(rows), 1)
        self.assertFalse(rows[0].items_included)
        self.assertEqual(rows[0].item_count, 1)
        self.assertEqual(rows[0].items, [])
        self.assertEqual(len(detailed), 1)
        self.assertEqual(len(detailed[0].items), 1)


if __name__ == "__main__":
    unittest.main()
