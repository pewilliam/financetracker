from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship
from app.database import Base


class InstallmentPurchase(Base):
    __tablename__ = "installment_purchases"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    total_amount = Column(Numeric(10, 2), nullable=False)
    installment_count = Column(Integer, nullable=False)
    installment_value = Column(Numeric(10, 2), nullable=False)
    first_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="installment_purchases")
    first_invoice = relationship("Invoice", foreign_keys=[first_invoice_id])
    items = relationship(
        "InstallmentItem",
        back_populates="purchase",
        cascade="all, delete-orphan",
        order_by="InstallmentItem.installment_number",
    )
