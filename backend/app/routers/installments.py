import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import InstallmentItem, InstallmentPurchase, Invoice, User
from app.schemas.installments import InstallmentCreate, InstallmentPurchaseOut
from app.security import get_current_user
from app.services.invoices import create_invoice_with_transaction, recalculate_invoice_total

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


def _invoice_for_month(db: Session, user_id: int, first_invoice: Invoice, offset: int, target_due_date: Optional[date] = None) -> Invoice:
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
        return invoice
    return create_invoice_with_transaction(db, user_id, first_invoice.template, target_date)


def _purchase_summary(purchase: InstallmentPurchase) -> InstallmentPurchaseOut:
    items = sorted(purchase.items, key=lambda item: item.installment_number)
    paid_items = [item for item in items if item.invoice and item.invoice.paid]
    paid_amount = sum((item.amount for item in paid_items), Decimal("0.00"))
    remaining_amount = _money((purchase.total_amount or Decimal("0.00")) - paid_amount)
    next_item = next((item for item in items if not item.invoice or not item.invoice.paid), None)

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
        remaining_installments=max(len(items) - len(paid_items), 0),
        remaining_amount=remaining_amount,
        progress_label=f"{len(paid_items)} de {len(items)} parcelas pagas",
        next_installment=next_item,
        items=items,
    )


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
        invoice = selected_invoices[selected_id] if selected_id else _invoice_for_month(db, current_user.id, first_invoice, index, target_dates[index])
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
    db.delete(purchase)
    db.flush()
    for invoice_id in touched_invoice_ids:
        invoice = db.get(Invoice, invoice_id)
        if invoice:
            recalculate_invoice_total(db, invoice)
    db.commit()
    return None


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
    db.delete(item)
    db.flush()
    if invoice_id:
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
        purchase.installment_count = len(remaining)
        purchase.total_amount = _money(sum((row.amount for row in remaining), Decimal("0.00")))
        purchase.installment_value = _money(purchase.total_amount / purchase.installment_count)
    db.commit()
    return None
