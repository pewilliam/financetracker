import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, User
from app.schemas.installments import InstallmentCreate, InstallmentItemUpdate, InstallmentPurchaseOut
from app.security import get_current_user
from app.services.invoices import create_invoice_with_transaction, invoice_accepts_new_charges, recalculate_invoice_total

router = APIRouter(prefix="/api/installments", tags=["installments"])


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _add_months(source: date, amount: int) -> date:
    month_index = source.year * 12 + source.month - 1 + amount
    year = month_index // 12
    month = month_index % 12 + 1
    day = min(source.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


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
    else:
        refund_item = InvoiceItem(
            invoice_id=item.invoice_id,
            description=description,
            amount=refund_amount,
        )
        db.add(refund_item)
        db.flush()
        item.refund_invoice_item_id = refund_item.id

    touched_invoice_ids.add(item.invoice_id)
    return touched_invoice_ids


def _invoice_for_month(
    db: Session,
    user_id: int,
    first_invoice: Invoice,
    offset: int,
    target_due_date: Optional[date] = None,
    allow_overdue: bool = False,
) -> Invoice:
    target_date = target_due_date or _add_months(first_invoice.due_date, offset)
    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.user_id == user_id,
            Invoice.template_id == first_invoice.template_id,
            Invoice.due_date >= date(target_date.year, target_date.month, 1),
            Invoice.due_date <= date(target_date.year, target_date.month, calendar.monthrange(target_date.year, target_date.month)[1]),
        )
        .order_by(Invoice.due_date)
        .first()
    )
    if invoice:
        _ensure_invoice_accepts_new_charges(invoice, allow_overdue)
        return invoice
    if target_date < date.today() and not allow_overdue:
        raise HTTPException(status_code=400, detail="Invoice no longer accepts new items")
    return create_invoice_with_transaction(db, user_id, first_invoice.template, target_date)


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
    )


def _update_purchase_totals(purchase: InstallmentPurchase, items: list[InstallmentItem]) -> None:
    purchase.installment_count = len(items)
    purchase.total_amount = _money(sum((item.amount for item in items), Decimal("0.00")))
    purchase.installment_value = _money(purchase.total_amount / purchase.installment_count) if purchase.installment_count else Decimal("0.00")


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
            .selectinload(Invoice.template),
        )
        .filter(InstallmentPurchase.user_id == current_user.id)
        .order_by(InstallmentPurchase.created_at.desc(), InstallmentPurchase.id.desc())
        .all()
    )
    return [_purchase_summary(purchase) for purchase in purchases]


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
            .selectinload(Invoice.template),
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
    first_invoice = (
        db.query(Invoice)
        .options(selectinload(Invoice.template))
        .filter(Invoice.id == payload.first_invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not first_invoice:
        raise HTTPException(status_code=404, detail="First invoice not found")
    allow_overdue = current_user.allow_overdue_invoice_edits
    _ensure_invoice_accepts_new_charges(first_invoice, allow_overdue)

    if payload.items is not None:
        raw_values = [_money(item.amount) for item in payload.items if item.amount > 0]
        invoice_ids = [item.invoice_id for item in payload.items if item.amount > 0]
        target_dates = [item.target_due_date for item in payload.items if item.amount > 0]
        if not raw_values:
            raise HTTPException(status_code=400, detail="At least one installment is required")
    elif payload.custom_values is not None:
        if len(payload.custom_values) != payload.installment_count:
            raise HTTPException(status_code=400, detail="custom_values length must match installment_count")
        raw_values = [_money(value) for value in payload.custom_values]
        invoice_ids = [None for _ in raw_values]
        target_dates = [None for _ in raw_values]
    else:
        raw_values = _split_amount(_money(payload.total_amount), payload.installment_count)
        invoice_ids = [None for _ in raw_values]
        target_dates = [None for _ in raw_values]

    if any(value <= 0 for value in raw_values):
        raise HTTPException(status_code=400, detail="Installment values must be greater than zero")

    selected_invoices = {}
    provided_ids = {invoice_id for invoice_id in invoice_ids if invoice_id}
    if provided_ids:
        rows = (
            db.query(Invoice)
            .options(selectinload(Invoice.template))
            .filter(Invoice.user_id == current_user.id, Invoice.id.in_(provided_ids))
            .all()
        )
        selected_invoices = {invoice.id: invoice for invoice in rows}
        if len(selected_invoices) != len(provided_ids):
            raise HTTPException(status_code=404, detail="One or more invoices were not found")
        for invoice in selected_invoices.values():
            _ensure_invoice_accepts_new_charges(invoice, allow_overdue)

    confirmed_total = _money(sum(raw_values, Decimal("0.00")))
    purchase = InstallmentPurchase(
        user_id=current_user.id,
        description=payload.description,
        total_amount=confirmed_total,
        installment_count=len(raw_values),
        installment_value=_money(confirmed_total / len(raw_values)),
        first_invoice_id=first_invoice.id,
    )
    db.add(purchase)
    db.flush()

    touched_invoice_ids = set()
    for index, value in enumerate(raw_values):
        selected_id = invoice_ids[index]
        invoice = selected_invoices[selected_id] if selected_id else _invoice_for_month(
            db,
            current_user.id,
            first_invoice,
            index,
            target_dates[index],
            allow_overdue,
        )
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
            .selectinload(Invoice.template),
        )
        .filter(InstallmentPurchase.id == purchase.id)
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
            .selectinload(Invoice.template),
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
