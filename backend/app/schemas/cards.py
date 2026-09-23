from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import Field

from app.schemas.base import APIModel, NonNegativeMoney


class CardCurrentInvoiceOut(APIModel):
    id: int
    due_date: date
    total_amount: Decimal
    paid: bool = False


class CardCreate(APIModel):
    name: str
    color: str = "#3B82F6"
    due_day: int = Field(ge=1, le=31)
    closing_day: int = Field(ge=1, le=31)
    credit_limit: Optional[NonNegativeMoney] = None
    institution: Optional[str] = None
    default_wallet_id: Optional[int] = None


class CardUpdate(APIModel):
    name: Optional[str] = None
    color: Optional[str] = None
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    closing_day: Optional[int] = Field(default=None, ge=1, le=31)
    credit_limit: Optional[NonNegativeMoney] = None
    institution: Optional[str] = None
    default_wallet_id: Optional[int] = None


class CardOut(APIModel):
    id: int
    name: str
    color: str
    due_day: int
    closing_day: int
    credit_limit: Optional[Decimal] = None
    institution: Optional[str] = None
    default_wallet_id: Optional[int] = None
    active: bool
    created_at: Optional[datetime] = None
    total_invoices: int = 0
    pending_invoices: int = 0
    can_delete: bool = False
    committed: Decimal = Decimal("0.00")
    available: Optional[Decimal] = None
    current_due_date: Optional[date] = None
    current_invoice: Optional[CardCurrentInvoiceOut] = None
