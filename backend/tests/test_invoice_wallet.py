import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import InvoiceTemplate, User, Wallet
from app.services.invoices import create_invoice_with_transaction
from app.schemas.transactions import TransactionOut


class InvoiceWalletTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Faturas", email="invoice-wallet@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        self.primary = Wallet(user_id=self.user.id, name="Principal", type="checking", initial_balance=Decimal("0.00"), tracking_started_on=date.today())
        self.selected = Wallet(user_id=self.user.id, name="Mercado Pago", type="digital", initial_balance=Decimal("0.00"), tracking_started_on=date.today())
        self.template = InvoiceTemplate(user_id=self.user.id, name="Cartão", color="#14A078", default_due_day=10, active=True)
        self.db.add_all([self.primary, self.selected, self.template])
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_invoice_transaction_uses_selected_wallet(self):
        invoice = create_invoice_with_transaction(
            self.db,
            self.user.id,
            self.template,
            date.today(),
            self.selected.id,
        )

        self.assertEqual(invoice.linked_transaction.wallet_id, self.selected.id)
        serialized = TransactionOut.model_validate(invoice.linked_transaction)
        self.assertEqual(serialized.wallet.name, "Mercado Pago")

    def test_invoice_without_selection_uses_primary_wallet(self):
        self.primary.is_primary = False
        self.selected.is_primary = True
        self.db.flush()

        invoice = create_invoice_with_transaction(
            self.db,
            self.user.id,
            self.template,
            date.today(),
        )

        self.assertEqual(invoice.linked_transaction.wallet_id, self.selected.id)


if __name__ == "__main__":
    unittest.main()
