from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.category_links import invoice_item_categories


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    __table_args__ = (
        UniqueConstraint("subscription_id", "subscription_charge_date", name="uq_invoice_items_subscription_charge"),
    )

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    description = Column(String(255), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    purchase_date = Column(Date, nullable=True)
    subscription_id = Column(Integer, ForeignKey("card_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True)
    subscription_charge_date = Column(Date, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    invoice = relationship("Invoice", back_populates="items")
    category = relationship("Category", back_populates="invoice_items")
    categories = relationship("Category", secondary=invoice_item_categories, order_by="Category.name")

    @property
    def category_ids(self):
        return [category.id for category in self.categories]
