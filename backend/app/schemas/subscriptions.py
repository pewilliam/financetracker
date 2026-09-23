from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import Field

from app.schemas.base import APIModel, PositiveMoney
from app.schemas.categories import CategoryOut


class CardSubscriptionOut(APIModel):
    id: int
    credit_card_id: int
    description: str
    amount: Decimal
    charge_day: int
    start_date: date
    billing_interval_months: int = 1
    billing_period: str = "monthly"
    term_kind: str = "indefinite"
    term_months: Optional[int] = None
    term_end_date: Optional[date] = None
    active: bool = True
    created_at: Optional[datetime] = None
    category_id: Optional[int] = None
    category_ids: List[int] = []
    categories: List[CategoryOut] = []
    card_name: str = ""
    card_color: str = "#3B82F6"


class CardSubscriptionUpdate(APIModel):
    description: str = Field(min_length=1, max_length=255)
    amount: PositiveMoney
    category_ids: List[int] = []
    credit_card_id: int
    charge_day: int = Field(ge=1, le=31)
    billing_period: Literal["monthly", "bimonthly", "quarterly", "semiannual", "annual"]
    term_kind: Literal["indefinite", "months", "end_date"]
    term_months: Optional[int] = None
    term_end_date: Optional[date] = None
