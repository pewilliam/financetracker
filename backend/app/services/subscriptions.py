from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import CardSubscription, CardSubscriptionSkip, CreditCard, InstallmentItem, Invoice, InvoiceItem, Transaction, User
from app.schemas.invoices import InvoiceOut, ProjectedSubscriptionItemOut
from app.services.categories import category_ids_from_payload, get_user_categories, set_item_categories
from app.services.credit_cards import add_months, date_on_day, get_or_create_invoice, invoice_period, shift_month
from app.services.invoices import invoice_accepts_new_charges, recalculate_invoice_total

_ZERO = Decimal("0.00")
_MAX_CHARGE_STEPS = 240
MAX_TERM_MONTHS = 120
BILLING_PERIOD_MONTHS = {
    "monthly": 1,
    "bimonthly": 2,
    "quarterly": 3,
    "semiannual": 6,
    "annual": 12,
}
BILLING_MONTHS_PERIOD = {months: period for period, months in BILLING_PERIOD_MONTHS.items()}


def first_charge_on_or_after(purchase_date: date, charge_day: int) -> date:
    candidate = date_on_day(purchase_date.year, purchase_date.month, charge_day)
    if candidate < purchase_date:
        year, month = shift_month(purchase_date.year, purchase_date.month, 1)
        candidate = date_on_day(year, month, charge_day)
    return candidate


def billing_period_name(interval_months: int | None) -> str:
    return BILLING_MONTHS_PERIOD.get(int(interval_months or 1), "custom")


def subscription_plan(
    billing_period: str | None,
    term_kind: str | None,
    term_months: int | None,
    term_end_date: date | None,
    start_date: date,
) -> tuple[int, str, int | None, date | None]:
    """Validate billing frequency and commitment length as independent fields."""
    interval = BILLING_PERIOD_MONTHS.get(billing_period or "monthly")
    if interval is None:
        raise HTTPException(status_code=400, detail="Billing period is invalid")
    kind = term_kind or "indefinite"
    if kind not in {"indefinite", "months", "end_date"}:
        raise HTTPException(status_code=400, detail="Commitment term is invalid")
    if kind == "months":
        if term_months is None or term_months < 1 or term_months > MAX_TERM_MONTHS:
            raise HTTPException(status_code=400, detail="Commitment months must be between 1 and 120")
        return interval, kind, int(term_months), None
    if kind == "end_date":
        if term_end_date is None:
            raise HTTPException(status_code=400, detail="Commitment end date is required")
        if term_end_date < start_date:
            raise HTTPException(status_code=400, detail="Commitment end date is before the first charge")
        return interval, kind, None, term_end_date
    return interval, "indefinite", None, None


def commitment_last_date(subscription: CardSubscription) -> date | None:
    """Last calendar day that can still hold a charge. None means open-ended."""
    kind = subscription.term_kind or "indefinite"
    if kind == "months":
        months = int(subscription.term_months or 0)
        if months < 1:
            return subscription.start_date - timedelta(days=1)
        # A 12-month monthly plan is 12 charges, so the anniversary itself is excluded.
        return add_months(subscription.start_date, months) - timedelta(days=1)
    if kind == "end_date":
        return subscription.term_end_date
    return None


def is_finite_subscription(subscription: CardSubscription) -> bool:
    return (subscription.term_kind or "indefinite") in {"months", "end_date"}


def is_scheduled_charge(subscription: CardSubscription, charge: date | None) -> bool:
    if charge is None or charge < subscription.start_date:
        return False
    if date_on_day(charge.year, charge.month, subscription.charge_day) != charge:
        return False
    interval = max(1, int(subscription.billing_interval_months or 1))
    offset = (charge.year * 12 + charge.month) - (subscription.start_date.year * 12 + subscription.start_date.month)
    if offset < 0 or offset % interval != 0:
        return False
    last = commitment_last_date(subscription)
    return last is None or charge <= last


