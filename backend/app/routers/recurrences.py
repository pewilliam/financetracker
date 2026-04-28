from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Recurrence, User
from app.schemas.recurrences import RecurrenceCreate, RecurrenceOut
from app.security import get_current_user

router = APIRouter(prefix="/api/recurrences", tags=["recurrences"])


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
        day_of_month=payload.day_of_month,
        active=payload.active,
    )
    db.add(recurrence)
    db.commit()
    db.refresh(recurrence)
    return recurrence
