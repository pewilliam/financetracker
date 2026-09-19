import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Category, InvoiceTemplate, User, Wallet
from app.routers.invoice_templates import update_invoice_template
from app.routers.invoices import add_invoice_item
from app.routers.transactions import create_transaction, update_transaction
from app.schemas.invoice_templates import InvoiceTemplateUpdate
from app.schemas.invoices import InvoiceItemCreate
from app.schemas.transactions import TransactionCreate, TransactionUpdate
from app.services.invoices import (
    INVOICE_TRANSACTION_CREATE_DETAIL,
    INVOICE_TRANSACTION_EDIT_DETAIL,
    create_invoice_with_transaction,
)


class InvoiceTransactionEditTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Faturas", email="invoice-edits@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        self.wallet = Wallet(
            user_id=self.user.id,
            name="Principal",
            type="checking",
            initial_balance=Decimal("0.00"),
            tracking_started_on=date.today(),
            is_primary=True,
        )
        self.template = InvoiceTemplate(
            user_id=self.user.id,
            name="Cartão",
            color="#14A078",
            default_due_day=10,
            active=True,
        )
        self.category = Category(user_id=self.user.id, name="Alimentação", color="#14A078")
        self.db.add_all([self.wallet, self.template, self.category])
        self.db.flush()
        self.invoice = create_invoice_with_transaction(
            self.db,
            self.user.id,
            self.template,
            date.today(),
            self.wallet.id,
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_invoice_transaction_amount_cannot_be_updated_directly(self):
        with self.assertRaises(HTTPException) as caught:
            update_transaction(
                self.invoice.linked_transaction_id,
                TransactionUpdate(amount=Decimal("250.00")),
                self.db,
                self.user,
            )

        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, INVOICE_TRANSACTION_EDIT_DETAIL)
        self.db.refresh(self.invoice.linked_transaction)
        self.assertEqual(self.invoice.linked_transaction.amount, Decimal("0.00"))

    def test_invoice_transaction_description_cannot_be_updated_directly(self):
        with self.assertRaises(HTTPException) as caught:
            update_transaction(
                self.invoice.linked_transaction_id,
                TransactionUpdate(description="Nome inventado"),
                self.db,
                self.user,
            )

        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, INVOICE_TRANSACTION_EDIT_DETAIL)
        self.db.refresh(self.invoice.linked_transaction)
        self.assertEqual(self.invoice.linked_transaction.description, "Fatura: Cartão")

    def test_invoice_transaction_cannot_receive_a_category(self):
        with self.assertRaises(HTTPException) as caught:
            update_transaction(
                self.invoice.linked_transaction_id,
                TransactionUpdate(category_ids=[self.category.id]),
                self.db,
                self.user,
            )

        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, INVOICE_TRANSACTION_EDIT_DETAIL)
        self.db.refresh(self.invoice.linked_transaction)
        self.assertIsNone(self.invoice.linked_transaction.category_id)
        self.assertEqual(self.invoice.linked_transaction.categories, [])

    def test_standalone_transaction_cannot_be_attached_to_an_invoice(self):
        standalone = create_transaction(
            TransactionCreate(
                date=date.today(),
                type="expense",
                amount=Decimal("40.00"),
                description="Mercado",
                wallet_id=self.wallet.id,
            ),
            self.db,
            self.user,
        )

        with self.assertRaises(HTTPException) as caught:
            update_transaction(
                standalone.id,
                TransactionUpdate(invoice_id=self.invoice.id),
                self.db,
                self.user,
            )

        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, INVOICE_TRANSACTION_EDIT_DETAIL)
        self.db.refresh(standalone)
        self.assertIsNone(standalone.invoice_id)

    def test_invoice_transaction_cannot_be_created_as_standalone_entry(self):
        with self.assertRaises(HTTPException) as caught:
            create_transaction(
                TransactionCreate(
                    date=date.today(),
                    type="expense",
                    amount=Decimal("90.00"),
                    description="Fatura falsa",
                    invoice_id=self.invoice.id,
                    category_ids=[self.category.id],
                    wallet_id=self.wallet.id,
                ),
                self.db,
                self.user,
            )

        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, INVOICE_TRANSACTION_CREATE_DETAIL)

    def test_standalone_transaction_can_still_be_edited(self):
        standalone = create_transaction(
            TransactionCreate(
                date=date.today(),
                type="expense",
                amount=Decimal("40.00"),
                description="Mercado",
                wallet_id=self.wallet.id,
            ),
            self.db,
            self.user,
        )

        updated = update_transaction(
            standalone.id,
            TransactionUpdate(
                amount=Decimal("55.00"),
                description="Supermercado",
                category_ids=[self.category.id],
            ),
            self.db,
            self.user,
        )

        self.assertEqual(updated.amount, Decimal("55.00"))
        self.assertEqual(updated.description, "Supermercado")
        self.assertEqual(updated.category_ids, [self.category.id])

    def test_invoice_amount_and_name_stay_derived_from_items_and_template(self):
        add_invoice_item(
            self.invoice.id,
            InvoiceItemCreate(description="Restaurante", amount=Decimal("80.00"), category_ids=[self.category.id]),
            self.db,
            self.user,
        )
        self.db.refresh(self.invoice)
        self.db.refresh(self.invoice.linked_transaction)

        self.assertEqual(self.invoice.total_amount, Decimal("80.00"))
        self.assertEqual(self.invoice.linked_transaction.amount, Decimal("80.00"))
        self.assertEqual(self.invoice.linked_transaction.description, "Fatura: Cartão")
        self.assertEqual(self.invoice.items[0].category_ids, [self.category.id])

        update_invoice_template(
            self.template.id,
            InvoiceTemplateUpdate(name="Nubank"),
            self.db,
            self.user,
        )
        self.db.refresh(self.invoice)
        self.db.refresh(self.invoice.linked_transaction)
        self.assertEqual(self.invoice.name, "Nubank")
        self.assertEqual(self.invoice.linked_transaction.description, "Fatura: Nubank")


if __name__ == "__main__":
    unittest.main()
