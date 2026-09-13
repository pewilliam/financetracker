import unittest
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import InstallmentItem, InstallmentPurchase, Invoice, InvoiceTemplate, User
from app.routers.installments import list_installments_page
from app.schemas.installments import InstallmentPageOut


class InstallmentPaginationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Parcelamentos", email="installments@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        template = InvoiceTemplate(user_id=self.user.id, name="Cartão", color="#14A078", default_due_day=10, active=True)
        self.db.add(template)
        self.db.flush()
        self.pending_invoice = Invoice(user_id=self.user.id, template_id=template.id, due_date=date.today() + timedelta(days=30), total_amount=Decimal("1300.00"), paid=False)
        self.paid_invoice = Invoice(user_id=self.user.id, template_id=template.id, due_date=date.today() - timedelta(days=30), total_amount=Decimal("200.00"), paid=True)
        self.db.add_all([self.pending_invoice, self.paid_invoice])
        self.db.flush()
        for index in range(13):
            self._purchase(f"Compra ativa {index + 1:02d}", self.pending_invoice)
        for index in range(2):
            self._purchase(f"Compra quitada {index + 1:02d}", self.paid_invoice)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _purchase(self, description, invoice):
        purchase = InstallmentPurchase(user_id=self.user.id, description=description, total_amount=Decimal("100.00"), installment_count=1, installment_value=Decimal("100.00"), first_invoice_id=invoice.id)
        self.db.add(purchase)
        self.db.flush()
        self.db.add(InstallmentItem(purchase_id=purchase.id, invoice_id=invoice.id, installment_number=1, amount=Decimal("100.00"), description=description, status="pending"))

    def _page(self, **overrides):
        params = {
            "tab": "active", "search": "", "category_id": None,
            "invoice_template_id": None, "situation": "all", "sort_by": "alphabetical",
            "page": 1, "page_size": 5, "db": self.db, "current_user": self.user,
        }
        params.update(overrides)
        return list_installments_page(**params)

    def test_returns_only_requested_page_with_global_summary(self):
        first = self._page()
        second = self._page(page=2)
        serialized = InstallmentPageOut.model_validate(first)

        self.assertEqual(len(first["items"]), 5)
        self.assertEqual(first["total"], 13)
        self.assertEqual(first["total_pages"], 3)
        self.assertEqual(serialized.page_size, 5)
        self.assertTrue({item.id for item in first["items"]}.isdisjoint({item.id for item in second["items"]}))
        self.assertEqual(first["summary"]["active_count"], 13)
        self.assertEqual(first["summary"]["paid_off_count"], 2)
        self.assertEqual(first["summary"]["remaining_amount"], Decimal("1300.00"))

    def test_filters_before_paginating(self):
        result = self._page(search="ativa 12")
        paid = self._page(tab="paid")

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0].description, "Compra ativa 12")
        self.assertEqual(paid["total"], 2)
        self.assertTrue(all(item.paid_installments == 1 for item in paid["items"]))


if __name__ == "__main__":
    unittest.main()
