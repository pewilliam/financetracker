from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Receivable, ReceivablePayment, Transaction, User
from app.schemas.receivables import (
    ReceivableCreate,
    ReceivableOut,
    ReceivablePaidPayload,
    ReceivablePaymentCreate,
    ReceivableUpdate,
)
from app.security import get_current_user

router = APIRouter(prefix="/api/receivables", tags=["receivables"])


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _status_for(receivable: Receivable) -> str:
    total = _money(receivable.total_amount)
    received = _money(receivable.received_amount)
    if received >= total:
        return "paid"
    if receivable.due_date < date.today():
        return "overdue"
    if received > 0:
        return "partial"
    return "pending"


def _sync_status(receivable: Receivable) -> None:
    receivable.status = _status_for(receivable)
    if receivable.status != "paid":
        receivable.paid_at = None


def _load_receivable(db: Session, receivable_id: int, user_id: int) -> Receivable:
    receivable = (
        db.query(Receivable)
        .options(selectinload(Receivable.payments))
        .filter(Receivable.id == receivable_id, Receivable.user_id == user_id)
        .first()
    )
    if not receivable:
        raise HTTPException(status_code=404, detail="Receivable not found")
    return receivable


def _create_income_transaction(db: Session, user_id: int, receivable: Receivable, amount: Decimal, paid_at: date) -> Transaction:
    transaction = Transaction(
        user_id=user_id,
        date=paid_at,
        type="income",
        amount=amount,
        description=f"Recebimento - {receivable.person_name}: {receivable.description}",
        is_future=False,
    )
    db.add(transaction)
    db.flush()
    return transaction


def _register_payment(
    db: Session,
    user_id: int,
    receivable: Receivable,
    amount: Decimal,
    paid_at: date,
) -> Receivable:
    if paid_at > date.today():
        raise HTTPException(status_code=400, detail="Payment date cannot be in the future")

    _sync_status(receivable)
    if receivable.status == "paid":
        raise HTTPException(status_code=400, detail="Receivable already paid")

    payment_amount = _money(amount)
    remaining = _money(receivable.total_amount) - _money(receivable.received_amount)
    if payment_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    if payment_amount > remaining:
        raise HTTPException(status_code=400, detail="Payment amount exceeds remaining amount")

    transaction = _create_income_transaction(db, user_id, receivable, payment_amount, paid_at)
    payment = ReceivablePayment(
        receivable_id=receivable.id,
        transaction_id=transaction.id,
        amount=payment_amount,
        paid_at=paid_at,
    )
    db.add(payment)
    receivable.received_amount = _money(receivable.received_amount) + payment_amount

    if _money(receivable.received_amount) >= _money(receivable.total_amount):
        receivable.received_amount = _money(receivable.total_amount)
        receivable.status = "paid"
        receivable.paid_at = paid_at
    else:
        _sync_status(receivable)

    db.commit()
    return _load_receivable(db, receivable.id, user_id)


@router.get("", response_model=list[ReceivableOut])
def list_receivables(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivables = (
        db.query(Receivable)
        .options(selectinload(Receivable.payments))
        .filter(Receivable.user_id == current_user.id)
        .order_by(Receivable.due_date, Receivable.id)
        .all()
    )
    changed = False
    for receivable in receivables:
        previous = receivable.status
        _sync_status(receivable)
        changed = changed or previous != receivable.status
    if changed:
        db.commit()

    if status:
        receivables = [receivable for receivable in receivables if receivable.status == status]
    return receivables


@router.post("", response_model=ReceivableOut)
def create_receivable(
    payload: ReceivableCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = Receivable(
        user_id=current_user.id,
        person_name=payload.person_name.strip(),
        description=payload.description.strip(),
        total_amount=_money(payload.total_amount),
        received_amount=Decimal("0.00"),
        due_date=payload.due_date,
        notes=payload.notes.strip() if payload.notes else None,
    )
    if not receivable.person_name or not receivable.description:
        raise HTTPException(status_code=400, detail="Person name and description are required")

    _sync_status(receivable)
    db.add(receivable)
    db.commit()
    return _load_receivable(db, receivable.id, current_user.id)


@router.put("/{receivable_id}", response_model=ReceivableOut)
def update_receivable(
    receivable_id: int,
    payload: ReceivableUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    data = payload.model_dump(exclude_unset=True)

    if "person_name" in data:
        receivable.person_name = data["person_name"].strip()
    if "description" in data:
        receivable.description = data["description"].strip()
    if "total_amount" in data:
        next_total = _money(data["total_amount"])
        if next_total < _money(receivable.received_amount):
            raise HTTPException(status_code=400, detail="Total amount cannot be lower than received amount")
        receivable.total_amount = next_total
    if "due_date" in data:
        receivable.due_date = data["due_date"]
    if "notes" in data:
        receivable.notes = data["notes"].strip() if data["notes"] else None

    if not receivable.person_name or not receivable.description:
        raise HTTPException(status_code=400, detail="Person name and description are required")

    _sync_status(receivable)
    db.commit()
    return _load_receivable(db, receivable.id, current_user.id)


@router.patch("/{receivable_id}/paid", response_model=ReceivableOut)
def mark_receivable_paid(
    receivable_id: int,
    payload: ReceivablePaidPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    remaining = _money(receivable.total_amount) - _money(receivable.received_amount)
    return _register_payment(db, current_user.id, receivable, remaining, payload.paid_at)


@router.post("/{receivable_id}/payments", response_model=ReceivableOut)
def create_receivable_payment(
    receivable_id: int,
    payload: ReceivablePaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    return _register_payment(db, current_user.id, receivable, payload.amount, payload.paid_at)
