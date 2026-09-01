from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.category_links import recurrence_categories


class Recurrence(Base):
    __tablename__ = "recurrences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    type = Column(Enum("expense", "income", name="transaction_type"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    day_of_month = Column(Integer, nullable=False)
    recurrence_months = Column(Integer, nullable=False, default=1)
    active = Column(Boolean, default=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="recurrences")
    transactions = relationship("Transaction", back_populates="recurrence")
    category = relationship("Category", back_populates="recurrences")
    categories = relationship("Category", secondary=recurrence_categories, order_by="Category.name")

    @property
    def category_ids(self):
        return [category.id for category in self.categories]
