from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import CardSubscription, User
from app.schemas.subscriptions import CardSubscriptionOut, CardSubscriptionPreview, CardSubscriptionPreviewOut, CardSubscriptionUpdate
from app.security import get_current_user
from app.services.subscriptions import (
    posted_subscription_ids,
    preview_subscription_charges,
    release_unused_commitment_invoices,
    update_card_subscription as save_card_subscription,
)

router = APIRouter(prefix="/api/card-subscriptions", tags=["card-subscriptions"])


@router.get("", response_model=list[CardSubscriptionOut])
def list_card_subscriptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subscriptions = (
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
    posted = posted_subscription_ids(db, current_user.id, [subscription.id for subscription in subscriptions])
    for subscription in subscriptions:
        subscription.has_posted_charge = subscription.id in posted
    return subscriptions


@router.post("/preview", response_model=CardSubscriptionPreviewOut)
def preview_card_subscription(
    payload: CardSubscriptionPreview,
    current_user: User = Depends(get_current_user),
):
    return preview_subscription_charges(payload)


@router.put("/{subscription_id}", response_model=CardSubscriptionOut)
def update_card_subscription(
    subscription_id: int,
    payload: CardSubscriptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subscription = save_card_subscription(db, current_user, subscription_id, payload)
    db.commit()
    refreshed = (
        db.query(CardSubscription)
        .options(
            selectinload(CardSubscription.categories),
            selectinload(CardSubscription.category),
            selectinload(CardSubscription.card),
        )
        .filter(CardSubscription.id == subscription.id, CardSubscription.user_id == current_user.id)
        .one()
    )
    refreshed.has_posted_charge = bool(posted_subscription_ids(db, current_user.id, [refreshed.id]))
    return refreshed


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
    release_unused_commitment_invoices(db, current_user, subscription)
    db.commit()
    return None
