from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship
from app.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    total_amount = Column(Numeric(10, 2), nullable=False, default=0)
    linked_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    transactions = relationship(
        "Transaction",
        foreign_keys="Transaction.invoice_id",
        back_populates="invoice",
    )
    linked_transaction = relationship(
        "Transaction",
        foreign_keys=[linked_transaction_id],
        uselist=False,
        post_update=True,
    )
