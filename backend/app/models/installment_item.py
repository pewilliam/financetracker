from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship
from app.database import Base


class InstallmentItem(Base):
    __tablename__ = "installment_items"

    id = Column(Integer, primary_key=True)
    purchase_id = Column(Integer, ForeignKey("installment_purchases.id"), nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    installment_number = Column(Integer, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    description = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    refund_invoice_item_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    purchase = relationship("InstallmentPurchase", back_populates="items")
    invoice = relationship("Invoice", back_populates="installment_items")

    @property
    def installment_count(self):
        return self.purchase.installment_count if self.purchase else 0

    @property
    def purchase_description(self):
        return self.purchase.description if self.purchase else ""

    @property
    def purchase_total_amount(self):
        return self.purchase.total_amount if self.purchase else 0

    @property
    def remaining_installments(self):
        if not self.purchase:
            return 0
        return max(self.purchase.installment_count - self.installment_number, 0)
