from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import Field

from app.schemas.base import APIModel


class CategoryCreate(APIModel):
    name: str = Field(min_length=1, max_length=80)
    color: Optional[str] = None
    monthly_limit: Optional[Decimal] = Field(default=None, ge=0)
    ignore_in_category_analysis: bool = False
    include_in_income_planning: bool = False


class CategoryUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    color: Optional[str] = None
    monthly_limit: Optional[Decimal] = Field(default=None, ge=0)
    ignore_in_category_analysis: bool = False
    include_in_income_planning: bool = False


class CategoryOut(APIModel):
    id: int
    name: str
    color: str
    monthly_limit: Optional[Decimal] = None
    ignore_in_category_analysis: bool = False
    include_in_income_planning: bool = False
    created_at: Optional[datetime] = None
