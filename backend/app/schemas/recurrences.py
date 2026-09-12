from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional
from app.schemas.base import APIModel, PositiveMoney
from app.schemas.categories import CategoryOut


class RecurrenceCreate(APIModel):
    description: str
    type: str
    amount: PositiveMoney
    day_of_month: int
    recurrence_months: int = 1
    start_date: Optional[date] = None
    active: bool = True
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    wallet_id: Optional[int] = None


class RecurrenceUpdate(APIModel):
    description: str
    type: str
    amount: PositiveMoney
    day_of_month: int
    active: bool = True
    apply_to: Literal["all", "future"] = "future"
    effective_date: Optional[date] = None
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    wallet_id: Optional[int] = None


class RecurrenceOut(APIModel):
    id: int
    description: str
    type: str
    amount: Decimal
    day_of_month: int
    recurrence_months: int = 1
    active: bool = True
    created_at: Optional[datetime] = None
    category_id: Optional[int] = None
    category_ids: List[int] = []
    categories: List[CategoryOut] = []
    wallet_id: Optional[int] = None
