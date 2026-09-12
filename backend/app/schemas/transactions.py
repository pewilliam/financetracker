from datetime import date as Date, datetime
from decimal import Decimal
from typing import List, Literal, Optional
from pydantic import Field, model_validator
from app.schemas.base import APIModel, PositiveMoney
from app.schemas.categories import CategoryOut
from app.schemas.receivables import LinkedExpenseOut, ReceivableExpenseLinkIn


class TransactionWalletOut(APIModel):
    id: int
    name: str
    institution: Optional[str] = None
    color: str
    is_primary: bool = False


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
    wallet_id: Optional[int] = None


class TransactionCreate(TransactionBase):
    amount: PositiveMoney
    expense_link: Optional[ReceivableExpenseLinkIn] = None


class TransactionBatchRule(APIModel):
    description: Optional[str] = None
    amount: PositiveMoney
    weekdays: List[int] = Field(min_length=1, max_length=7)


class TransactionBatchCreate(APIModel):
    start_date: Date
    end_date: Date
    type: Literal["expense", "income"] = "expense"
    category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    wallet_id: Optional[int] = None
    rules: List[TransactionBatchRule] = Field(min_length=1, max_length=20)


class TransactionUpdate(APIModel):
    date: Optional[Date] = None
    type: Optional[str] = None
    amount: Optional[PositiveMoney] = None
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
    wallet: Optional[TransactionWalletOut] = None
    category: Optional[CategoryOut] = None
    categories: List[CategoryOut] = []
    linked_expense: Optional[LinkedExpenseOut] = None

    @model_validator(mode="after")
    def resolve_effective_future_status(self):
        """A planned transaction becomes effective when its date arrives."""
        self.is_future = bool(self.is_future and self.date > Date.today())
        return self


class TransactionBatchOut(APIModel):
    created_count: int
    transactions: List[TransactionOut]
