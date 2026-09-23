from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from app.schemas.base import APIModel, MoneyValue
from app.schemas.categories import CategoryOut


class InvoiceItemCreate(APIModel):
    description: str
    amount: MoneyValue
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    purchase_date: Optional[date] = None


class InvoiceItemUpdate(InvoiceItemCreate):
    pass


class InvoiceItemOut(InvoiceItemCreate):
    id: int
    created_at: Optional[datetime] = None
    category: Optional[CategoryOut] = None
    categories: List[CategoryOut] = []
    subscription_id: Optional[int] = None
    subscription_charge_date: Optional[date] = None


class ProjectedSubscriptionItemOut(APIModel):
    subscription_id: int
    description: str
    amount: Decimal
    charge_date: date
    category_id: Optional[int] = None
    category_ids: List[int] = []
    categories: List[CategoryOut] = []


class InvoiceInstallmentItemOut(APIModel):
    id: int
    purchase_id: int
    installment_number: int
    installment_count: int = 0
    amount: Decimal
    description: str
    status: str = "pending"
    purchase_description: str = ""
    purchase_total_amount: Decimal = Decimal("0.00")
    remaining_installments: int = 0
    created_at: Optional[datetime] = None
    category_id: Optional[int] = None
    category_ids: List[int] = []
    category: Optional[CategoryOut] = None
    categories: List[CategoryOut] = []


class PurchaseCreate(APIModel):
    description: str
    amount: MoneyValue
    purchase_date: date
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    recurring: bool = False
    charge_day: Optional[int] = None


class InvoicePaidUpdate(APIModel):
    paid: bool


class InvoiceUpdate(APIModel):
    due_date: date


class InvoiceOut(APIModel):
    id: int
    credit_card_id: int
    name: str
    color: str = "#3B82F6"
    due_date: date
    total_amount: Decimal
    paid: bool = False
    linked_transaction_id: Optional[int] = None
    created_at: Optional[datetime] = None
    items_included: bool = True
    item_count: int = 0
    installment_item_count: int = 0
    items: List[InvoiceItemOut] = []
    installment_items: List[InvoiceInstallmentItemOut] = []
    projected_amount: Decimal = Decimal("0.00")
    projected_total: Decimal = Decimal("0.00")
    projected_item_count: int = 0
    is_projected: bool = False
    projected_items: List[ProjectedSubscriptionItemOut] = []
