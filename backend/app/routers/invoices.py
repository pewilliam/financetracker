from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Invoice, InvoiceItem, Transaction, User
from app.schemas.invoices import InvoiceCreate, InvoiceItemCreate, InvoiceOut, InvoicePaidUpdate
from app.security import get_current_user

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoices = (
        db.query(Invoice)
        .options(selectinload(Invoice.items))
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
    invoice = Invoice(
        user_id=current_user.id,
        name=payload.name,
        due_date=payload.due_date,
        total_amount=Decimal("0.00"),
        paid=False,
    )
    db.add(invoice)
    db.flush()

    if payload.initial_amount and payload.initial_amount > 0:
        item = InvoiceItem(
            invoice_id=invoice.id,
            description=payload.name,
            amount=payload.initial_amount,
        )
        db.add(item)
        invoice.total_amount = payload.initial_amount

    transaction = Transaction(
        user_id=current_user.id,
        date=invoice.due_date,
        type="expense",
        amount=invoice.total_amount,
        description=f"Invoice: {invoice.name}",
        is_future=invoice.due_date > date.today(),
        invoice_id=invoice.id,
    )
    db.add(transaction)
    db.flush()
    invoice.linked_transaction_id = transaction.id

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
        .options(selectinload(Invoice.items))
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
        .options(selectinload(Invoice.items))
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    item = InvoiceItem(
        invoice_id=invoice.id,
        description=payload.description,
        amount=payload.amount,
    )
    db.add(item)

    invoice.total_amount = (invoice.total_amount or Decimal("0.00")) + payload.amount
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
            linked.amount = invoice.total_amount
            linked.is_future = False if invoice.paid else invoice.due_date > date.today()

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
        .options(selectinload(Invoice.items))
        .filter(Invoice.id == invoice_id, Invoice.user_id == current_user.id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    item = db.get(InvoiceItem, item_id)
    if not item or item.invoice_id != invoice.id:
        raise HTTPException(status_code=404, detail="Item not found")

    invoice.total_amount = (invoice.total_amount or Decimal("0.00")) - item.amount
    db.delete(item)

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
            linked.amount = invoice.total_amount
            linked.is_future = False if invoice.paid else invoice.due_date > date.today()

    db.commit()
    db.refresh(invoice)
    return invoice
