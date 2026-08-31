from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional
from pydantic import Field
from app.schemas.base import APIModel
from app.schemas.categories import CategoryOut


class ReceivablePersonCreate(APIModel):
    name: str


class ReceivablePersonOut(APIModel):
    id: int
    name: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ReceivablePaymentCreate(APIModel):
    amount: Decimal = Field(gt=0)
    paid_at: date
    category_id: Optional[int] = None


class ReceivablePaidPayload(APIModel):
    paid_at: date
    category_id: Optional[int] = None


class ReceivablePaymentOut(APIModel):
    id: int
    receivable_id: int
    transaction_id: Optional[int] = None
    amount: Decimal
    paid_at: date
    created_at: Optional[datetime] = None


class ReceivableExpenseLinkIn(APIModel):
    source_type: Literal["transaction", "invoice_item", "installment_item", "installment_purchase"]
    source_id: int
    installment_scope: Literal["single", "remaining", "all"] = "single"
    allocation_mode: Literal["total", "per_installment"] = "total"


class LinkedExpenseOut(APIModel):
    source_type: str
    source_id: int
    description: str
    amount: Decimal
    date: date
    origin: str
    invoice_name: Optional[str] = None
    purchase_id: Optional[int] = None
    installment_number: Optional[int] = None
    installment_count: Optional[int] = None
    category_id: Optional[int] = None


class ExpenseOptionOut(LinkedExpenseOut):
    available_amount: Decimal
    linked_amount: Decimal = Decimal("0.00")
    receivable_ids: List[int] = []
    transaction_ids: List[int] = []


class ReceivableCreate(APIModel):
    person_id: Optional[int] = None
    person_name: Optional[str] = None
    description: str
    total_amount: Decimal = Field(gt=0)
    due_date: date
    notes: Optional[str] = None
    category_id: Optional[int] = None
    expense_link: Optional[ReceivableExpenseLinkIn] = None


class ReceivableUpdate(APIModel):
    person_id: Optional[int] = None
    person_name: Optional[str] = None
    description: Optional[str] = None
    total_amount: Optional[Decimal] = Field(default=None, gt=0)
    due_date: Optional[date] = None
    notes: Optional[str] = None
    category_id: Optional[int] = None
    expense_link: Optional[ReceivableExpenseLinkIn] = None


class ReceivableOut(APIModel):
    id: int
    person_id: int
    person_name: str
    person: Optional[ReceivablePersonOut] = None
    description: str
    total_amount: Decimal
    received_amount: Decimal
    remaining_amount: Decimal
    due_date: date
    status: str
    paid_at: Optional[date] = None
    notes: Optional[str] = None
    category_id: Optional[int] = None
    category: Optional[CategoryOut] = None
    series_id: Optional[str] = None
    series_installment_number: Optional[int] = None
    series_installment_count: Optional[int] = None
    linked_expense: Optional[LinkedExpenseOut] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    payments: List[ReceivablePaymentOut] = []
