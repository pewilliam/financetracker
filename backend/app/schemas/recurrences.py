from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from app.schemas.base import APIModel


class RecurrenceCreate(APIModel):
    description: str
    type: str
    amount: Decimal
    day_of_month: int
    recurrence_months: int = 1
    start_date: Optional[date] = None
    active: bool = True


class RecurrenceOut(APIModel):
    id: int
    description: str
    type: str
    amount: Decimal
    day_of_month: int
    recurrence_months: int = 1
    active: bool = True
    created_at: Optional[datetime] = None
