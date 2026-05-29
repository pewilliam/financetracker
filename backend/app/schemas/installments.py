from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import Field
from app.schemas.base import APIModel
from app.schemas.invoices import InvoiceOut


class InstallmentDraftIn(APIModel):
    invoice_id: Optional[int] = None
    amount: Decimal
    target_due_date: Optional[date] = None


class InstallmentCreate(APIModel):
    description: str
    total_amount: Decimal
    installment_count: int = Field(ge=1, le=48)
    first_invoice_id: int
    custom_values: Optional[List[Decimal]] = None
    items: Optional[List[InstallmentDraftIn]] = None


class InstallmentItemUpdate(APIModel):
    invoice_id: Optional[int] = None
    amount: Decimal = Field(gt=0)


class InstallmentItemOut(APIModel):
    id: int
    invoice_id: Optional[int] = None
    installment_number: int
    amount: Decimal
    description: str
    created_at: Optional[datetime] = None
    invoice: Optional[InvoiceOut] = None


class InstallmentPurchaseOut(APIModel):
    id: int
    description: str
    total_amount: Decimal
    installment_count: int
    installment_value: Decimal
    first_invoice_id: Optional[int] = None
    created_at: Optional[datetime] = None
    paid_installments: int = 0
    paid_amount: Decimal = Decimal("0.00")
    remaining_installments: int = 0
    remaining_amount: Decimal = Decimal("0.00")
    progress_label: str = ""
    next_installment: Optional[InstallmentItemOut] = None
    items: List[InstallmentItemOut] = []
