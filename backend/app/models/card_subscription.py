from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.category_links import card_subscription_categories

_BILLING_PERIODS = {
    1: "monthly",
    2: "bimonthly",
    3: "quarterly",
    6: "semiannual",
    12: "annual",
}


class CardSubscription(Base):
    __tablename__ = "card_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    credit_card_id = Column(Integer, ForeignKey("credit_cards.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    charge_day = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    billing_interval_months = Column(Integer, nullable=False, default=1, server_default="1")
    term_kind = Column(String(20), nullable=False, default="indefinite", server_default="indefinite")
    term_months = Column(Integer, nullable=True)
    term_end_date = Column(Date, nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="card_subscriptions")
    card = relationship("CreditCard", back_populates="subscriptions")
    category = relationship("Category", back_populates="card_subscriptions")
    categories = relationship("Category", secondary=card_subscription_categories, order_by="Category.name")
    skips = relationship("CardSubscriptionSkip", back_populates="subscription", cascade="all, delete-orphan")

    @property
    def category_ids(self):
        return [category.id for category in self.categories]

    @property
    def card_name(self):
        return self.card.name if self.card else ""

    @property
    def card_color(self):
        return self.card.color if self.card else "#3B82F6"

    @property
    def billing_period(self):
        return _BILLING_PERIODS.get(int(self.billing_interval_months or 1), "custom")
