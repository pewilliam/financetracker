from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_categories_user_name"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    color = Column(String(7), nullable=False, default="#64748B")
    monthly_limit = Column(Numeric(12, 2), nullable=True)
    ignore_in_category_analysis = Column(Boolean, nullable=False, default=False)
    include_in_income_planning = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="categories")
    transactions = relationship("Transaction", back_populates="category")
    invoice_items = relationship("InvoiceItem", back_populates="category")
    installment_purchases = relationship("InstallmentPurchase", back_populates="category")
    recurrences = relationship("Recurrence", back_populates="category")
    receivables = relationship("Receivable", back_populates="category")
