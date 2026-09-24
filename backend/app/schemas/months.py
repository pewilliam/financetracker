from datetime import date
from decimal import Decimal
from typing import List, Optional
from app.schemas.base import APIModel, MoneyValue
from app.schemas.transactions import TransactionOut


class MonthPlannedReceivableOut(APIModel):
    id: int
    person_name: str
    description: str
    remaining_amount: Decimal
    total_amount: Decimal
    status: str
    due_date: date
    series_installment_number: Optional[int] = None
    series_installment_count: Optional[int] = None


class MonthDayOut(APIModel):
    date: date
    expenses: Decimal
    income: Decimal
    balance: Decimal
    projected_balance: Decimal = Decimal("0.00")
    notes: Optional[str] = None
    has_future: bool = False
    transactions: List[TransactionOut] = []
    planned_receivables: List[MonthPlannedReceivableOut] = []


class MonthResponse(APIModel):
    year: int
    month: int
    opening_balance: Decimal
    opening_balance_projected: Decimal = Decimal("0.00")
    prior_planned_receivables_total: Decimal = Decimal("0.00")
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
    planned_receivables_total: Decimal = Decimal("0.00")
    prior_planned_receivables_total: Decimal = Decimal("0.00")
    transactions_projected_closing: Decimal = Decimal("0.00")


class MonthCardSummaryOut(APIModel):
    year: int
    month: int
    label: str
    opening_balance: Decimal
    current_balance: Decimal
    total_expenses: Decimal
    total_income: Decimal
    closing_balance: Decimal
    difference_pct: Decimal
    transaction_count: int = 0
    planned_receivables_total: Decimal = Decimal("0.00")
    prior_planned_receivables_total: Decimal = Decimal("0.00")


class OpeningBalancePayload(APIModel):
    opening_balance: MoneyValue


class CategoryExpenseDetailOut(APIModel):
    source_type: str
    source_id: int
    description: str
    amount: Decimal
    date: date
    invoice_name: Optional[str] = None
    installment_number: Optional[int] = None
    installment_count: Optional[int] = None


class CategoryExpenseOut(APIModel):
    category_id: Optional[int] = None
    category_ids: List[int] = []
    name: str
    color: str
    amount: Decimal
    percentage: Decimal
    details: List[CategoryExpenseDetailOut] = []


class DayWalletMovementOut(APIModel):
    kind: str
    amount: Decimal
    description: Optional[str] = None
    date: date
    counterpart_wallet_name: Optional[str] = None
    counterpart_archived: bool = False


class DayWalletOut(APIModel):
    wallet_id: int
    wallet_name: str
    color: str
    opening_balance: Decimal
    balance_before: Decimal
    variation: Decimal
    balance: Decimal
    changed: bool
    reasons: List[str] = []
    movements: List[DayWalletMovementOut] = []


class DayWalletsOut(APIModel):
    date: date
    consolidated_balance: Decimal
    wallets_total: Decimal
    wallets: List[DayWalletOut] = []


class CategoryBreakdownOut(APIModel):
    total_expenses: Decimal
    categorized_total: Decimal
    items: List[CategoryExpenseOut] = []
    chart_items: List[CategoryExpenseOut] = []
    total_income: Decimal = Decimal("0.00")
    income_categorized_total: Decimal = Decimal("0.00")
    income_items: List[CategoryExpenseOut] = []
    income_chart_items: List[CategoryExpenseOut] = []
