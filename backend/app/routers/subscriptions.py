from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import CardSubscription, User
from app.schemas.subscriptions import CardSubscriptionOut
from app.security import get_current_user

router = APIRouter(prefix="/api/card-subscriptions", tags=["card-subscriptions"])


@router.get("", response_model=list[CardSubscriptionOut])
def list_card_subscriptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(CardSubscription)
        .options(
            selectinload(CardSubscription.categories),
            selectinload(CardSubscription.category),
            selectinload(CardSubscription.card),
        )
        .filter(CardSubscription.user_id == current_user.id)
        .order_by(CardSubscription.active.desc(), CardSubscription.charge_day, CardSubscription.description)
        .all()
    )


@router.delete("/{subscription_id}", status_code=204)
def cancel_card_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subscription = (
        db.query(CardSubscription)
        .filter(CardSubscription.id == subscription_id, CardSubscription.user_id == current_user.id)
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    subscription.active = False
    db.commit()
    return None
