from datetime import datetime
from typing import Optional
from pydantic import Field
from app.schemas.base import APIModel


class InvoiceTemplateCreate(APIModel):
    name: str
    color: str = "#3B82F6"
    default_due_day: int = Field(ge=1, le=31)


class InvoiceTemplateUpdate(APIModel):
    name: Optional[str] = None
    color: Optional[str] = None
    default_due_day: Optional[int] = Field(default=None, ge=1, le=31)


class InvoiceTemplateOut(APIModel):
    id: int
    name: str
    color: str
    default_due_day: int
    active: bool
    created_at: Optional[datetime] = None
    total_invoices: int = 0
    pending_invoices: int = 0
