from sqlalchemy import Column, Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class CardSubscriptionSkip(Base):
    """A charge that must not be created again.

    Used when the target invoice no longer accepts the purchase, or when the
    user removes the materialized item.
    """

    __tablename__ = "card_subscription_skips"
    __table_args__ = (
        UniqueConstraint("subscription_id", "charge_date", name="uq_card_subscription_skips_charge"),
    )

    id = Column(Integer, primary_key=True)
    subscription_id = Column(Integer, ForeignKey("card_subscriptions.id", ondelete="CASCADE"), nullable=False, index=True)
    charge_date = Column(Date, nullable=False)

    subscription = relationship("CardSubscription", back_populates="skips")
