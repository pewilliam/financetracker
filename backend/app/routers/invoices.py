from datetime import date
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, Transaction, User
from app.schemas.invoices import InvoiceItemCreate, InvoiceItemUpdate, InvoiceOut, InvoicePaidUpdate, InvoiceUpdate
from app.security import get_current_user
from app.services.credit_cards import relocate_invoice_item
from app.services.invoices import invoice_accepts_new_charges, recalculate_invoice_total
from app.services.categories import category_ids_from_payload, get_user_categories, set_item_categories

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def _invoice_detail_options():
    return (
        selectinload(Invoice.card),
        selectinload(Invoice.items).selectinload(InvoiceItem.categories),
        selectinload(Invoice.items).selectinload(InvoiceItem.category),
        selectinload(Invoice.installment_items)
        .selectinload(InstallmentItem.purchase)
        .selectinload(InstallmentPurchase.categories),
        selectinload(Invoice.installment_items)
        .selectinload(InstallmentItem.purchase)
        .selectinload(InstallmentPurchase.category),
    )


def _invoice_query(db: Session, user_id: int, *, include_items: bool):
    options = _invoice_detail_options() if include_items else (selectinload(Invoice.card),)
    return (
        db.query(Invoice)
        .options(*options)
        .filter(Invoice.user_id == user_id)
        .order_by(Invoice.due_date, Invoice.id)
    )


def _invoice_summaries(db: Session, invoices: list[Invoice]) -> list[InvoiceOut]:
    invoice_ids = [invoice.id for invoice in invoices]
    item_counts = {}
    installment_counts = {}
    if invoice_ids:
        item_counts = dict(
            db.query(InvoiceItem.invoice_id, func.count(InvoiceItem.id))
            .filter(InvoiceItem.invoice_id.in_(invoice_ids))
            .group_by(InvoiceItem.invoice_id)
            .all()
        )
        installment_counts = dict(
            db.query(InstallmentItem.invoice_id, func.count(InstallmentItem.id))
            .filter(InstallmentItem.invoice_id.in_(invoice_ids))
            .group_by(InstallmentItem.invoice_id)
            .all()
        )
    return [
        InvoiceOut(
            id=invoice.id,
            credit_card_id=invoice.credit_card_id,
            name=invoice.name,
            color=invoice.color,
            due_date=invoice.due_date,
            total_amount=invoice.total_amount,
            paid=invoice.paid,
            linked_transaction_id=invoice.linked_transaction_id,
            created_at=invoice.created_at,
            items_included=False,
            item_count=int(item_counts.get(invoice.id, 0)),
            installment_item_count=int(installment_counts.get(invoice.id, 0)),
        )
        for invoice in invoices
    ]


def load_user_invoice(db: Session, user_id: int, invoice_id: int) -> Invoice:
    invoice = (
        _invoice_query(db, user_id, include_items=True)
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    include_items: bool = True,
    ids: Annotated[list[int] | None, Query()] = None,
    credit_card_id: Annotated[int | None, Query(ge=1)] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _invoice_query(db, current_user.id, include_items=include_items)
    if ids:
        query = query.filter(Invoice.id.in_(ids))
    if credit_card_id is not None:
        query = query.filter(Invoice.credit_card_id == credit_card_id)
    invoices = query.all()
    if include_items:
        return invoices
    return _invoice_summaries(db, invoices)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        _invoice_query(db, current_user.id, include_items=True)
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(*_invoice_detail_options())
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice.due_date = payload.due_date
    recalculate_invoice_total(db, invoice)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.patch("/{invoice_id}/paid", response_model=InvoiceOut)
def set_invoice_paid(
    invoice_id: int,
    payload: InvoicePaidUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(*_invoice_detail_options())
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice.paid = payload.paid
    if invoice.linked_transaction_id:
        linked = (
            db.query(Transaction)
            .filter(
                Transaction.id == invoice.linked_transaction_id,
                Transaction.user_id == current_user.id,
            )
            .first()
        )
        if linked:
            linked.is_future = False if payload.paid else invoice.due_date > date.today()

    db.commit()
    db.refresh(invoice)
    return invoice


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(*_invoice_detail_options())
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.items or invoice.installment_items:
        raise HTTPException(status_code=409, detail="Remova os itens da fatura antes de excluí-la.")

    # A fatura vazia só carrega a transação de valor zero criada junto com ela.
    linked_transaction_id = invoice.linked_transaction_id
    invoice.linked_transaction_id = None
    db.flush()

    transactions = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if linked_transaction_id:
        transactions = transactions.filter(
            or_(Transaction.invoice_id == invoice.id, Transaction.id == linked_transaction_id)
        )
    else:
        transactions = transactions.filter(Transaction.invoice_id == invoice.id)
    transactions.delete(synchronize_session=False)

    db.delete(invoice)
    db.commit()
    return None


@router.post("/{invoice_id}/items", response_model=InvoiceOut)
def add_invoice_item(
    invoice_id: int,
    payload: InvoiceItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(*_invoice_detail_options())
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not invoice_accepts_new_charges(invoice, current_user.allow_overdue_invoice_edits):
        raise HTTPException(status_code=400, detail="Invoice no longer accepts new items")

    selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))

    item = InvoiceItem(
        invoice_id=invoice.id,
        description=payload.description,
        amount=payload.amount,
        category_id=payload.category_id,
        purchase_date=payload.purchase_date or invoice.due_date,
    )
    set_item_categories(item, selected_categories)
    db.add(item)

    db.flush()
    recalculate_invoice_total(db, invoice)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.delete("/{invoice_id}/items/{item_id}", response_model=InvoiceOut)
def delete_invoice_item(
    invoice_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(*_invoice_detail_options())
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    item = db.get(InvoiceItem, item_id)
    if not item or item.invoice_id != invoice.id:
        raise HTTPException(status_code=404, detail="Item not found")

    refund_installment = (
        db.query(InstallmentItem)
        .filter(InstallmentItem.refund_invoice_item_id == item.id)
        .first()
    )
    if refund_installment:
        refund_installment.status = "pending"
        refund_installment.refund_invoice_item_id = None

    db.delete(item)
    db.flush()
    recalculate_invoice_total(db, invoice)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.put("/{invoice_id}/items/{item_id}", response_model=InvoiceOut)
def update_invoice_item(
    invoice_id: int,
    item_id: int,
    payload: InvoiceItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(*_invoice_detail_options())
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    item = db.get(InvoiceItem, item_id)
    if not item or item.invoice_id != invoice.id:
        raise HTTPException(status_code=404, detail="Item not found")

    selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))

    item.description = payload.description
    item.amount = payload.amount
    set_item_categories(item, selected_categories)
    moved = payload.purchase_date is not None and payload.purchase_date != item.purchase_date
    if moved:
        invoice = relocate_invoice_item(
            db,
            current_user.id,
            item,
            payload.purchase_date,
            allow_overdue=current_user.allow_overdue_invoice_edits,
        )
    db.flush()
    recalculate_invoice_total(db, invoice)

    db.commit()
    return load_user_invoice(db, current_user.id, invoice.id)
