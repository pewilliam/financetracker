from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Category, CreditCard, InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, User
from app.schemas.installments import InstallmentCategoryUpdate, InstallmentCreate, InstallmentItemUpdate, InstallmentPageOut, InstallmentPurchaseOut
from app.security import get_current_user
from app.services.credit_cards import add_months, first_installment_due_allowed, get_or_create_invoice, invoice_period
from app.services.invoices import invoice_accepts_new_charges, recalculate_invoice_total
from app.services.categories import category_ids_from_payload, get_user_categories, set_item_categories

router = APIRouter(prefix="/api/installments", tags=["installments"])


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _add_months(source: date, amount: int) -> date:
    return add_months(source, amount)


def _split_amount(total: Decimal, count: int) -> list[Decimal]:
    base = _money(total / count)
    values = [base for _ in range(count)]
    values[-1] = _money(total - sum(values[:-1], Decimal("0.00")))
    return values


def _ensure_invoice_accepts_new_charges(invoice: Invoice, allow_overdue: bool = False) -> None:
    if not invoice_accepts_new_charges(invoice, allow_overdue):
        raise HTTPException(status_code=400, detail="Invoice no longer accepts new items")


def _delete_refund_invoice_item(db: Session, item: InstallmentItem) -> set[int]:
    touched_invoice_ids = set()
    if not item.refund_invoice_item_id:
        return touched_invoice_ids

    refund_item = db.get(InvoiceItem, item.refund_invoice_item_id)
    if refund_item:
        touched_invoice_ids.add(refund_item.invoice_id)
        db.delete(refund_item)
    item.refund_invoice_item_id = None
    return touched_invoice_ids


def _sync_refund_invoice_item(db: Session, item: InstallmentItem) -> set[int]:
    touched_invoice_ids = set()
    refund_item = db.get(InvoiceItem, item.refund_invoice_item_id) if item.refund_invoice_item_id else None

    if item.status != "refunded" or not item.invoice_id:
        return touched_invoice_ids | _delete_refund_invoice_item(db, item)

    description = f"Reembolso: {item.description}"
    refund_amount = -_money(item.amount)

    if refund_item:
        touched_invoice_ids.add(refund_item.invoice_id)
        refund_item.invoice_id = item.invoice_id
        refund_item.description = description
        refund_item.amount = refund_amount
        if refund_item.purchase_date is None and item.invoice is not None:
            refund_item.purchase_date = item.invoice.due_date
        set_item_categories(refund_item, list(item.purchase.categories))
    else:
        refund_item = InvoiceItem(
            invoice_id=item.invoice_id,
            description=description,
            amount=refund_amount,
            category_id=item.purchase.category_id,
            purchase_date=item.invoice.due_date if item.invoice is not None else None,
        )
        set_item_categories(refund_item, list(item.purchase.categories))
        db.add(refund_item)
        db.flush()
        item.refund_invoice_item_id = refund_item.id

    touched_invoice_ids.add(item.invoice_id)
    return touched_invoice_ids


def _ensure_first_installment_due_allowed(card: CreditCard, purchase_date: date) -> None:
    _, due_date = invoice_period(card.closing_day, card.due_day, purchase_date)
    if not first_installment_due_allowed(due_date):
        raise HTTPException(status_code=400, detail="First installment invoice is more than 12 months ahead")


def _invoice_for_purchase(
    db: Session,
    user_id: int,
    card: CreditCard,
    purchase_date: date,
    allow_overdue: bool = False,
) -> Invoice:
    return get_or_create_invoice(db, user_id, card, purchase_date, allow_overdue=allow_overdue)


