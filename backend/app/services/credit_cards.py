import calendar
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import CreditCard, Invoice, Wallet
from app.services.invoices import create_invoice_with_transaction, invoice_accepts_new_charges, recalculate_invoice_total


def shift_month(year: int, month: int, amount: int) -> tuple[int, int]:
    index = year * 12 + month - 1 + amount
    return index // 12, index % 12 + 1


def date_on_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def add_months(source: date, amount: int) -> date:
    year, month = shift_month(source.year, source.month, amount)
    return date_on_day(year, month, source.day)


def legacy_closing_day(due_day: int) -> int:
    """Backfill used by migration 0033: closing day is due day minus 7, wrapping into 1..30."""
    delta = due_day - 7
    return delta if delta >= 1 else delta + 30


def invoice_period(closing_day: int, due_day: int, purchase_date: date) -> tuple[date, date]:
    """Return (closing_date, due_date) for a purchase.

    Closing starts a new cycle. A purchase on the closing day belongs to the
    following invoice, and the day before still belongs to the cycle that
    closes that day. When the due day is on or before the closing day, the
    invoice is due in the month after closing.
    """
    closing_this_month = date_on_day(purchase_date.year, purchase_date.month, closing_day)
    if purchase_date < closing_this_month:
        close_year, close_month = purchase_date.year, purchase_date.month
    else:
        close_year, close_month = shift_month(purchase_date.year, purchase_date.month, 1)
    closing_date = date_on_day(close_year, close_month, closing_day)
    if due_day <= closing_day:
        due_year, due_month = shift_month(close_year, close_month, 1)
    else:
        due_year, due_month = close_year, close_month
    return closing_date, date_on_day(due_year, due_month, due_day)


def _invoice_for_cycle(db: Session, user_id: int, card_id: int, due_date: date) -> Invoice | None:
    return (
        db.query(Invoice)
        .filter(
            Invoice.user_id == user_id,
            Invoice.credit_card_id == card_id,
            Invoice.due_date == due_date,
        )
        .first()
    )


def _active_card_wallet_id(db: Session, user_id: int, card: CreditCard) -> int | None:
    if not card.default_wallet_id:
        return None
    wallet = db.get(Wallet, card.default_wallet_id)
    if wallet and wallet.user_id == user_id and wallet.active:
        return wallet.id
    return None


def get_or_create_invoice(
    db: Session,
    user_id: int,
    card: CreditCard,
    purchase_date: date,
    allow_overdue: bool = False,
) -> Invoice:
    if card.user_id != user_id:
        raise HTTPException(status_code=404, detail="Card not found")
    if not card.active:
        raise HTTPException(status_code=400, detail="Card is inactive")

    _, due_date = invoice_period(card.closing_day, card.due_day, purchase_date)
    invoice = _invoice_for_cycle(db, user_id, card.id, due_date)
    if invoice:
        if not invoice_accepts_new_charges(invoice, allow_overdue):
            raise HTTPException(status_code=400, detail="Invoice no longer accepts new items")
        return invoice
    if due_date < date.today() and not allow_overdue:
        raise HTTPException(status_code=400, detail="Invoice no longer accepts new items")

    wallet_id = _active_card_wallet_id(db, user_id, card)
    try:
        with db.begin_nested():
            created = create_invoice_with_transaction(db, user_id, card, due_date, wallet_id)
        return created
    except IntegrityError:
        existing = _invoice_for_cycle(db, user_id, card.id, due_date)
        if existing is None:
            raise
        if not invoice_accepts_new_charges(existing, allow_overdue):
            raise HTTPException(status_code=400, detail="Invoice no longer accepts new items")
        return existing


def relocate_invoice_item(db: Session, user_id: int, item, purchase_date: date, allow_overdue: bool = False) -> Invoice:
    origin = item.invoice
    card = origin.card if origin else None
    if not origin or origin.user_id != user_id or not card or card.user_id != user_id:
        raise HTTPException(status_code=404, detail="Card not found")
    target = get_or_create_invoice(db, user_id, card, purchase_date, allow_overdue=allow_overdue)
    item.purchase_date = purchase_date
    if target.id != origin.id:
        item.invoice_id = target.id
        db.flush()
        recalculate_invoice_total(db, origin)
        recalculate_invoice_total(db, target)
    return target


def committed_by_card(db: Session, user_id: int, card_ids: list[int] | None = None) -> dict[int, Decimal]:
    from sqlalchemy import func

    query = (
        db.query(Invoice.credit_card_id, func.coalesce(func.sum(Invoice.total_amount), 0))
        .filter(Invoice.user_id == user_id, Invoice.paid.is_(False))
    )
    if card_ids is not None:
        if not card_ids:
            return {}
        query = query.filter(Invoice.credit_card_id.in_(card_ids))
    rows = query.group_by(Invoice.credit_card_id).all()
    return {card_id: Decimal(str(total or 0)) for card_id, total in rows}


def available_credit(credit_limit, committed: Decimal) -> Decimal | None:
    if credit_limit is None:
        return None
    return Decimal(str(credit_limit)) - committed
