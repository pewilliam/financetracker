from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship

from app.database import Base


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    institution = Column(String(100), nullable=True)
    type = Column(String(30), nullable=False, default="other")
    initial_balance = Column(Numeric(10, 2), nullable=False, default=0)
    tracking_started_on = Column(Date, nullable=False)
    color = Column(String(7), nullable=False, default="#14A078")
    icon = Column(String(40), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="wallets")
    transactions = relationship("Transaction", back_populates="wallet")
    adjustments = relationship("WalletAdjustment", back_populates="wallet", cascade="all, delete-orphan")
    outgoing_transfers = relationship("WalletTransfer", foreign_keys="WalletTransfer.source_wallet_id", back_populates="source_wallet")
    incoming_transfers = relationship("WalletTransfer", foreign_keys="WalletTransfer.destination_wallet_id", back_populates="destination_wallet")


class WalletAdjustment(Base):
    __tablename__ = "wallet_adjustments"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    balance_before = Column(Numeric(10, 2), nullable=False)
    balance_after = Column(Numeric(10, 2), nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    wallet = relationship("Wallet", back_populates="adjustments")


class WalletTransfer(Base):
    __tablename__ = "wallet_transfers"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False, index=True)
    destination_wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    source_wallet = relationship("Wallet", foreign_keys=[source_wallet_id], back_populates="outgoing_transfers")
    destination_wallet = relationship("Wallet", foreign_keys=[destination_wallet_id], back_populates="incoming_transfers")