def preview_subscription_charges(payload, today: date | None = None) -> dict:
    """Count the charges a plan will generate, using the same calendar as the planner."""
    today = today or date.today()
    charge_day = int(payload.charge_day)
    if getattr(payload, "start_date", None) is not None:
        anchor = SimpleNamespace(
            start_date=payload.start_date,
            charge_day=int(payload.current_charge_day or charge_day),
        )
        start = _start_date_for_update(anchor, charge_day, today, bool(getattr(payload, "posted", False)))
    elif getattr(payload, "purchase_date", None) is not None:
        start = first_charge_on_or_after(payload.purchase_date, charge_day)
    else:
        return {"valid": False, "reason": "missing_date", "start_date": None, "billing_interval_months": 1, "term_kind": payload.term_kind or "indefinite", "charge_count": None}

    kind = payload.term_kind or "indefinite"
    if kind == "months" and (payload.term_months is None or payload.term_months < 1 or payload.term_months > MAX_TERM_MONTHS):
        return {"valid": False, "reason": "invalid_months", "start_date": start, "billing_interval_months": 1, "term_kind": kind, "charge_count": None}
    if kind == "end_date" and payload.term_end_date is None:
        return {"valid": False, "reason": "missing_end_date", "start_date": start, "billing_interval_months": 1, "term_kind": kind, "charge_count": None}

    try:
        interval, kind, months, end = subscription_plan(
            payload.billing_period,
            kind,
            payload.term_months,
            payload.term_end_date,
            start,
        )
    except HTTPException:
        return {"valid": False, "reason": "end_before_start", "start_date": start, "billing_interval_months": 1, "term_kind": kind, "charge_count": None}

    plan = SimpleNamespace(
        start_date=start,
        term_kind=kind,
        term_months=months,
        term_end_date=end,
    )
    last = commitment_last_date(plan)
    charge_count = None if last is None else sum(1 for _ in iter_charge_dates(start, charge_day, last, interval))
    return {
        "valid": True,
        "reason": None,
        "start_date": start,
        "billing_interval_months": interval,
        "term_kind": kind,
        "charge_count": charge_count,
    }


def posted_subscription_ids(db: Session, user_id: int, subscription_ids: list[int]) -> set[int]:
    if not subscription_ids:
        return set()
    return {
        subscription_id
        for (subscription_id,) in db.query(InvoiceItem.subscription_id)
        .join(Invoice)
        .filter(Invoice.user_id == user_id, InvoiceItem.subscription_id.in_(subscription_ids))
        .distinct()
    }


def iter_charge_dates(start: date, charge_day: int, until: date, interval_months: int = 1):
    step = max(1, int(interval_months or 1))
    cursor = start
    for _ in range(_MAX_CHARGE_STEPS):
        if cursor > until:
            return
        yield cursor
        year, month = shift_month(cursor.year, cursor.month, step)
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
        # Closing day opens the next cycle, so this invoice owns [previous_closing, closing).
        if found is None and previous_closing <= candidate < closing:
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
        last = commitment_last_date(subscription)
        until = today if last is None else min(today, last)
        interval = max(1, int(subscription.billing_interval_months or 1))
        for charge_date in iter_charge_dates(subscription.start_date, subscription.charge_day, until, interval):
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


def _clear_projection(invoice: Invoice) -> None:
    invoice.projected_amount = _ZERO
    invoice.projected_total = _money(invoice.total_amount)
    invoice.projected_item_count = 0
    invoice.is_projected = False
    invoice.projected_items = []


def iter_future_charges(subscription: CardSubscription, today: date):
    """Charges still inside the commitment whose date has not been reached."""
    last = commitment_last_date(subscription)
    if last is None or last < subscription.start_date:
        return
    interval = max(1, int(subscription.billing_interval_months or 1))
    for charge in iter_charge_dates(subscription.start_date, subscription.charge_day, last, interval):
        if charge > today:
            yield charge


def _blocked_charges(db: Session, user_id: int, subscription_ids: list[int]) -> set[tuple[int, date]]:
    if not subscription_ids:
        return set()
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
    return blocked


