from datetime import datetime
from decimal import Decimal
from typing import List, Literal, Optional
from pydantic import Field
from app.schemas.base import APIModel


class SimulationAllocationCategory(APIModel):
    id: str
    name: str
    mode: Literal["percentage", "fixed"] = "fixed"
    value: Decimal = Field(default=Decimal("0.00"), ge=0)


class SimulationItemPayload(APIModel):
    description: str = ""
    type: str
    mode: str
    total_amount: Decimal = Decimal("0.00")
    installment_count: int = Field(default=1, ge=1, le=120)
    recurrence_count: int = Field(default=1, ge=1, le=120)
    value_mode: str = "equal"
    start_month: str
    custom_values: List[Decimal] = []


class SimulationCreate(APIModel):
    name: str
    include_real: bool = True
    reserve_mode: Literal["percentage", "fixed"] = "percentage"
    reserve_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    reserve_start_month: Optional[str] = None
    reserve_end_month: Optional[str] = None
    reserve_source_item_positions: List[int] = []
    allocation_categories: List[SimulationAllocationCategory] = []
    items: List[SimulationItemPayload] = []


class SimulationUpdate(APIModel):
    name: Optional[str] = None
    include_real: Optional[bool] = None
    reserve_mode: Optional[Literal["percentage", "fixed"]] = None
    reserve_value: Optional[Decimal] = Field(default=None, ge=0)
    reserve_start_month: Optional[str] = None
    reserve_end_month: Optional[str] = None
    reserve_source_item_positions: Optional[List[int]] = None
    allocation_categories: Optional[List[SimulationAllocationCategory]] = None
    items: Optional[List[SimulationItemPayload]] = None


class SimulationItemOut(SimulationItemPayload):
    id: int
    simulation_id: int
    position: int


class SimulationOut(APIModel):
    id: int
    name: str
    include_real: bool
    reserve_mode: Literal["percentage", "fixed"] = "percentage"
    reserve_value: Decimal = Decimal("0.00")
    reserve_start_month: Optional[str] = None
    reserve_end_month: Optional[str] = None
    reserve_source_item_positions: List[int] = []
    allocation_categories: List[SimulationAllocationCategory] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    items: List[SimulationItemOut] = []


class SimulationPreviewPayload(APIModel):
    start_month: str
    end_month: str
    include_real: bool = True
    reserve_mode: Literal["percentage", "fixed"] = "percentage"
    reserve_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    reserve_start_month: Optional[str] = None
    reserve_end_month: Optional[str] = None
    reserve_source_item_positions: List[int] = []
    allocation_categories: List[SimulationAllocationCategory] = []
    items: List[SimulationItemPayload] = []


class SimulationImpactOut(APIModel):
    id: str
    description: str
    type: Literal["expense", "income"]
    amount: Decimal
    installment_label: Optional[str] = None
    period_type: Literal["month", "installment"]


class SimulationCategoryAllocationOut(SimulationAllocationCategory):
    allocated: Decimal
    accumulated: Decimal


class SimulationCategorySummaryOut(SimulationAllocationCategory):
    current_month_allocated: Decimal
    total_allocated: Decimal


class SimulationMonthOut(APIModel):
    month: str
    initial_balance: Decimal
    real_income: Decimal
    real_expenses: Decimal
    simulated_income: Decimal
    simulated_expenses: Decimal
    income: Decimal
    expenses: Decimal
    planned_reserve: Decimal
    reserve_accumulated: Decimal
    free_money: Decimal
    reserve_rate: Decimal
    reserve_active: bool
    reserve_base_income: Decimal
    without_simulation: Decimal
    final_balance: Decimal
    difference: Decimal
    reserve_unsustainable: bool
    simulation_caused_negative: bool
    category_allocations: List[SimulationCategoryAllocationOut] = []
    unplanned_free_money: Decimal = Decimal("0.00")
    simulated_items: List[SimulationImpactOut] = []


class SimulationPlanningSummaryOut(APIModel):
    current_balance: Decimal
    projected_balance: Decimal
    baseline_projected_balance: Decimal
    simulated_impact: Decimal
    total_planned_reserve: Decimal
    total_free_money: Decimal
    total_free_money_before_allocations: Decimal = Decimal("0.00")
    current_unplanned_free_money: Decimal = Decimal("0.00")
    total_unplanned_free_money: Decimal = Decimal("0.00")
    total_reserve_base_income: Decimal
    average_free_money: Decimal
    average_reserve_rate: Decimal
    maximum_free_money: Decimal
    minimum_free_money: Decimal
    best_free_month: Optional[str] = None
    worst_free_month: Optional[str] = None
    worst_balance_month: Optional[str] = None
    minimum_balance: Decimal
    negative_free_months: List[str] = []
    simulation_negative_months: List[str] = []
    category_summaries: List[SimulationCategorySummaryOut] = []


class SimulationPreviewOut(APIModel):
    rows: List[SimulationMonthOut]
    summary: SimulationPlanningSummaryOut
