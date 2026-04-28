from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from app.schemas.base import APIModel


class TransactionBase(APIModel):
    date: date
    type: str
    amount: Decimal
    description: Optional[str] = None
    is_future: bool = False
    invoice_id: Optional[int] = None
    recurrence_id: Optional[int] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(APIModel):
    date: Optional[date] = None
    type: Optional[str] = None
    amount: Optional[Decimal] = None
    description: Optional[str] = None
    is_future: Optional[bool] = None
    invoice_id: Optional[int] = None
    recurrence_id: Optional[int] = None


class TransactionOut(TransactionBase):
    id: int
    created_at: Optional[datetime] = None