def _invoice_has_entries(db: Session, invoice: Invoice) -> bool:
    if invoice.paid or _money(invoice.total_amount) != _ZERO:
        return True
    if db.query(InvoiceItem.id).filter(InvoiceItem.invoice_id == invoice.id).first():
        return True
    return db.query(InstallmentItem.id).filter(InstallmentItem.invoice_id == invoice.id).first() is not None


def delete_empty_invoice(db: Session, user_id: int, invoice: Invoice) -> None:
    linked_transaction_id = invoice.linked_transaction_id
    invoice.linked_transaction_id = None
    db.flush()
    transactions = db.query(Transaction).filter(Transaction.user_id == user_id)
    if linked_transaction_id:
        transactions = transactions.filter(
            or_(Transaction.invoice_id == invoice.id, Transaction.id == linked_transaction_id)
        )
    else:
        transactions = transactions.filter(Transaction.invoice_id == invoice.id)
    transactions.delete(synchronize_session=False)
    db.delete(invoice)


def ensure_commitment_invoices(db: Session, user, today: date | None = None) -> list[int]:
    """Create the missing invoices that will hold a finite subscription's future charges.

    The invoice is only a shell: no item is posted and the total stays zero, so
    the card limit is unchanged until the charge date is reached.
    """
    today = today or date.today()
    subscriptions = (
        db.query(CardSubscription)
        .options(selectinload(CardSubscription.card))
        .filter(CardSubscription.user_id == user.id, CardSubscription.active.is_(True))
        .all()
    )
    finite = [
        subscription
        for subscription in subscriptions
        if is_finite_subscription(subscription)
        and subscription.card is not None
        and subscription.card.active
        and subscription.card.user_id == user.id
    ]
    if not finite:
        return []
    blocked = _blocked_charges(db, user.id, [subscription.id for subscription in finite])
    card_ids = {subscription.credit_card_id for subscription in finite}
    existing = {
        (invoice.credit_card_id, invoice.due_date): invoice
        for invoice in db.query(Invoice)
        .filter(Invoice.user_id == user.id, Invoice.credit_card_id.in_(card_ids))
        .all()
    }
    created: list[int] = []
    allow_overdue = bool(user.allow_overdue_invoice_edits)
    for subscription in finite:
        card = subscription.card
        for charge in iter_future_charges(subscription, today):
            if (subscription.id, charge) in blocked:
                continue
            _, due = invoice_period(card.closing_day, card.due_day, charge)
            if (card.id, due) in existing:
                continue
            try:
                invoice = get_or_create_invoice(db, user.id, card, charge, allow_overdue=allow_overdue)
            except HTTPException:
                continue
            existing[(card.id, due)] = invoice
            created.append(invoice.id)
    return created


def _future_due_dates(subscription: CardSubscription, card: CreditCard | None, today: date) -> set[date]:
    if card is None or not is_finite_subscription(subscription):
        return set()
    return {
        invoice_period(card.closing_day, card.due_day, charge)[1]
        for charge in iter_future_charges(subscription, today)
    }


def _subscription_has_posted_charge(db: Session, user_id: int, subscription_id: int) -> bool:
    return (
        db.query(InvoiceItem.id)
        .join(Invoice)
        .filter(Invoice.user_id == user_id, InvoiceItem.subscription_id == subscription_id)
        .first()
        is not None
    )


def _start_date_for_update(subscription: CardSubscription, charge_day: int, today: date, posted: bool) -> date:
    """Keep the original anchor once a charge exists so later dates stay on cadence.

    With nothing posted, a new charge day moves the first charge to that day in the
    start month, or to the next occurrence that is still ahead of today.
    """
    if posted or int(subscription.charge_day) == int(charge_day):
        return subscription.start_date
    candidate = date_on_day(subscription.start_date.year, subscription.start_date.month, charge_day)
    if candidate >= today:
        return candidate
    return first_charge_on_or_after(today, charge_day)


