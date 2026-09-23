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


def closing_month_of_due(due_date: date, due_day: int, closing_day: int) -> tuple[int, int]:
    """Month in which the invoice closes.

    When the due day is on or before the closing day, the bill is due in the
    month after closing. The payment forecast uses this closing month.
    """
    if int(due_day) <= int(closing_day):
        index = due_date.year * 12 + due_date.month - 2
        return index // 12, index % 12 + 1
    return due_date.year, due_date.month


def invoice_payment_date(
    due_date: date,
    payment_forecast_day: int | None = None,
    payment_forecast_kind: str | None = None,
    *,
    due_day: int | None = None,
    closing_day: int | None = None,
) -> date:
    """Day the invoice payment is counted on monthly control.

    The day belongs to the closing month, not the due month. ``first`` and
    ``last`` follow that month, including February. A fixed day that does not
    exist, such as 31, uses the last day of the closing month. An empty
    forecast keeps the due date.
    """
    kind = payment_forecast_kind or None
    if kind is None and payment_forecast_day:
        kind = "day"
    if due_day is None or closing_day is None:
        year, month = due_date.year, due_date.month
    else:
        year, month = closing_month_of_due(due_date, due_day, closing_day)
    last_day = calendar.monthrange(year, month)[1]
    if kind == "first":
        day = 1
    elif kind == "last":
        day = last_day
    elif kind == "day" and payment_forecast_day:
        day = min(int(payment_forecast_day), last_day)
    else:
        return due_date
    return date(year, month, day)


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
    return invoice_payment_date(
        due_date,
        card.payment_forecast_day,
        card.payment_forecast_kind,
        due_day=card.due_day,
        closing_day=card.closing_day,
    )


def _invoice_payment_date(invoice: Invoice) -> date:
    if invoice.planned_payment_date:
        return invoice.planned_payment_date
    return card_payment_date(invoice.due_date, invoice.card)


def refresh_open_payment_dates(db: Session, user_id: int) -> bool:
    """Move open invoices that still follow the card onto the closing-month payment date."""
    from sqlalchemy.orm import selectinload

    invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.card))
        .filter(
            Invoice.user_id == user_id,
            Invoice.paid.is_(False),
            Invoice.planned_payment_date.is_(None),
            Invoice.linked_transaction_id.isnot(None),
        )
        .all()
    )
    changed = False
    today = date.today()
    for invoice in invoices:
        payment_date = _invoice_payment_date(invoice)
        linked = db.get(Transaction, invoice.linked_transaction_id)
        if linked is None or linked.date == payment_date:
            continue
        linked.date = payment_date
        linked.is_future = payment_date > today
        changed = True
    return changed


def same_cycle_due_date(
    old_due: date,
    old_due_day: int,
    old_closing_day: int,
    new_due_day: int,
    new_closing_day: int,
) -> date:
    """Due date of the same billing cycle after the card calendar changes.

    The closing day starts the cycle. When the due day is on or before the
    closing day, the invoice is due in the following month. A bill that closes
    on the 29th and is due on the 5th therefore stays in the current month
    until closing and is due on the 5th of the next month.
    """
    from app.services.credit_cards import date_on_day, invoice_period, shift_month

    if old_due_day <= old_closing_day:
        close_year, close_month = shift_month(old_due.year, old_due.month, -1)
    else:
        close_year, close_month = old_due.year, old_due.month
    closing = date_on_day(close_year, close_month, old_closing_day)
    anchor = closing - timedelta(days=1)
    return invoice_period(new_closing_day, new_due_day, anchor)[1]


def _purchase_dates(invoice: Invoice) -> list[date]:
    return [item.purchase_date for item in invoice.items if item.purchase_date]


