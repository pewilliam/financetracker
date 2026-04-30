from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import relationship
from app.database import Base


class ReceivablePayment(Base):
    __tablename__ = "receivable_payments"

    id = Column(Integer, primary_key=True)
    receivable_id = Column(Integer, ForeignKey("receivables.id"), nullable=False, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    paid_at = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    receivable = relationship("Receivable", back_populates="payments")
    transaction = relationship("Transaction")
