from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Receivable, ReceivablePayment, ReceivablePerson, Transaction, User
from app.schemas.receivables import (
    ReceivableCreate,
    ReceivableOut,
    ReceivablePaidPayload,
    ReceivablePaymentCreate,
    ReceivablePersonCreate,
    ReceivablePersonOut,
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
    if received > 0:
        return "partial"
    if receivable.due_date < date.today():
        return "overdue"
    return "pending"


def _sync_status(receivable: Receivable) -> None:
    receivable.status = _status_for(receivable)
    if receivable.status != "paid":
        receivable.paid_at = None


def _load_receivable(db: Session, receivable_id: int, user_id: int) -> Receivable:
    receivable = (
        db.query(Receivable)
        .options(selectinload(Receivable.person), selectinload(Receivable.payments))
        .filter(Receivable.id == receivable_id, Receivable.user_id == user_id)
        .first()
    )
    if not receivable:
        raise HTTPException(status_code=404, detail="Receivable not found")
    return receivable


def _load_person(db: Session, person_id: int, user_id: int) -> ReceivablePerson:
    person = (
        db.query(ReceivablePerson)
        .filter(ReceivablePerson.id == person_id, ReceivablePerson.user_id == user_id)
        .first()
    )
    if not person:
        raise HTTPException(status_code=404, detail="Receivable person not found")
    return person


def _person_by_name(db: Session, user_id: int, name: str) -> ReceivablePerson | None:
    return (
        db.query(ReceivablePerson)
        .filter(ReceivablePerson.user_id == user_id, ReceivablePerson.name == name)
        .first()
    )


def _person_for_payload(db: Session, user_id: int, person_id: int | None, person_name: str | None) -> ReceivablePerson:
    if person_id:
        return _load_person(db, person_id, user_id)

    name = (person_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Person is required")

    person = _person_by_name(db, user_id, name)
    if person:
        return person

    person = ReceivablePerson(user_id=user_id, name=name)
    db.add(person)
    db.flush()
    return person


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
        .options(selectinload(Receivable.person), selectinload(Receivable.payments))
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


@router.get("/people", response_model=list[ReceivablePersonOut])
def list_receivable_people(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ReceivablePerson)
        .filter(ReceivablePerson.user_id == current_user.id)
        .order_by(ReceivablePerson.name)
        .all()
    )


@router.post("/people", response_model=ReceivablePersonOut)
def create_receivable_person(
    payload: ReceivablePersonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Person name is required")

    person = _person_by_name(db, current_user.id, name)
    if person:
        return person

    person = ReceivablePerson(user_id=current_user.id, name=name)
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.post("", response_model=ReceivableOut)
def create_receivable(
    payload: ReceivableCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    person = _person_for_payload(db, current_user.id, payload.person_id, payload.person_name)
    receivable = Receivable(
        user_id=current_user.id,
        person_id=person.id,
        description=payload.description.strip(),
        total_amount=_money(payload.total_amount),
        received_amount=Decimal("0.00"),
        due_date=payload.due_date,
        notes=payload.notes.strip() if payload.notes else None,
    )
    if not receivable.description:
        raise HTTPException(status_code=400, detail="Description is required")

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

    if "person_id" in data or "person_name" in data:
        person = _person_for_payload(db, current_user.id, data.get("person_id"), data.get("person_name"))
        receivable.person_id = person.id
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

    if not receivable.description:
        raise HTTPException(status_code=400, detail="Description is required")

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


@router.delete("/{receivable_id}/payments/{payment_id}", response_model=ReceivableOut)
def delete_receivable_payment(
    receivable_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    payment = next((item for item in receivable.payments if item.id == payment_id), None)
    if not payment:
        raise HTTPException(status_code=404, detail="Receivable payment not found")

    receivable.received_amount = max(_money(receivable.received_amount) - _money(payment.amount), Decimal("0.00"))
    transaction_id = payment.transaction_id
    db.delete(payment)

    if transaction_id:
        transaction = (
            db.query(Transaction)
            .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
            .first()
        )
        if transaction:
            db.delete(transaction)

    _sync_status(receivable)
    db.commit()
    return _load_receivable(db, receivable.id, current_user.id)


@router.delete("/{receivable_id}", status_code=204)
def delete_receivable(
    receivable_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    if receivable.payments:
        raise HTTPException(status_code=400, detail="Receivable has payments")

    db.delete(receivable)
    db.commit()
    return None
