from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, InstallmentPurchase, InvoiceItem, Receivable, Recurrence, Transaction, User
from app.schemas.categories import CategoryCreate, CategoryOut, CategoryUpdate
from app.security import get_current_user
from app.services.categories import get_user_category, normalize_category_color


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
        monthly_limit=payload.monthly_limit,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = get_user_category(db, current_user.id, category_id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data:
        name = " ".join((data["name"] or "").split())
        if not name:
            raise HTTPException(status_code=422, detail="Category name is required")
        existing = (
            db.query(Category)
            .filter(
                Category.user_id == current_user.id,
                Category.id != category.id,
                func.lower(Category.name) == name.lower(),
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Category name already exists")
        category.name = name

    if "color" in data:
        category.color = normalize_category_color(data["color"])

    if "monthly_limit" in data:
        category.monthly_limit = data["monthly_limit"]

    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = get_user_category(db, current_user.id, category_id)
    for model in (Transaction, InvoiceItem, InstallmentPurchase, Recurrence, Receivable):
        db.query(model).filter(model.category_id == category.id).update(
            {model.category_id: None},
            synchronize_session=False,
        )
    db.delete(category)
    db.commit()
    return None
