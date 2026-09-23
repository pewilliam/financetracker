from datetime import date, datetime
from decimal import Decimal
from typing import Literal, List, Optional
from pydantic import Field
from app.schemas.base import APIModel, NonNegativeMoney, PositiveMoney
from app.schemas.invoices import InvoiceOut
from app.schemas.categories import CategoryOut


class InstallmentDraftIn(APIModel):
    amount: NonNegativeMoney
    purchase_date: Optional[date] = None


class InstallmentCreate(APIModel):
    description: str
    total_amount: PositiveMoney
    installment_count: int = Field(ge=1, le=48)
    credit_card_id: int
    first_purchase_date: date
    custom_values: Optional[List[NonNegativeMoney]] = None
    items: Optional[List[InstallmentDraftIn]] = None
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None


class InstallmentItemUpdate(APIModel):
    invoice_id: Optional[int] = None
    amount: PositiveMoney
    status: Literal["pending", "refunded", "canceled"] = "pending"


class InstallmentCategoryUpdate(APIModel):
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None


class InstallmentItemOut(APIModel):
    id: int
    invoice_id: Optional[int] = None
    installment_number: int
    amount: Decimal
    description: str
    status: str = "pending"
    refund_invoice_item_id: Optional[int] = None
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
    category_id: Optional[int] = None
    category_ids: List[int] = []
    category: Optional[CategoryOut] = None
    categories: List[CategoryOut] = []


class InstallmentForecastOut(APIModel):
    month: str
    amount: Decimal = Decimal("0.00")


class InstallmentSummaryOut(APIModel):
    active_count: int = 0
    paid_off_count: int = 0
    current_month_count: int = 0
    current_month_amount: Decimal = Decimal("0.00")
    remaining_amount: Decimal = Decimal("0.00")
    overdue_count: int = 0
    overdue_amount: Decimal = Decimal("0.00")
    forecast: List[InstallmentForecastOut] = []


class InstallmentPageOut(APIModel):
    items: List[InstallmentPurchaseOut] = []
    page: int
    page_size: int
    total: int
    total_pages: int
    summary: InstallmentSummaryOut
