import calendar
from datetime import date
from decimal import Decimal
import re
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import CreditCard, InstallmentItem, Invoice, InvoiceItem, Transaction
from app.services.wallets import user_wallet

DEFAULT_INVOICE_COLOR = "#3B82F6"
INVOICE_TRANSACTION_EDIT_DETAIL = "Invoice entries cannot be edited as standalone transactions"
INVOICE_TRANSACTION_CREATE_DETAIL = "Invoice entries cannot be created as standalone transactions"


def invoice_transaction_description(invoice_name: str) -> str:
    return f"Fatura: {invoice_name}"


def normalize_invoice_color(color: str | None) -> str:
    return color if color and re.fullmatch(r"#[0-9A-Fa-f]{6}", color) else DEFAULT_INVOICE_COLOR


def invoice_payment_date(due_date: date, payment_forecast_day: int | None) -> date:
    """Day the invoice payment is counted on monthly control.

    The forecast day stays in the due month. An empty forecast keeps the due date.
    """
    if not payment_forecast_day:
        return due_date
    last_day = calendar.monthrange(due_date.year, due_date.month)[1]
    return date(due_date.year, due_date.month, min(int(payment_forecast_day), last_day))


def _invoice_payment_date(invoice: Invoice) -> date:
    card = invoice.card
    forecast_day = card.payment_forecast_day if card is not None else None
    return invoice_payment_date(invoice.due_date, forecast_day)


def sync_open_invoice_payment_dates(db: Session, card: CreditCard) -> None:
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.credit_card_id == card.id,
            Invoice.paid.is_(False),
            Invoice.linked_transaction_id.isnot(None),
        )
        .all()
    )
    today = date.today()
    for invoice in invoices:
        linked = db.get(Transaction, invoice.linked_transaction_id)
        if linked is None:
            continue
        payment_date = invoice_payment_date(invoice.due_date, card.payment_forecast_day)
        linked.date = payment_date
        linked.is_future = payment_date > today


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
            payment_date = _invoice_payment_date(invoice)
            linked.amount = invoice.total_amount
            linked.date = payment_date
            linked.description = invoice_transaction_description(invoice.name)
            linked.is_future = False if invoice.paid else payment_date > date.today()

    return invoice


def create_invoice_with_transaction(db: Session, user_id: int, card: CreditCard, due_date: date, wallet_id: int | None = None) -> Invoice:
    wallet = user_wallet(db, user_id, wallet_id, active_only=True)
    invoice = Invoice(
        user_id=user_id,
        credit_card_id=card.id,
        due_date=due_date,
        total_amount=Decimal("0.00"),
        paid=False,
    )
    invoice.card = card
    db.add(invoice)
    db.flush()

    payment_date = invoice_payment_date(invoice.due_date, card.payment_forecast_day)
    transaction = Transaction(
        user_id=user_id,
        date=payment_date,
        type="expense",
        amount=invoice.total_amount,
        description=invoice_transaction_description(card.name),
        is_future=payment_date > date.today(),
        invoice_id=invoice.id,
        wallet_id=wallet.id,
    )
    db.add(transaction)
    db.flush()
    invoice.linked_transaction_id = transaction.id
    return invoice
