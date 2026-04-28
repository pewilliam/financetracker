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


class InvoiceInstallmentItemOut(APIModel):
    id: int
    purchase_id: int
    installment_number: int
    installment_count: int = 0
    amount: Decimal
    description: str
    purchase_description: str = ""
    purchase_total_amount: Decimal = Decimal("0.00")
    remaining_installments: int = 0
    created_at: Optional[datetime] = None


class InvoiceCreate(APIModel):
    template_id: int
    due_date: date
    initial_amount: Decimal = Decimal("0.00")


class InvoicePaidUpdate(APIModel):
    paid: bool


class InvoiceOut(APIModel):
    id: int
    template_id: int
    name: str
    color: str = "#3B82F6"
    due_date: date
    total_amount: Decimal
    paid: bool = False
    linked_transaction_id: Optional[int] = None
    created_at: Optional[datetime] = None
    items: List[InvoiceItemOut] = []
    installment_items: List[InvoiceInstallmentItemOut] = []
