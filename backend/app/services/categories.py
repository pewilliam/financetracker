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


def get_user_categories(db: Session, user_id: int, category_ids: list[int] | None) -> list[Category]:
    ids = list(dict.fromkeys(int(value) for value in (category_ids or []) if value is not None))
    if not ids:
        return []
    categories = db.query(Category).filter(Category.user_id == user_id, Category.id.in_(ids)).all()
    by_id = {category.id: category for category in categories}
    if len(by_id) != len(ids):
        raise HTTPException(status_code=404, detail="Category not found")
    return [by_id[category_id] for category_id in ids]


def category_ids_from_payload(payload) -> list[int] | None:
    """Return selected ids while retaining compatibility with old category_id clients."""
    if "category_ids" in payload.model_fields_set:
        return payload.category_ids or []
    if "category_id" in payload.model_fields_set:
        return [payload.category_id] if payload.category_id is not None else []
    return None


def set_item_categories(item, categories: list[Category]) -> None:
    item.categories = categories
    item.category_id = categories[0].id if categories else None
