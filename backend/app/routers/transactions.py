from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Invoice, Transaction, User
from app.schemas.transactions import TransactionCreate, TransactionOut, TransactionUpdate
from app.security import get_current_user

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.post("", response_model=TransactionOut)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_future = payload.is_future
    if not is_future and payload.date > date.today():
        is_future = True

    if payload.invoice_id:
        invoice = (
            db.query(Invoice)
            .filter(Invoice.id == payload.invoice_id, Invoice.user_id == current_user.id)
            .first()
        )
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

    transaction = Transaction(
        user_id=current_user.id,
        date=payload.date,
        type=payload.type,
        amount=payload.amount,
        description=payload.description,
        is_future=is_future,
        invoice_id=payload.invoice_id,
        recurrence_id=payload.recurrence_id,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.put("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(transaction, field, value)

    if payload.invoice_id:
        invoice = (
            db.query(Invoice)
            .filter(Invoice.id == payload.invoice_id, Invoice.user_id == current_user.id)
            .first()
        )
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

    if payload.date and transaction.is_future is False and payload.date > date.today():
        transaction.is_future = True

    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if transaction.invoice_id:
        invoice = (
            db.query(Invoice)
            .filter(Invoice.id == transaction.invoice_id, Invoice.user_id == current_user.id)
            .first()
        )
        if invoice and invoice.linked_transaction_id == transaction.id:
            invoice.linked_transaction_id = None

    db.delete(transaction)
    db.commit()
    return {"status": "deleted"}
