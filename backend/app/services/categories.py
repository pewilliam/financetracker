import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Category


DEFAULT_CATEGORY_COLOR = "#64748B"


def normalize_category_color(color: str | None) -> str:
    return color.upper() if color and re.fullmatch(r"#[0-9A-Fa-f]{6}", color) else DEFAULT_CATEGORY_COLOR


def get_user_category(db: Session, user_id: int, category_id: int | None) -> Category | None:
    if category_id is None:
        return None
    category = db.query(Category).filter(Category.id == category_id, Category.user_id == user_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category
