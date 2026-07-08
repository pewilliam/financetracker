from datetime import date
from decimal import Decimal
import re
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import InstallmentItem, Invoice, InvoiceItem, InvoiceTemplate, Transaction

DEFAULT_INVOICE_COLOR = "#3B82F6"


def normalize_invoice_color(color: str | None) -> str:
    return color if color and re.fullmatch(r"#[0-9A-Fa-f]{6}", color) else DEFAULT_INVOICE_COLOR


def invoice_accepts_new_charges(invoice: Invoice, allow_overdue: bool = False) -> bool:
    if invoice.paid:
        return False
    return allow_overdue or invoice.due_date >= date.today()


def recalculate_invoice_total(db: Session, invoice: Invoice) -> Invoice:
    item_total = (
        db.query(func.coalesce(func.sum(InvoiceItem.amount), 0))
        .filter(InvoiceItem.invoice_id == invoice.id)
        .scalar()
    )
    installment_total = (
        db.query(func.coalesce(func.sum(InstallmentItem.amount), 0))
        .filter(InstallmentItem.invoice_id == invoice.id, InstallmentItem.status != "canceled")
        .scalar()
    )
    calculated_total = Decimal(str(item_total or 0)) + Decimal(str(installment_total or 0))
    invoice.total_amount = max(calculated_total, Decimal("0.00"))

    if invoice.linked_transaction_id:
        linked = db.get(Transaction, invoice.linked_transaction_id)
        if linked:
            linked.amount = invoice.total_amount
            linked.date = invoice.due_date
            linked.description = f"Fatura: {invoice.name}"
            linked.is_future = False if invoice.paid else invoice.due_date > date.today()

    return invoice


def create_invoice_with_transaction(db: Session, user_id: int, template: InvoiceTemplate, due_date: date) -> Invoice:
    invoice = Invoice(
        user_id=user_id,
        template_id=template.id,
        due_date=due_date,
        total_amount=Decimal("0.00"),
        paid=False,
    )
    db.add(invoice)
    db.flush()

    transaction = Transaction(
        user_id=user_id,
        date=invoice.due_date,
        type="expense",
        amount=invoice.total_amount,
        description=f"Fatura: {template.name}",
        is_future=invoice.due_date > date.today(),
        invoice_id=invoice.id,
    )
    db.add(transaction)
    db.flush()
    invoice.linked_transaction_id = transaction.id
    return invoice
