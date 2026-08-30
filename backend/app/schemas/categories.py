from datetime import datetime
from typing import Optional

from pydantic import Field

from app.schemas.base import APIModel


class CategoryCreate(APIModel):
    name: str = Field(min_length=1, max_length=80)
    color: Optional[str] = None


class CategoryUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    color: Optional[str] = None


class CategoryOut(APIModel):
    id: int
    name: str
    color: str
    created_at: Optional[datetime] = None
