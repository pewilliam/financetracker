from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import InstallmentItem, Invoice, InvoiceItem, InvoiceTemplate, Transaction, User
from app.schemas.invoices import InvoiceCreate, InvoiceItemCreate, InvoiceItemUpdate, InvoiceOut, InvoicePaidUpdate
from app.security import get_current_user
from app.services.invoices import create_invoice_with_transaction, invoice_accepts_new_charges, recalculate_invoice_total

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoices = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.template),
            selectinload(Invoice.installment_items).selectinload(InstallmentItem.purchase),
        )
        .filter(Invoice.user_id == current_user.id)
        .order_by(Invoice.due_date)
        .all()
    )
    return invoices


@router.post("", response_model=InvoiceOut)
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = (
        db.query(InvoiceTemplate)
        .filter(InvoiceTemplate.id == payload.template_id, InvoiceTemplate.user_id == current_user.id, InvoiceTemplate.active.is_(True))
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Invoice template not found")

    invoice = create_invoice_with_transaction(db, current_user.id, template, payload.due_date)

    if payload.initial_amount and payload.initial_amount > 0:
        item = InvoiceItem(
            invoice_id=invoice.id,
            description=template.name,
            amount=payload.initial_amount,
        )
        db.add(item)
        db.flush()
        recalculate_invoice_total(db, invoice)

    db.commit()
    db.refresh(invoice)
    invoice.template = template
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
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.template),
            selectinload(Invoice.installment_items).selectinload(InstallmentItem.purchase),
        )
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


@router.post("/{invoice_id}/items", response_model=InvoiceOut)
def add_invoice_item(
    invoice_id: int,
    payload: InvoiceItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.template),
            selectinload(Invoice.installment_items).selectinload(InstallmentItem.purchase),
        )
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not invoice_accepts_new_charges(invoice):
        raise HTTPException(status_code=400, detail="Invoice no longer accepts new items")

    item = InvoiceItem(
        invoice_id=invoice.id,
        description=payload.description,
        amount=payload.amount,
    )
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
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.template),
            selectinload(Invoice.installment_items).selectinload(InstallmentItem.purchase),
        )
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    item = db.get(InvoiceItem, item_id)
    if not item or item.invoice_id != invoice.id:
        raise HTTPException(status_code=404, detail="Item not found")

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
        .options(
            selectinload(Invoice.items),
            selectinload(Invoice.template),
            selectinload(Invoice.installment_items).selectinload(InstallmentItem.purchase),
        )
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    item = db.get(InvoiceItem, item_id)
    if not item or item.invoice_id != invoice.id:
        raise HTTPException(status_code=404, detail="Item not found")

    item.description = payload.description
    item.amount = payload.amount

    db.flush()
    recalculate_invoice_total(db, invoice)

    db.commit()
    db.refresh(invoice)
    return invoice
