from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import Field
from app.schemas.base import APIModel


class ReceivablePaymentCreate(APIModel):
    amount: Decimal = Field(gt=0)
    paid_at: date


class ReceivablePaidPayload(APIModel):
    paid_at: date


class ReceivablePaymentOut(APIModel):
    id: int
    receivable_id: int
    transaction_id: Optional[int] = None
    amount: Decimal
    paid_at: date
    created_at: Optional[datetime] = None


class ReceivableCreate(APIModel):
    person_name: str
    description: str
    total_amount: Decimal = Field(gt=0)
    due_date: date
    notes: Optional[str] = None


class ReceivableUpdate(APIModel):
    person_name: Optional[str] = None
    description: Optional[str] = None
    total_amount: Optional[Decimal] = Field(default=None, gt=0)
    due_date: Optional[date] = None
    notes: Optional[str] = None


class ReceivableOut(APIModel):
    id: int
    person_name: str
    description: str
    total_amount: Decimal
    received_amount: Decimal
    remaining_amount: Decimal
    due_date: date
    status: str
    paid_at: Optional[date] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    payments: List[ReceivablePaymentOut] = []
