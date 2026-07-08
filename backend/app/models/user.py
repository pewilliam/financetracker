from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    allow_overdue_invoice_edits = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())

    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="user", cascade="all, delete-orphan")
    invoice_templates = relationship("InvoiceTemplate", back_populates="user", cascade="all, delete-orphan")
    installment_purchases = relationship("InstallmentPurchase", back_populates="user", cascade="all, delete-orphan")
    receivable_people = relationship("ReceivablePerson", back_populates="user", cascade="all, delete-orphan")
    receivables = relationship("Receivable", back_populates="user", cascade="all, delete-orphan")
    recurrences = relationship("Recurrence", back_populates="user", cascade="all, delete-orphan")
    simulations = relationship("Simulation", back_populates="user", cascade="all, delete-orphan")
