from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Literal, Optional
from pydantic import Field
from app.schemas.base import APIModel
from app.schemas.categories import CategoryOut
from app.schemas.receivables import LinkedExpenseOut, ReceivableExpenseLinkIn


class TransactionBase(APIModel):
    date: Date
    type: str
    amount: Decimal
    description: Optional[str] = None
    is_future: bool = False
    invoice_id: Optional[int] = None
    recurrence_id: Optional[int] = None
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None


class TransactionCreate(TransactionBase):
    expense_link: Optional[ReceivableExpenseLinkIn] = None


class TransactionBatchRule(APIModel):
    description: Optional[str] = None
    amount: Decimal = Field(gt=0)
    weekdays: List[int] = Field(min_length=1, max_length=7)


class TransactionBatchCreate(APIModel):
    start_date: Date
    end_date: Date
    type: Literal["expense", "income"] = "expense"
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    rules: List[TransactionBatchRule] = Field(min_length=1, max_length=20)


class TransactionUpdate(APIModel):
    date: Optional[Date] = None
    type: Optional[str] = None
    amount: Optional[Decimal] = None
    description: Optional[str] = None
    is_future: Optional[bool] = None
    invoice_id: Optional[int] = None
    recurrence_id: Optional[int] = None
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    expense_link: Optional[ReceivableExpenseLinkIn] = None


class TransactionOut(TransactionBase):
    id: int
    created_at: Optional[datetime] = None
    category: Optional[CategoryOut] = None
    categories: List[CategoryOut] = []
    linked_expense: Optional[LinkedExpenseOut] = None


class TransactionBatchOut(APIModel):
    created_count: int
    transactions: List[TransactionOut]