def _purchase_summary(purchase: InstallmentPurchase) -> InstallmentPurchaseOut:
    items = sorted(purchase.items, key=lambda item: item.installment_number)
    pending_items = [item for item in items if item.status == "pending"]
    paid_items = [item for item in pending_items if item.invoice and item.invoice.paid]
    refunded_items = [item for item in items if item.status == "refunded"]
    canceled_items = [item for item in items if item.status == "canceled"]
    paid_amount = sum((item.amount for item in paid_items), Decimal("0.00"))
    remaining_items = [item for item in pending_items if not item.invoice or not item.invoice.paid]
    remaining_amount = _money(sum((item.amount for item in remaining_items), Decimal("0.00")))
    next_item = next(iter(remaining_items), None)
    progress_parts = [f"{len(paid_items)} de {len(items)} parcelas pagas"]
    if refunded_items:
        progress_parts.append(f"{len(refunded_items)} reembolsada{'s' if len(refunded_items) != 1 else ''}")
    if canceled_items:
        progress_parts.append(f"{len(canceled_items)} cancelada{'s' if len(canceled_items) != 1 else ''}")

    return InstallmentPurchaseOut(
        id=purchase.id,
        description=purchase.description,
        total_amount=purchase.total_amount,
        installment_count=purchase.installment_count,
        installment_value=purchase.installment_value,
        first_invoice_id=purchase.first_invoice_id,
        created_at=purchase.created_at,
        paid_installments=len(paid_items),
        paid_amount=paid_amount,
        remaining_installments=len(remaining_items),
        remaining_amount=remaining_amount,
        progress_label=" • ".join(progress_parts),
        next_installment=next_item,
        items=items,
        category_id=purchase.category_id,
        category_ids=purchase.category_ids,
        category=purchase.category,
        categories=purchase.categories,
    )


def _update_purchase_totals(purchase: InstallmentPurchase, items: list[InstallmentItem]) -> None:
    purchase.installment_count = len(items)
    purchase.total_amount = _money(sum((item.amount for item in items), Decimal("0.00")))
    purchase.installment_value = _money(purchase.total_amount / purchase.installment_count) if purchase.installment_count else Decimal("0.00")


def _apply_installment_filters(
    query,
    *,
    search: str = "",
    category_ids: list[int] | None = None,
    credit_card_id: int | None = None,
    situation: str = "all",
    has_overdue=None,
    has_soon=None,
):
    if search.strip():
        query = query.filter(InstallmentPurchase.description.ilike(f"%{search.strip()}%"))
    if category_ids:
        query = query.filter(or_(
            InstallmentPurchase.category_id.in_(category_ids),
            InstallmentPurchase.categories.any(Category.id.in_(category_ids)),
        ))
    if credit_card_id:
        query = query.filter(InstallmentPurchase.items.any(
            InstallmentItem.invoice.has(Invoice.credit_card_id == credit_card_id)
        ))
    if situation == "overdue" and has_overdue is not None:
        query = query.filter(has_overdue)
    elif situation == "soon" and has_overdue is not None and has_soon is not None:
        query = query.filter(~has_overdue, has_soon)
    elif situation == "regular" and has_overdue is not None and has_soon is not None:
        query = query.filter(~has_overdue, ~has_soon)
    return query


@router.get("", response_model=list[InstallmentPurchaseOut])
def list_installments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    purchases = (
        db.query(InstallmentPurchase)
        .options(
            selectinload(InstallmentPurchase.items)
            .selectinload(InstallmentItem.invoice)
            .selectinload(Invoice.card),
        )
        .filter(InstallmentPurchase.user_id == current_user.id)
        .order_by(InstallmentPurchase.created_at.desc(), InstallmentPurchase.id.desc())
        .all()
    )
    return [_purchase_summary(purchase) for purchase in purchases]


