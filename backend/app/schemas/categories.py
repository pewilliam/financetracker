from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import Field

from app.schemas.base import APIModel


class CategoryCreate(APIModel):
    name: str = Field(min_length=1, max_length=80)
    color: Optional[str] = None
    monthly_limit: Optional[Decimal] = Field(default=None, ge=0)


class CategoryUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    color: Optional[str] = None
    monthly_limit: Optional[Decimal] = Field(default=None, ge=0)


class CategoryOut(APIModel):
    id: int
    name: str
    color: str
    monthly_limit: Optional[Decimal] = None
    created_at: Optional[datetime] = None
