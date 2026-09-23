import calendar
from datetime import date, timedelta
from decimal import Decimal
import re
from fastapi import HTTPException
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


def _date_on_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(int(day), calendar.monthrange(year, month)[1]))


def card_cycle_due_date(year: int, month: int, due_day: int) -> date:
    return _date_on_day(year, month, due_day)


def invoice_payment_date(
    due_date: date,
    payment_forecast_day: int | None = None,
    payment_forecast_kind: str | None = None,
) -> date:
    """Day the invoice payment is counted on monthly control, in the due month.

    ``first`` and ``last`` follow the real length of the month, so February
    uses day 1 or day 28/29. A fixed day that does not exist, such as 31,
    uses the last day of that month. An empty forecast keeps the due date.
    """
    kind = payment_forecast_kind or None
    if kind is None and payment_forecast_day:
        kind = "day"
    last_day = calendar.monthrange(due_date.year, due_date.month)[1]
    if kind == "first":
        day = 1
    elif kind == "last":
        day = last_day
    elif kind == "day" and payment_forecast_day:
        day = min(int(payment_forecast_day), last_day)
    else:
        return due_date
    return date(due_date.year, due_date.month, day)


def apply_payment_forecast(
    kind: str | None,
    day: int | None,
    *,
    kind_was_sent: bool,
) -> tuple[str | None, int | None]:
    """Store first/last as a rule, or a fixed day. An omitted kind keeps the day-only API."""
    if not kind_was_sent:
        return ("day", int(day)) if day else (None, None)
    if kind in ("first", "last"):
        return kind, None
    if kind == "day":
        if not day:
            raise HTTPException(status_code=400, detail="Payment forecast day is required")
        return "day", int(day)
    if day:
        return "day", int(day)
    return None, None


def card_payment_date(due_date: date, card: CreditCard | None) -> date:
    if card is None:
        return due_date
    return invoice_payment_date(due_date, card.payment_forecast_day, card.payment_forecast_kind)


def _invoice_payment_date(invoice: Invoice) -> date:
    return card_payment_date(invoice.due_date, invoice.card)


def align_open_invoices_to_card(db: Session, card: CreditCard) -> None:
    """Make unpaid invoices use the card due day and payment forecast.

    Paid invoices stay on the dates they already have. The due month of each
    open invoice is kept; only the day is taken from the card.
    """
    invoices = (
        db.query(Invoice)
        .filter(Invoice.credit_card_id == card.id, Invoice.paid.is_(False))
        .order_by(Invoice.due_date, Invoice.id)
        .all()
    )
    targets: list[tuple[Invoice, date]] = []
    seen: dict[date, int] = {}
    for invoice in invoices:
        target = card_cycle_due_date(invoice.due_date.year, invoice.due_date.month, card.due_day)
        if target in seen:
            raise HTTPException(status_code=400, detail="Open invoices would share the same due date")
        seen[target] = invoice.id
        targets.append((invoice, target))

    for invoice, target in targets:
        if invoice.due_date == target:
            continue
        occupied = (
            db.query(Invoice)
            .filter(
                Invoice.credit_card_id == card.id,
                Invoice.due_date == target,
                Invoice.id != invoice.id,
            )
            .first()
        )
        if occupied is not None and occupied.paid:
            raise HTTPException(status_code=400, detail="A paid invoice already uses that due date")

    changing = [(invoice, target) for invoice, target in targets if invoice.due_date != target]
    for invoice, _target in changing:
        invoice.due_date = date(1000, 1, 1) + timedelta(days=invoice.id)
    if changing:
        db.flush()
    for invoice, target in changing:
        invoice.due_date = target
    if changing:
        db.flush()

    today = date.today()
    for invoice, _target in targets:
        if not invoice.linked_transaction_id:
            continue
        linked = db.get(Transaction, invoice.linked_transaction_id)
        if linked is None:
            continue
        payment_date = card_payment_date(invoice.due_date, card)
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

    payment_date = card_payment_date(invoice.due_date, card)
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