@router.get("/page", response_model=InstallmentPageOut)
def list_installments_page(
    tab: str = Query(default="active", pattern="^(active|paid)$"),
    search: str = Query(default="", max_length=255),
    category_ids: list[int] | None = Query(default=None),
    credit_card_id: int | None = Query(default=None, ge=1),
    situation: str = Query(default="all", pattern="^(all|regular|soon|overdue)$"),
    sort_by: str = Query(default="nextDue", pattern="^(nextDue|remaining|installment|progress|newest|oldest|alphabetical)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=48),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return one filtered page with overview totals recalculated for the same filters."""
    today = date.today()
    soon_limit = today + timedelta(days=7)
    current_month_start = date(today.year, today.month, 1)
    current_month_end = _add_months(current_month_start, 1)
    filter_kwargs = {
        "search": search,
        "category_ids": category_ids,
        "credit_card_id": credit_card_id,
        "situation": situation,
    }

    paid_count = (
        select(func.count(InstallmentItem.id))
        .join(Invoice, Invoice.id == InstallmentItem.invoice_id)
        .where(
            InstallmentItem.purchase_id == InstallmentPurchase.id,
            InstallmentItem.status == "pending",
            Invoice.paid.is_(True),
        )
        .correlate(InstallmentPurchase)
        .scalar_subquery()
    )
    next_due = (
        select(func.min(Invoice.due_date))
        .join(InstallmentItem, InstallmentItem.invoice_id == Invoice.id)
        .where(
            InstallmentItem.purchase_id == InstallmentPurchase.id,
            InstallmentItem.status == "pending",
            Invoice.paid.is_(False),
        )
        .correlate(InstallmentPurchase)
        .scalar_subquery()
    )
    remaining_value = (
        select(func.coalesce(func.sum(InstallmentItem.amount), 0))
        .select_from(InstallmentItem)
        .outerjoin(Invoice, Invoice.id == InstallmentItem.invoice_id)
        .where(
            InstallmentItem.purchase_id == InstallmentPurchase.id,
            InstallmentItem.status == "pending",
            or_(InstallmentItem.invoice_id.is_(None), Invoice.paid.is_(False)),
        )
        .correlate(InstallmentPurchase)
        .scalar_subquery()
    )
    has_overdue = InstallmentPurchase.items.any(
        (InstallmentItem.status == "pending")
        & InstallmentItem.invoice.has((Invoice.paid.is_(False)) & (Invoice.due_date < today))
    )
    has_soon = InstallmentPurchase.items.any(
        (InstallmentItem.status == "pending")
        & InstallmentItem.invoice.has(
            (Invoice.paid.is_(False))
            & (Invoice.due_date >= today)
            & (Invoice.due_date <= soon_limit)
        )
    )
    filter_kwargs["has_overdue"] = has_overdue
    filter_kwargs["has_soon"] = has_soon

    paid_off_expression = paid_count == InstallmentPurchase.installment_count
    base_query = _apply_installment_filters(
        db.query(InstallmentPurchase).filter(InstallmentPurchase.user_id == current_user.id),
        **filter_kwargs,
    )
    query = base_query.filter(paid_off_expression if tab == "paid" else ~paid_off_expression)

    total = query.count()
    order_map = {
        "nextDue": (next_due.is_(None), next_due.asc(), InstallmentPurchase.id.desc()),
        "remaining": (remaining_value.desc(), InstallmentPurchase.id.desc()),
        "installment": (InstallmentPurchase.installment_value.desc(), InstallmentPurchase.id.desc()),
        "progress": ((paid_count / func.nullif(InstallmentPurchase.installment_count, 0)).desc(), InstallmentPurchase.id.desc()),
        "newest": (InstallmentPurchase.created_at.desc(), InstallmentPurchase.id.desc()),
        "oldest": (InstallmentPurchase.created_at.asc(), InstallmentPurchase.id.asc()),
        "alphabetical": (InstallmentPurchase.description.asc(), InstallmentPurchase.id.desc()),
    }
    purchases = (
        query.options(
            selectinload(InstallmentPurchase.items)
            .selectinload(InstallmentItem.invoice)
            .selectinload(Invoice.card),
            selectinload(InstallmentPurchase.categories),
        )
        .order_by(*order_map[sort_by])
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    active_count = (
        _apply_installment_filters(
            db.query(InstallmentPurchase).filter(InstallmentPurchase.user_id == current_user.id),
            **filter_kwargs,
        )
        .filter(~paid_off_expression)
        .with_entities(func.count(InstallmentPurchase.id))
        .scalar()
    ) or 0
    paid_off_count = (
        _apply_installment_filters(
            db.query(InstallmentPurchase).filter(InstallmentPurchase.user_id == current_user.id),
            **filter_kwargs,
        )
        .filter(paid_off_expression)
        .with_entities(func.count(InstallmentPurchase.id))
        .scalar()
    ) or 0
    pending_item_query = _apply_installment_filters(
        db.query(InstallmentItem)
        .join(InstallmentPurchase, InstallmentPurchase.id == InstallmentItem.purchase_id)
        .outerjoin(Invoice, Invoice.id == InstallmentItem.invoice_id)
        .filter(
            InstallmentPurchase.user_id == current_user.id,
            InstallmentItem.status == "pending",
            or_(InstallmentItem.invoice_id.is_(None), Invoice.paid.is_(False)),
        ),
        **filter_kwargs,
    )
    remaining_amount = pending_item_query.with_entities(func.coalesce(func.sum(InstallmentItem.amount), 0)).scalar() or 0
    current_month_count, current_month_amount = (
        pending_item_query.filter(
            Invoice.due_date >= current_month_start,
            Invoice.due_date < current_month_end,
        )
        .with_entities(func.count(InstallmentItem.id), func.coalesce(func.sum(InstallmentItem.amount), 0))
        .one()
    )
    overdue_count, overdue_amount = (
        pending_item_query.filter(Invoice.due_date < today)
        .with_entities(func.count(InstallmentItem.id), func.coalesce(func.sum(InstallmentItem.amount), 0))
        .one()
    )
    forecast = []
    for offset in range(6):
        start = _add_months(current_month_start, offset)
        end = _add_months(current_month_start, offset + 1)
        amount = (
            pending_item_query.filter(Invoice.due_date >= start, Invoice.due_date < end)
            .with_entities(func.coalesce(func.sum(InstallmentItem.amount), 0))
            .scalar()
        ) or 0
        forecast.append({"month": start.strftime("%Y-%m"), "amount": _money(amount)})

    return {
        "items": [_purchase_summary(purchase) for purchase in purchases],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
        "summary": {
            "active_count": active_count,
            "paid_off_count": paid_off_count,
            "current_month_count": current_month_count,
            "current_month_amount": _money(current_month_amount),
            "remaining_amount": _money(remaining_amount),
            "overdue_count": overdue_count,
            "overdue_amount": _money(overdue_amount),
            "forecast": forecast,
        },
    }


@router.get("/{purchase_id}", response_model=InstallmentPurchaseOut)
def get_installment(
    purchase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    purchase = (
        db.query(InstallmentPurchase)
        .options(
            selectinload(InstallmentPurchase.items)
            .selectinload(InstallmentItem.invoice)
            .selectinload(Invoice.card),
        )
        .filter(InstallmentPurchase.id == purchase_id, InstallmentPurchase.user_id == current_user.id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Installment purchase not found")
    return _purchase_summary(purchase)


@router.post("", response_model=InstallmentPurchaseOut)
def create_installment(
    payload: InstallmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))
    card = (
        db.query(CreditCard)
        .filter(
            CreditCard.id == payload.credit_card_id,
            CreditCard.user_id == current_user.id,
            CreditCard.active.is_(True),
        )
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    allow_overdue = current_user.allow_overdue_invoice_edits

    if payload.items is not None:
        selected_items = [item for item in payload.items if item.amount > 0]
        raw_values = [_money(item.amount) for item in selected_items]
        purchase_dates = [
            item.purchase_date or _add_months(payload.first_purchase_date, index)
            for index, item in enumerate(selected_items)
        ]
        if not raw_values:
            raise HTTPException(status_code=400, detail="At least one installment is required")
    elif payload.custom_values is not None:
        if len(payload.custom_values) != payload.installment_count:
            raise HTTPException(status_code=400, detail="custom_values length must match installment_count")
        raw_values = [_money(value) for value in payload.custom_values]
        purchase_dates = [_add_months(payload.first_purchase_date, index) for index in range(len(raw_values))]
    else:
        raw_values = _split_amount(_money(payload.total_amount), payload.installment_count)
        purchase_dates = [_add_months(payload.first_purchase_date, index) for index in range(len(raw_values))]

    if any(value <= 0 for value in raw_values):
        raise HTTPException(status_code=400, detail="Installment values must be greater than zero")
    _ensure_first_installment_due_allowed(card, purchase_dates[0])

    confirmed_total = _money(sum(raw_values, Decimal("0.00")))
    purchase = InstallmentPurchase(
        user_id=current_user.id,
        description=payload.description,
        total_amount=confirmed_total,
        installment_count=len(raw_values),
        installment_value=_money(confirmed_total / len(raw_values)),
        category_id=payload.category_id,
    )
    set_item_categories(purchase, selected_categories)
    db.add(purchase)
    db.flush()

    touched_invoice_ids = set()
    first_invoice = None
    for index, value in enumerate(raw_values):
        invoice = _invoice_for_purchase(db, current_user.id, card, purchase_dates[index], allow_overdue)
        if first_invoice is None:
            first_invoice = invoice
            purchase.first_invoice_id = invoice.id
        touched_invoice_ids.add(invoice.id)
        db.add(
            InstallmentItem(
                purchase_id=purchase.id,
                invoice_id=invoice.id,
                installment_number=index + 1,
                amount=value,
                description=f"{payload.description} ({index + 1}/{len(raw_values)})",
            )
        )

    db.flush()
    for invoice_id in touched_invoice_ids:
        invoice = db.get(Invoice, invoice_id)
        if invoice:
            recalculate_invoice_total(db, invoice)

    db.commit()
    purchase = (
        db.query(InstallmentPurchase)
        .options(
            selectinload(InstallmentPurchase.items)
            .selectinload(InstallmentItem.invoice)
            .selectinload(Invoice.card),
        )
        .filter(InstallmentPurchase.id == purchase.id)
        .first()
    )
    return _purchase_summary(purchase)


@router.patch("/{purchase_id}/category", response_model=InstallmentPurchaseOut)
def update_installment_category(
    purchase_id: int,
    payload: InstallmentCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))
    purchase = (
        db.query(InstallmentPurchase)
        .options(selectinload(InstallmentPurchase.items))
        .filter(InstallmentPurchase.id == purchase_id, InstallmentPurchase.user_id == current_user.id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Installment purchase not found")

    set_item_categories(purchase, selected_categories)
    refund_item_ids = [item.refund_invoice_item_id for item in purchase.items if item.refund_invoice_item_id]
    if refund_item_ids:
        for refund_item in db.query(InvoiceItem).filter(InvoiceItem.id.in_(refund_item_ids)).all():
            set_item_categories(refund_item, selected_categories)
    db.commit()

    purchase = (
        db.query(InstallmentPurchase)
        .options(
            selectinload(InstallmentPurchase.items)
            .selectinload(InstallmentItem.invoice)
            .selectinload(Invoice.card),
        )
        .filter(InstallmentPurchase.id == purchase_id, InstallmentPurchase.user_id == current_user.id)
        .first()
    )
    return _purchase_summary(purchase)


@router.delete("/{purchase_id}", status_code=204)
def delete_installment(
    purchase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    purchase = (
        db.query(InstallmentPurchase)
        .options(selectinload(InstallmentPurchase.items))
        .filter(InstallmentPurchase.id == purchase_id, InstallmentPurchase.user_id == current_user.id)
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=404, detail="Installment purchase not found")

    touched_invoice_ids = {item.invoice_id for item in purchase.items if item.invoice_id}
    for item in purchase.items:
        touched_invoice_ids |= _delete_refund_invoice_item(db, item)
    db.delete(purchase)
    db.flush()
    for invoice_id in touched_invoice_ids:
        invoice = db.get(Invoice, invoice_id)
        if invoice:
            recalculate_invoice_total(db, invoice)
    db.commit()
    return None


@router.put("/items/{item_id}", response_model=InstallmentPurchaseOut)
def update_installment_item(
    item_id: int,
    payload: InstallmentItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(InstallmentItem)
        .join(InstallmentPurchase)
        .filter(InstallmentItem.id == item_id, InstallmentPurchase.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Installment item not found")

    target_invoice = None
    target_invoice_id = None if payload.status == "canceled" else payload.invoice_id
    if target_invoice_id is not None:
        target_invoice = (
            db.query(Invoice)
            .filter(Invoice.id == target_invoice_id, Invoice.user_id == current_user.id)
            .first()
        )
        if not target_invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if target_invoice.id != item.invoice_id:
            _ensure_invoice_accepts_new_charges(target_invoice, current_user.allow_overdue_invoice_edits)
            if item.installment_number == 1 and not first_installment_due_allowed(target_invoice.due_date):
                raise HTTPException(status_code=400, detail="First installment invoice is more than 12 months ahead")

    if payload.status == "refunded" and not target_invoice:
        raise HTTPException(status_code=400, detail="Refunded installment requires an invoice")

    purchase = item.purchase
    previous_invoice_id = item.invoice_id
    item.amount = _money(payload.amount)
    item.status = payload.status
    item.invoice_id = target_invoice.id if target_invoice else None
    if item.installment_number == 1:
        purchase.first_invoice_id = item.invoice_id

    items = (
        db.query(InstallmentItem)
        .filter(InstallmentItem.purchase_id == purchase.id)
        .order_by(InstallmentItem.installment_number)
        .all()
    )
    _update_purchase_totals(purchase, items)

    db.flush()
    touched_invoice_ids = {previous_invoice_id, item.invoice_id} - {None}
    touched_invoice_ids |= _sync_refund_invoice_item(db, item)
    db.flush()
    for invoice_id in touched_invoice_ids:
        invoice = db.get(Invoice, invoice_id)
        if invoice:
            recalculate_invoice_total(db, invoice)

    db.commit()
    purchase = (
        db.query(InstallmentPurchase)
        .options(
            selectinload(InstallmentPurchase.items)
            .selectinload(InstallmentItem.invoice)
            .selectinload(Invoice.card),
        )
        .filter(InstallmentPurchase.id == purchase.id, InstallmentPurchase.user_id == current_user.id)
        .first()
    )
    return _purchase_summary(purchase)


@router.delete("/items/{item_id}", status_code=204)
def delete_installment_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(InstallmentItem)
        .join(InstallmentPurchase)
        .filter(InstallmentItem.id == item_id, InstallmentPurchase.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Installment item not found")

    purchase = item.purchase
    invoice_id = item.invoice_id
    touched_invoice_ids = {invoice_id} - {None}
    touched_invoice_ids |= _delete_refund_invoice_item(db, item)
    db.delete(item)
    db.flush()
    for invoice_id in touched_invoice_ids:
        invoice = db.get(Invoice, invoice_id)
        if invoice:
            recalculate_invoice_total(db, invoice)
    remaining = (
        db.query(InstallmentItem)
        .filter(InstallmentItem.purchase_id == purchase.id)
        .order_by(InstallmentItem.installment_number)
        .all()
    )
    if not remaining:
        db.delete(purchase)
    else:
        _update_purchase_totals(purchase, remaining)
    db.commit()
    return None
