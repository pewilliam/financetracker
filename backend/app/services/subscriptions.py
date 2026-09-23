from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import CardSubscription, CardSubscriptionSkip, CreditCard, Invoice, InvoiceItem
from app.schemas.invoices import InvoiceOut, ProjectedSubscriptionItemOut
from app.services.categories import set_item_categories
from app.services.credit_cards import date_on_day, get_or_create_invoice, invoice_period, shift_month
from app.services.invoices import invoice_accepts_new_charges, recalculate_invoice_total

_ZERO = Decimal("0.00")
_MAX_CHARGE_STEPS = 240


def first_charge_on_or_after(purchase_date: date, charge_day: int) -> date:
    candidate = date_on_day(purchase_date.year, purchase_date.month, charge_day)
    if candidate < purchase_date:
        year, month = shift_month(purchase_date.year, purchase_date.month, 1)
        candidate = date_on_day(year, month, charge_day)
    return candidate


def iter_charge_dates(start: date, charge_day: int, until: date):
    cursor = start
    for _ in range(_MAX_CHARGE_STEPS):
        if cursor > until:
            return
        yield cursor
        year, month = shift_month(cursor.year, cursor.month, 1)
        cursor = date_on_day(year, month, charge_day)


def next_cycle_due(due_day: int, due_date: date) -> date:
    year, month = shift_month(due_date.year, due_date.month, 1)
    return date_on_day(year, month, due_day)


def charge_date_for_cycle(closing_day: int, due_day: int, due_date: date, charge_day: int) -> date | None:
    """Return the subscription charge that lands on the invoice due on due_date."""
    if due_day <= closing_day:
        close_year, close_month = shift_month(due_date.year, due_date.month, -1)
    else:
        close_year, close_month = due_date.year, due_date.month
    closing = date_on_day(close_year, close_month, closing_day)
    prev_year, prev_month = shift_month(close_year, close_month, -1)
    previous_closing = date_on_day(prev_year, prev_month, closing_day)
    index = previous_closing.year * 12 + previous_closing.month
    end = closing.year * 12 + closing.month
    found = None
    while index <= end:
        year, month_index = divmod(index - 1, 12)
        candidate = date_on_day(year, month_index + 1, charge_day)
        if previous_closing < candidate <= closing:
            found = candidate
        index += 1
    return found


def virtual_invoice_id(card_id: int, due: date) -> int:
    return -(card_id * 1_000_000 + due.year * 100 + due.month)


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _skip(db: Session, subscription_id: int, charge_date: date, skipped: set[tuple[int, date]]) -> None:
    key = (subscription_id, charge_date)
    if key in skipped:
        return
    db.add(CardSubscriptionSkip(subscription_id=subscription_id, charge_date=charge_date))
    skipped.add(key)


def materialize_due_subscriptions(db: Session, user, today: date | None = None) -> bool:
    """Turn due occurrences into real invoice items. Future ones stay projected."""
    today = today or date.today()
    subscriptions = (
        db.query(CardSubscription)
        .options(
            selectinload(CardSubscription.categories),
            selectinload(CardSubscription.card),
        )
        .filter(CardSubscription.user_id == user.id, CardSubscription.active.is_(True))
        .all()
    )
    if not subscriptions:
        return False

    subscription_ids = [subscription.id for subscription in subscriptions]
    materialized = {
        (subscription_id, charge_date)
        for subscription_id, charge_date in db.query(
            InvoiceItem.subscription_id,
            InvoiceItem.subscription_charge_date,
        )
        .join(Invoice)
        .filter(Invoice.user_id == user.id, InvoiceItem.subscription_id.in_(subscription_ids))
        .all()
        if charge_date is not None
    }
    skipped = {
        (subscription_id, charge_date)
        for subscription_id, charge_date in db.query(
            CardSubscriptionSkip.subscription_id,
            CardSubscriptionSkip.charge_date,
        )
        .filter(CardSubscriptionSkip.subscription_id.in_(subscription_ids))
        .all()
    }
    changed = False
    allow_overdue = bool(user.allow_overdue_invoice_edits)
    for subscription in subscriptions:
        card = subscription.card
        if card is None or not card.active or card.user_id != user.id:
            continue
        for charge_date in iter_charge_dates(subscription.start_date, subscription.charge_day, today):
            key = (subscription.id, charge_date)
            if key in materialized or key in skipped:
                continue
            invoice = (
                db.query(Invoice)
                .filter(
                    Invoice.user_id == user.id,
                    Invoice.credit_card_id == card.id,
                    Invoice.due_date == invoice_period(card.closing_day, card.due_day, charge_date)[1],
                )
                .first()
            )
            if invoice is None:
                try:
                    invoice = get_or_create_invoice(
                        db,
                        user.id,
                        card,
                        charge_date,
                        allow_overdue=allow_overdue,
                    )
                except HTTPException:
                    _skip(db, subscription.id, charge_date, skipped)
                    changed = True
                    continue
            elif not invoice_accepts_new_charges(invoice, allow_overdue):
                _skip(db, subscription.id, charge_date, skipped)
                changed = True
                continue

            item = InvoiceItem(
                invoice_id=invoice.id,
                description=subscription.description,
                amount=subscription.amount,
                category_id=subscription.category_id,
                purchase_date=charge_date,
                subscription_id=subscription.id,
                subscription_charge_date=charge_date,
            )
            try:
                with db.begin_nested():
                    set_item_categories(item, list(subscription.categories))
                    db.add(item)
                    db.flush()
            except IntegrityError:
                materialized.add(key)
                continue
            recalculate_invoice_total(db, invoice)
            materialized.add(key)
            changed = True
    return changed


