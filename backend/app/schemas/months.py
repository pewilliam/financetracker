from datetime import date
from decimal import Decimal
from typing import List, Optional
from app.schemas.base import APIModel
from app.schemas.transactions import TransactionOut


class MonthDayOut(APIModel):
    date: date
    expenses: Decimal
    income: Decimal
    balance: Decimal
    notes: Optional[str] = None
    has_future: bool = False
    transactions: List[TransactionOut] = []


class MonthResponse(APIModel):
    year: int
    month: int
    opening_balance: Decimal
    closing_balance: Decimal
    total_expenses: Decimal
    total_income: Decimal
    days: List[MonthDayOut]


class MonthSummaryOut(APIModel):
    year: int
    month: int
    total_expenses: Decimal
    total_income: Decimal
    difference: Decimal
    current_balance: Decimal
    projected_closing: Decimal
    future_net: Decimal
