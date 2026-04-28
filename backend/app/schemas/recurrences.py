from datetime import datetime
from decimal import Decimal
from typing import Optional
from app.schemas.base import APIModel


class RecurrenceCreate(APIModel):
    description: str
    type: str
    amount: Decimal
    day_of_month: int
    active: bool = True


class RecurrenceOut(RecurrenceCreate):
    id: int
    created_at: Optional[datetime] = None
