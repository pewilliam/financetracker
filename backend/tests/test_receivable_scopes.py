import unittest
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import InstallmentItem, InstallmentPurchase, Receivable, ReceivablePayment, ReceivablePerson, Transaction, User
from app.routers.receivables import list_linked_receivable_transactions, list_receivables, receivable_board_summary


class ReceivableScopeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="scopes@example.com", password_hash="hash")
        self.person = ReceivablePerson(user=self.user, name="Ana")
        self.other = ReceivablePerson(user=self.user, name="Bruno")
        self.db.add_all([self.user, self.person, self.other])
        self.db.commit()
        self.today = date.today()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_receivable(self, **kwargs):
        receivable = Receivable(
            user_id=self.user.id,
            person_id=kwargs.pop("person_id", self.person.id),
            description=kwargs.pop("description", "Conta"),
            total_amount=kwargs.pop("total_amount", Decimal("100.00")),
            received_amount=kwargs.pop("received_amount", Decimal("0.00")),
            due_date=kwargs.pop("due_date", self.today),
            status=kwargs.pop("status", "pending"),
            **kwargs,
        )
        self.db.add(receivable)
        self.db.commit()
        return receivable

    def ids(self, scope):
        rows = list_receivables(db=self.db, current_user=self.user, status=None, scope=scope)
        return {row.id for row in rows}

    def test_open_scope_keeps_unpaid_series_together_and_skips_paid_series(self):
        pending = self.add_receivable(series_id="open-series", series_installment_number=2, description="Aberta")
        paid_sibling = self.add_receivable(
            series_id="open-series",
            series_installment_number=1,
            received_amount=Decimal("100.00"),
            status="paid",
            description="Parcela paga da série",
        )
        paid_only = self.add_receivable(
            series_id="paid-series",
            received_amount=Decimal("100.00"),
            status="paid",
            description="Série paga",
        )
        alone = self.add_receivable(description="Avulsa")

        open_ids = self.ids("open")
        paid_ids = self.ids("paid")

        self.assertEqual(open_ids, {pending.id, paid_sibling.id, alone.id})
        self.assertEqual(paid_ids, {paid_only.id})

    def test_purchase_group_uses_purchase_and_person(self):
        purchase = InstallmentPurchase(
            user_id=self.user.id,
            description="Compra",
            total_amount=Decimal("200.00"),
            installment_count=2,
            installment_value=Decimal("100.00"),
        )
        self.db.add(purchase)
        self.db.flush()
        first = InstallmentItem(purchase_id=purchase.id, installment_number=1, amount=Decimal("100.00"), description="1/2", status="paid")
        second = InstallmentItem(purchase_id=purchase.id, installment_number=2, amount=Decimal("100.00"), description="2/2", status="pending")
        self.db.add_all([first, second])
        self.db.commit()
        paid = self.add_receivable(
            source_installment_item_id=first.id,
            received_amount=Decimal("100.00"),
            status="paid",
            description="Parcela 1",
        )
        pending = self.add_receivable(source_installment_item_id=second.id, description="Parcela 2")
        other_paid = self.add_receivable(
            person_id=self.other.id,
            source_installment_item_id=first.id,
            received_amount=Decimal("100.00"),
            status="paid",
            description="Outra pessoa",
        )

        self.assertEqual(self.ids("open"), {paid.id, pending.id})
        self.assertEqual(self.ids("paid"), {other_paid.id})

    def test_summary_counts_groups_and_open_amounts_without_paid_groups(self):
        self.add_receivable(description="Pendente", total_amount=Decimal("40.00"))
        overdue = self.add_receivable(
            description="Atrasada",
            total_amount=Decimal("25.00"),
            due_date=self.today - timedelta(days=2),
            status="pending",
        )
        partial = self.add_receivable(
            description="Parcial",
            total_amount=Decimal("80.00"),
            received_amount=Decimal("30.00"),
            status="partial",
        )
        self.add_receivable(
            series_id="paid-series",
            received_amount=Decimal("100.00"),
            status="paid",
            description="Paga 1",
        )
        self.add_receivable(
            series_id="paid-series",
            series_installment_number=2,
            received_amount=Decimal("100.00"),
            status="paid",
            description="Paga 2",
        )
        self.db.add(ReceivablePayment(receivable_id=partial.id, amount=Decimal("30.00"), paid_at=self.today))
        future_expense = Transaction(
            user_id=self.user.id,
            date=self.today,
            type="expense",
            amount=Decimal("15.00"),
            description="Gasto futuro",
        )
        realized_expense = Transaction(
            user_id=self.user.id,
            date=self.today,
            type="expense",
            amount=Decimal("10.00"),
            description="Gasto",
        )
        self.db.add_all([future_expense, realized_expense])
        self.db.commit()
        future = Transaction(
            user_id=self.user.id,
            date=self.today + timedelta(days=1),
            type="income",
            amount=Decimal("15.00"),
            description="Futuro",
            linked_expense_transaction_id=future_expense.id,
        )
        realized = Transaction(
            user_id=self.user.id,
            date=self.today,
            type="income",
            amount=Decimal("10.00"),
            description="Realizado",
            linked_expense_transaction_id=realized_expense.id,
        )
        self.db.add_all([future, realized])
        self.db.commit()

        summary = receivable_board_summary(self.db, self.user)

        self.assertEqual(summary.group_counts.pending, 2)
        self.assertEqual(summary.group_counts.overdue, 1)
        self.assertEqual(summary.group_counts.partial, 1)
        self.assertEqual(summary.group_counts.paid, 2)
        self.assertEqual(summary.open_count, 4)
        self.assertEqual(summary.overdue_count, 1)
        self.assertEqual(summary.total_open, Decimal("130.00"))
        self.assertEqual(summary.total_overdue, Decimal("25.00"))
        self.assertEqual(summary.received_this_month, Decimal("40.00"))
        self.assertIn(overdue.id, self.ids("open"))
        open_linked = list_linked_receivable_transactions(self.db, self.user, scope="open")
        self.assertEqual([item.id for item in open_linked], [future.id])
        paid_linked = list_linked_receivable_transactions(self.db, self.user, scope="paid")
        self.assertEqual([item.id for item in paid_linked], [realized.id])
