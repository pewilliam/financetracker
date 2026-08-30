from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from pydantic import Field

from app.schemas.base import APIModel


class BudgetIncomeCandidateOut(APIModel):
    transaction_id: int
    description: Optional[str] = None
    date: date
    amount: Decimal
    selected: bool = False
    received: bool = False


class BudgetReserveRuleOut(APIModel):
    rule_type: Literal["percentage", "fixed"] = "percentage"
    value: Decimal = Decimal("0.00")
    effective_year: Optional[int] = None
    effective_month: Optional[int] = None


class MonthlyBudgetPlanOut(APIModel):
    year: int
    month: int
    income_mode: Literal["transactions", "manual"] = "transactions"
    manual_income: Optional[Decimal] = None
    expected_income: Optional[Decimal] = None
    income_candidates: list[BudgetIncomeCandidateOut] = []
    selected_income_count: int = 0
    received_income_count: int = 0
    received_income: Decimal = Decimal("0.00")
    pending_income: Decimal = Decimal("0.00")
    selected_income_total: Decimal = Decimal("0.00")
    planning_income: Decimal = Decimal("0.00")
    has_actual_income: bool = False
    is_estimated: bool = False
    reserve_rule: BudgetReserveRuleOut
    reserve_requested: Decimal = Decimal("0.00")
    reserve_amount: Decimal = Decimal("0.00")
    reserve_capped: bool = False
    available_budget: Decimal = Decimal("0.00")


class MonthlyBudgetPlanUpdate(APIModel):
    income_mode: Optional[Literal["transactions", "manual"]] = None
    manual_income: Optional[Decimal] = Field(default=None, ge=0)
    expected_income: Optional[Decimal] = Field(default=None, ge=0)
    transaction_ids: Optional[list[int]] = None


class BudgetReserveRuleUpdate(APIModel):
    rule_type: Literal["percentage", "fixed"]
    value: Decimal = Field(ge=0)
