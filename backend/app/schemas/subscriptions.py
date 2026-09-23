from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from app.schemas.base import APIModel
from app.schemas.categories import CategoryOut


class CardSubscriptionOut(APIModel):
    id: int
    credit_card_id: int
    description: str
    amount: Decimal
    charge_day: int
    start_date: date
    active: bool = True
    created_at: Optional[datetime] = None
    category_id: Optional[int] = None
    category_ids: List[int] = []
    categories: List[CategoryOut] = []
    card_name: str = ""
    card_color: str = "#3B82F6"
