from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from app.schemas.base import APIModel


class InvoiceItemCreate(APIModel):
    description: str
    amount: Decimal


class InvoiceItemOut(InvoiceItemCreate):
    id: int
    created_at: Optional[datetime] = None


class InvoiceCreate(APIModel):
    name: str
    due_date: date
    initial_amount: Decimal = Decimal("0.00")


class InvoiceOut(APIModel):
    id: int
    name: str
    due_date: date
    total_amount: Decimal
    linked_transaction_id: Optional[int] = None
    created_at: Optional[datetime] = None
    items: List[InvoiceItemOut] = []