def _projected_item(subscription: CardSubscription, charge: date) -> ProjectedSubscriptionItemOut:
    return ProjectedSubscriptionItemOut(
        subscription_id=subscription.id,
        description=subscription.description,
        amount=_money(subscription.amount),
        charge_date=charge,
        category_id=subscription.category_id,
        category_ids=list(subscription.category_ids),
        categories=list(subscription.categories),
    )


def _horizon(card: CreditCard, invoices: list[Invoice], today: date) -> list[tuple[Invoice | None, date]]:
    _, current_due = invoice_period(card.closing_day, card.due_day, today)
    existing_dues = {invoice.due_date for invoice in invoices}
    real = [invoice for invoice in invoices if invoice.due_date >= current_due]
    if real:
        last = max(real, key=lambda invoice: (invoice.due_date, invoice.id))
        cycles = [(invoice, invoice.due_date) for invoice in sorted(real, key=lambda invoice: (invoice.due_date, invoice.id))]
        following = next_cycle_due(card.due_day, last.due_date)
        if following not in existing_dues:
            cycles.append((None, following))
        return cycles
    following = next_cycle_due(card.due_day, current_due)
    cycles = []
    if current_due not in existing_dues:
        cycles.append((None, current_due))
    if following not in existing_dues:
        cycles.append((None, following))
    return cycles


def _clear_projection(invoice: Invoice) -> None:
    invoice.projected_amount = _ZERO
    invoice.projected_total = _money(invoice.total_amount)
    invoice.projected_item_count = 0
    invoice.is_projected = False
    invoice.projected_items = []


def apply_subscription_projections(
    db: Session,
    user_id: int,
    invoices: list[Invoice],
    *,
    include_virtual: bool,
    today: date | None = None,
) -> list:
    """Attach projected charges and, when requested, one extra invoice after the last real one."""
    today = today or date.today()
    for invoice in invoices:
        _clear_projection(invoice)

    subscriptions = (
        db.query(CardSubscription)
        .options(
            selectinload(CardSubscription.categories),
            selectinload(CardSubscription.card),
        )
        .filter(CardSubscription.user_id == user_id, CardSubscription.active.is_(True))
        .all()
    )
    if not subscriptions:
        return list(invoices)

    subscription_ids = [subscription.id for subscription in subscriptions]
    blocked = {
        (subscription_id, charge_date)
        for subscription_id, charge_date in db.query(
            InvoiceItem.subscription_id,
            InvoiceItem.subscription_charge_date,
        )
        .join(Invoice)
        .filter(Invoice.user_id == user_id, InvoiceItem.subscription_id.in_(subscription_ids))
        .all()
        if charge_date is not None
    }
    blocked.update(
        db.query(CardSubscriptionSkip.subscription_id, CardSubscriptionSkip.charge_date)
        .filter(CardSubscriptionSkip.subscription_id.in_(subscription_ids))
        .all()
    )

    card_ids = {subscription.credit_card_id for subscription in subscriptions}
    all_invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.card))
        .filter(Invoice.user_id == user_id, Invoice.credit_card_id.in_(card_ids))
        .all()
    )
    by_card: dict[int, list[Invoice]] = {}
    for invoice in all_invoices:
        by_card.setdefault(invoice.credit_card_id, []).append(invoice)
    cards = {
        card.id: card
        for card in db.query(CreditCard)
        .filter(CreditCard.user_id == user_id, CreditCard.id.in_(card_ids), CreditCard.active.is_(True))
        .all()
    }
    visible_by_id = {invoice.id: invoice for invoice in invoices}
    projections: dict[int, list[ProjectedSubscriptionItemOut]] = {}
    virtuals: list[InvoiceOut] = []

    for card_id, card in cards.items():
        card_subscriptions = [subscription for subscription in subscriptions if subscription.credit_card_id == card_id]
        for invoice, due_date in _horizon(card, by_card.get(card_id, []), today):
            if invoice is not None and invoice.paid:
                continue
            charges: list[ProjectedSubscriptionItemOut] = []
            for subscription in card_subscriptions:
                charge = charge_date_for_cycle(card.closing_day, card.due_day, due_date, subscription.charge_day)
                if charge is None or charge < subscription.start_date or charge <= today:
                    continue
                if (subscription.id, charge) in blocked:
                    continue
                charges.append(_projected_item(subscription, charge))
            if not charges:
                continue
            if invoice is not None:
                projections[invoice.id] = charges
                continue
            if not include_virtual:
                continue
            amount = sum((item.amount for item in charges), _ZERO)
            virtuals.append(
                InvoiceOut(
                    id=virtual_invoice_id(card.id, due_date),
                    credit_card_id=card.id,
                    name=card.name,
                    color=card.color,
                    due_date=due_date,
                    total_amount=_ZERO,
                    paid=False,
                    items_included=True,
                    item_count=0,
                    installment_item_count=0,
                    projected_amount=amount,
                    projected_total=amount,
                    projected_item_count=len(charges),
                    is_projected=True,
                    projected_items=charges,
                )
            )

    for invoice_id, charges in projections.items():
        invoice = visible_by_id.get(invoice_id)
        if invoice is None:
            continue
        amount = sum((item.amount for item in charges), _ZERO)
        invoice.projected_amount = amount
        invoice.projected_total = _money(invoice.total_amount) + amount
        invoice.projected_item_count = len(charges)
        invoice.projected_items = charges

    return list(invoices) + virtuals
