import calendar
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Recurrence, Transaction, User
from app.schemas.recurrences import RecurrenceCreate, RecurrenceOut
from app.security import get_current_user

router = APIRouter(prefix="/api/recurrences", tags=["recurrences"])


def _add_months(source: date, offset: int) -> tuple[int, int]:
    total = source.year * 12 + source.month - 1 + offset
    return total // 12, total % 12 + 1


def _recurrence_date(start: date, offset: int, day_of_month: int) -> date:
    year, month = _add_months(start, offset)
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, max(1, min(day_of_month, last_day)))


def _transaction_exists(db: Session, recurrence_id: int, user_id: int, target_date: date) -> bool:
    return (
        db.query(Transaction)
        .filter(
            Transaction.recurrence_id == recurrence_id,
            Transaction.user_id == user_id,
            Transaction.date == target_date,
        )
        .first()
        is not None
    )


@router.get("", response_model=list[RecurrenceOut])
def list_recurrences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Recurrence)
        .filter(Recurrence.user_id == current_user.id)
        .order_by(Recurrence.day_of_month)
        .all()
    )


@router.post("", response_model=RecurrenceOut)
def create_recurrence(
    payload: RecurrenceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recurrence = Recurrence(
        user_id=current_user.id,
        description=payload.description,
        type=payload.type,
        amount=payload.amount,
        day_of_month=max(1, min(payload.day_of_month, 31)),
        recurrence_months=max(1, payload.recurrence_months),
        active=payload.active,
    )
    db.add(recurrence)
    db.flush()

    start = payload.start_date or date.today()
    today = date.today()
    recurrence_dates = [start]
    recurrence_dates.extend(
        _recurrence_date(start, offset, recurrence.day_of_month)
        for offset in range(1, recurrence.recurrence_months + 1)
    )

    for target_date in recurrence_dates:
        if _transaction_exists(db, recurrence.id, current_user.id, target_date):
            continue

        db.add(
            Transaction(
                user_id=current_user.id,
                date=target_date,
                type=recurrence.type,
                amount=recurrence.amount,
                description=recurrence.description,
                is_future=target_date > today,
                recurrence_id=recurrence.id,
            )
        )

    db.commit()
    db.refresh(recurrence)
    return recurrence
