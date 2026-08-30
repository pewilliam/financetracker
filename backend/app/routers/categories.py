from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, User
from app.schemas.categories import CategoryCreate, CategoryOut
from app.security import get_current_user
from app.services.categories import normalize_category_color


router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Category)
        .filter(Category.user_id == current_user.id)
        .order_by(func.lower(Category.name), Category.id)
        .all()
    )


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = " ".join(payload.name.split())
    if not name:
        raise HTTPException(status_code=422, detail="Category name is required")

    existing = (
        db.query(Category)
        .filter(Category.user_id == current_user.id, func.lower(Category.name) == name.lower())
        .first()
    )
    if existing:
        return existing

    category = Category(
        user_id=current_user.id,
        name=name,
        color=normalize_category_color(payload.color),
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category