def _due_target_for_invoice(
    invoice: Invoice,
    card: CreditCard,
    previous_due_day: int,
    previous_closing_day: int,
    calendar_changed: bool,
) -> date:
    from app.services.credit_cards import invoice_period

    purchase_dates = _purchase_dates(invoice)
    if purchase_dates:
        counted: dict[date, int] = {}
        for purchase_date in purchase_dates:
            due = invoice_period(card.closing_day, card.due_day, purchase_date)[1]
            counted[due] = counted.get(due, 0) + 1
        due, count = max(counted.items(), key=lambda item: item[1])
        if count == len(purchase_dates):
            return due
    if calendar_changed:
        return same_cycle_due_date(
            invoice.due_date,
            previous_due_day,
            previous_closing_day,
            card.due_day,
            card.closing_day,
        )
    return invoice.due_date


def sync_open_invoices_to_card(
    db: Session,
    card: CreditCard,
    *,
    previous_due_day: int,
    previous_closing_day: int,
    calendar_changed: bool,
) -> None:
    """Keep open invoices on the card calendar and refresh their payment dates.

    Paid invoices stay where they are. A charge decides the due date of its
    invoice. Invoices without charges keep the same cycle when the closing or
    due day changes. A planned payment date chosen on one invoice is kept.
    """
    from sqlalchemy.orm import selectinload

    invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.items), selectinload(Invoice.installment_items))
        .filter(Invoice.credit_card_id == card.id, Invoice.paid.is_(False))
        .order_by(Invoice.due_date, Invoice.id)
        .all()
    )
    occupied = {
        row.due_date
        for row in db.query(Invoice.due_date)
        .filter(Invoice.credit_card_id == card.id, Invoice.paid.is_(True))
        .all()
    }
    proposals = [
        (
            invoice,
            _due_target_for_invoice(
                invoice,
                card,
                previous_due_day,
                previous_closing_day,
                calendar_changed,
            ),
        )
        for invoice in invoices
    ]
    grouped: dict[date, list[Invoice]] = {}
    for invoice, target in proposals:
        grouped.setdefault(target, []).append(invoice)
    chosen: dict[int, date] = {}
    removable: list[Invoice] = []
    for target, group in grouped.items():
        if target in occupied:
            for invoice in group:
                chosen[invoice.id] = invoice.due_date
            continue
        charged = [invoice for invoice in group if _purchase_dates(invoice)]
        if len(group) > 1 and len(charged) == 1:
            winner = charged[0]
            for invoice in group:
                if invoice is winner:
                    chosen[invoice.id] = target
                elif not invoice.items and not invoice.installment_items:
                    removable.append(invoice)
                else:
                    chosen[invoice.id] = invoice.due_date
            continue
        if len(group) > 1:
            winner = next((invoice for invoice in group if invoice.due_date == target), None)
            for invoice in group:
                chosen[invoice.id] = target if invoice is winner else invoice.due_date
            continue
        chosen[group[0].id] = target
    if removable:
        removable_ids = {invoice.id for invoice in removable}
        for invoice in removable:
            linked_id = invoice.linked_transaction_id
            invoice.linked_transaction_id = None
            db.flush()
            if linked_id:
                linked = db.get(Transaction, linked_id)
                if linked is not None and linked.amount == 0:
                    db.delete(linked)
            db.delete(invoice)
        db.flush()
        invoices = [invoice for invoice in invoices if invoice.id not in removable_ids]
    used: dict[date, int] = {}
    for invoice in invoices:
        target = chosen[invoice.id]
        owner = used.get(target)
        if owner is not None and owner != invoice.id:
            target = invoice.due_date
            chosen[invoice.id] = target
        used[target] = invoice.id

    changing = [(invoice, chosen[invoice.id]) for invoice in invoices if invoice.due_date != chosen[invoice.id]]
    for invoice, _target in changing:
        invoice.due_date = date(1000, 1, 1) + timedelta(days=invoice.id)
    if changing:
        db.flush()
    for invoice, target in changing:
        invoice.due_date = target
    if changing:
        db.flush()

    today = date.today()
    for invoice in invoices:
        if not invoice.linked_transaction_id:
            continue
        linked = db.get(Transaction, invoice.linked_transaction_id)
        if linked is None:
            continue
        payment_date = _invoice_payment_date(invoice)
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