def _drop_unneeded_shells(
    db: Session,
    user,
    card: CreditCard,
    dues: set[date],
    subscription_id: int,
    today: date,
) -> None:
    """Remove empty projection invoices whose due dates left this subscription's plan."""
    if not dues:
        return
    others = (
        db.query(CardSubscription)
        .filter(
            CardSubscription.user_id == user.id,
            CardSubscription.credit_card_id == card.id,
            CardSubscription.active.is_(True),
            CardSubscription.id != subscription_id,
        )
        .all()
    )
    blocked = _blocked_charges(db, user.id, [item.id for item in others])
    still_needed: set[date] = set()
    for other in others:
        if not is_finite_subscription(other):
            continue
        for charge in iter_future_charges(other, today):
            if (other.id, charge) in blocked:
                continue
            still_needed.add(invoice_period(card.closing_day, card.due_day, charge)[1])
    for due in dues:
        if due in still_needed:
            continue
        invoice = (
            db.query(Invoice)
            .filter(
                Invoice.user_id == user.id,
                Invoice.credit_card_id == card.id,
                Invoice.due_date == due,
            )
            .first()
        )
        if invoice is None or _invoice_has_entries(db, invoice):
            continue
        delete_empty_invoice(db, user.id, invoice)


def update_card_subscription(db: Session, user, subscription_id: int, payload, today: date | None = None) -> CardSubscription:
    """Change the plan. Posted invoice items stay as they were; forecasts follow the new plan."""
    today = today or date.today()
    subscription = (
        db.query(CardSubscription)
        .options(selectinload(CardSubscription.card), selectinload(CardSubscription.categories))
        .filter(CardSubscription.id == subscription_id, CardSubscription.user_id == user.id)
        .first()
    )
    if subscription is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if not subscription.active:
        raise HTTPException(status_code=400, detail="Ended subscriptions cannot be edited")

    description = payload.description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="Description is required")
    card = (
        db.query(CreditCard)
        .filter(CreditCard.id == payload.credit_card_id, CreditCard.user_id == user.id)
        .first()
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    if not card.active:
        raise HTTPException(status_code=400, detail="Card is inactive")

    posted = _subscription_has_posted_charge(db, user.id, subscription.id)
    start_date = _start_date_for_update(subscription, payload.charge_day, today, posted)
    interval, term_kind, term_months, term_end_date = subscription_plan(
        payload.billing_period,
        payload.term_kind,
        payload.term_months,
        payload.term_end_date,
        start_date,
    )
    selected_ids = category_ids_from_payload(payload)
    categories = list(subscription.categories) if selected_ids is None else get_user_categories(db, user.id, selected_ids)
    old_card = subscription.card
    old_card_id = old_card.id if old_card is not None else None
    old_dues = _future_due_dates(subscription, old_card, today)

    subscription.description = description
    subscription.amount = payload.amount
    subscription.charge_day = int(payload.charge_day)
    subscription.start_date = start_date
    subscription.billing_interval_months = interval
    subscription.term_kind = term_kind
    subscription.term_months = term_months
    subscription.term_end_date = term_end_date
    subscription.card = card
    set_item_categories(subscription, categories)
    db.flush()

    if old_card_id is not None:
        shell_card = old_card if old_card is not None and old_card.id == old_card_id else db.get(CreditCard, old_card_id)
        if old_card_id == card.id:
            obsolete = old_dues - _future_due_dates(subscription, card, today)
        else:
            obsolete = old_dues
        _drop_unneeded_shells(db, user, shell_card, obsolete, subscription.id, today)
    ensure_commitment_invoices(db, user, today)
    db.flush()
    return subscription


def release_unused_commitment_invoices(db: Session, user, subscription: CardSubscription, today: date | None = None) -> None:
    """Drop empty future invoices that only existed to display this commitment."""
    if not is_finite_subscription(subscription):
        return
    today = today or date.today()
    card = subscription.card
    if card is None or card.user_id != user.id:
        return
    others = (
        db.query(CardSubscription)
        .filter(
            CardSubscription.user_id == user.id,
            CardSubscription.credit_card_id == card.id,
            CardSubscription.active.is_(True),
            CardSubscription.id != subscription.id,
        )
        .all()
    )
    blocked = _blocked_charges(db, user.id, [item.id for item in others] + [subscription.id])
    still_needed: set[date] = set()
    for other in others:
        if not is_finite_subscription(other):
            continue
        for charge in iter_future_charges(other, today):
            if (other.id, charge) in blocked:
                continue
            still_needed.add(invoice_period(card.closing_day, card.due_day, charge)[1])
    for charge in iter_future_charges(subscription, today):
        _, due = invoice_period(card.closing_day, card.due_day, charge)
        if due in still_needed:
            continue
        invoice = (
            db.query(Invoice)
            .filter(
                Invoice.user_id == user.id,
                Invoice.credit_card_id == card.id,
                Invoice.due_date == due,
            )
            .first()
        )
        if invoice is None or _invoice_has_entries(db, invoice):
            continue
        delete_empty_invoice(db, user.id, invoice)


def _append_charge(slots: dict[date, dict], due: date, invoice: Invoice | None, charge: ProjectedSubscriptionItemOut) -> None:
    slot = slots.get(due)
    if slot is None:
        slots[due] = {"invoice": invoice, "charges": [charge]}
        return
    slot["charges"].append(charge)


def apply_subscription_projections(
    db: Session,
    user_id: int,
    invoices: list[Invoice],
    *,
    include_virtual: bool,
    today: date | None = None,
) -> list:
    """Attach projected charges without posting them or using the card limit.

    Open-ended subscriptions are planned only on the card's current cycle and
    the next one. Finite subscriptions are planned on every remaining charge
    through the commitment. Missing invoices for that commitment are created
    as empty shells and stay projected until the charge date.
    """
    today = today or date.today()
    invoices = list(invoices)
    user = db.get(User, user_id)
    created_ids = ensure_commitment_invoices(db, user, today) if user is not None else []
    if created_ids:
        known_ids = {invoice.id for invoice in invoices}
        created_query = (
            db.query(Invoice)
            .options(selectinload(Invoice.card))
            .filter(Invoice.id.in_(created_ids))
        )
        if known_ids:
            created_query = created_query.filter(Invoice.id.notin_(known_ids))
        invoices.extend(created_query.all())
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

    blocked = _blocked_charges(db, user_id, [subscription.id for subscription in subscriptions])

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
        real_by_due = {invoice.due_date: invoice for invoice in by_card.get(card_id, [])}
        _, current_due = invoice_period(card.closing_day, card.due_day, today)
        next_due = next_cycle_due(card.due_day, current_due)
        slots: dict[date, dict] = {}
        for subscription in card_subscriptions:
            if is_finite_subscription(subscription):
                last = commitment_last_date(subscription)
                if last is None or last < subscription.start_date:
                    continue
                interval = max(1, int(subscription.billing_interval_months or 1))
                for charge in iter_charge_dates(subscription.start_date, subscription.charge_day, last, interval):
                    if charge <= today or (subscription.id, charge) in blocked:
                        continue
                    _, due = invoice_period(card.closing_day, card.due_day, charge)
                    invoice = real_by_due.get(due)
                    if invoice is not None and invoice.paid:
                        continue
                    _append_charge(slots, due, invoice, _projected_item(subscription, charge))
                continue
            for due in (current_due, next_due):
                charge = charge_date_for_cycle(card.closing_day, card.due_day, due, subscription.charge_day)
                if not is_scheduled_charge(subscription, charge) or charge <= today:
                    continue
                if (subscription.id, charge) in blocked:
                    continue
                invoice = real_by_due.get(due)
                if invoice is not None and invoice.paid:
                    continue
                _append_charge(slots, due, invoice, _projected_item(subscription, charge))

        for due_date, slot in slots.items():
            charges = slot["charges"]
            invoice = slot["invoice"]
            if invoice is not None:
                projections.setdefault(invoice.id, []).extend(charges)
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
        if amount > 0 and not _invoice_has_entries(db, invoice):
            invoice.is_projected = True

    return list(invoices) + virtuals
