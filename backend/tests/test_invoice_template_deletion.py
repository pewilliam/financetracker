import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import InvoiceItem, InvoiceTemplate, Transaction, User
from app.routers.invoice_templates import delete_invoice_template, list_invoice_templates
from app.services.invoices import create_invoice_with_transaction


class InvoiceTemplateDeletionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="invoice-template@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        self.current_user = type("CurrentUser", (), {"id": self.user.id})()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _template(self, *, active=False):
        template = InvoiceTemplate(
            user_id=self.user.id,
            name="Banco do Brasil",
            color="#FACC15",
            default_due_day=10,
            active=active,
        )
        self.db.add(template)
        self.db.flush()
        return template

    def test_inactive_template_deletes_its_empty_invoices_and_generated_transactions(self):
        template = self._template()
        invoice = create_invoice_with_transaction(self.db, self.user.id, template, date(2026, 9, 10))
        self.db.commit()

        listed = list_invoice_templates(active=None, db=self.db, current_user=self.current_user)
        self.assertTrue(listed[0].can_delete)
        self.assertEqual(listed[0].total_invoices, 1)

        delete_invoice_template(template.id, db=self.db, current_user=self.current_user)

        self.assertEqual(self.db.query(InvoiceTemplate).count(), 0)
        self.assertEqual(self.db.query(Transaction).count(), 0)
        self.assertIsNone(self.db.get(type(invoice), invoice.id))

    def test_template_with_financial_history_remains_protected(self):
        template = self._template()
        invoice = create_invoice_with_transaction(self.db, self.user.id, template, date(2026, 9, 10))
        self.db.add(InvoiceItem(invoice_id=invoice.id, description="Compra", amount=Decimal("25.00")))
        invoice.total_amount = Decimal("25.00")
        self.db.commit()

        listed = list_invoice_templates(active=None, db=self.db, current_user=self.current_user)
        self.assertFalse(listed[0].can_delete)

        with self.assertRaises(HTTPException) as context:
            delete_invoice_template(template.id, db=self.db, current_user=self.current_user)

        self.assertEqual(context.exception.status_code, 409)
        self.assertIsNotNone(self.db.get(InvoiceTemplate, template.id))

    def test_active_template_must_be_disabled_before_deletion(self):
        template = self._template(active=True)
        self.db.commit()

        with self.assertRaises(HTTPException) as context:
            delete_invoice_template(template.id, db=self.db, current_user=self.current_user)

        self.assertEqual(context.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
