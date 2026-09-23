from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship
from app.database import Base


class CreditCard(Base):
    __tablename__ = "credit_cards"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    color = Column(String(20), nullable=False, default="#3B82F6")
    due_day = Column(Integer, nullable=False)
    closing_day = Column(Integer, nullable=False)
    credit_limit = Column(Numeric(10, 2), nullable=True)
    institution = Column(String(255), nullable=True)
    default_wallet_id = Column(Integer, ForeignKey("wallets.id", ondelete="SET NULL"), nullable=True, index=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="credit_cards")
    default_wallet = relationship("Wallet", foreign_keys=[default_wallet_id])
    invoices = relationship("Invoice", back_populates="card")
