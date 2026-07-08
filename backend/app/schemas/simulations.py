from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import Field
from app.schemas.base import APIModel


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
    items: List[SimulationItemPayload] = []


class SimulationUpdate(APIModel):
    name: Optional[str] = None
    include_real: Optional[bool] = None
    items: Optional[List[SimulationItemPayload]] = None


class SimulationItemOut(SimulationItemPayload):
    id: int
    simulation_id: int
    position: int


class SimulationOut(APIModel):
    id: int
    name: str
    include_real: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    items: List[SimulationItemOut] = []
