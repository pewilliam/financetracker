from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import relationship
from app.database import Base


class Receivable(Base):
    __tablename__ = "receivables"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    person_id = Column(Integer, ForeignKey("receivable_people.id"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    total_amount = Column(Numeric(10, 2), nullable=False)
    received_amount = Column(Numeric(10, 2), nullable=False, default=0)
    due_date = Column(Date, nullable=False, index=True)
    status = Column(
        Enum("pending", "paid", "overdue", "partial", name="receivable_status"),
        nullable=False,
        default="pending",
    )
    paid_at = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    series_id = Column(String(36), nullable=True, index=True)
    series_installment_number = Column(Integer, nullable=True)
    series_installment_count = Column(Integer, nullable=True)
    source_transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    source_invoice_item_id = Column(Integer, ForeignKey("invoice_items.id", ondelete="SET NULL"), nullable=True, index=True)
    source_installment_item_id = Column(Integer, ForeignKey("installment_items.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="receivables")
    person = relationship("ReceivablePerson", back_populates="receivables")
    category = relationship("Category", back_populates="receivables")
    source_transaction = relationship("Transaction", foreign_keys=[source_transaction_id])
    source_invoice_item = relationship("InvoiceItem", foreign_keys=[source_invoice_item_id])
    source_installment_item = relationship("InstallmentItem", foreign_keys=[source_installment_item_id])
    payments = relationship(
        "ReceivablePayment",
        back_populates="receivable",
        cascade="all, delete-orphan",
        order_by="ReceivablePayment.paid_at",
    )

    @property
    def remaining_amount(self):
        return max((self.total_amount or 0) - (self.received_amount or 0), 0)

    @property
    def person_name(self):
        return self.person.name if self.person else ""

    @property
    def linked_expense(self):
        if self.source_transaction:
            return {
                "source_type": "transaction",
                "source_id": self.source_transaction.id,
                "description": self.source_transaction.description or "Gasto sem descrição",
                "amount": self.source_transaction.amount,
                "date": self.source_transaction.date,
                "origin": "months",
            }
        if self.source_invoice_item:
            invoice = self.source_invoice_item.invoice
            return {
                "source_type": "invoice_item",
                "source_id": self.source_invoice_item.id,
                "description": self.source_invoice_item.description,
                "amount": self.source_invoice_item.amount,
                "date": invoice.due_date if invoice else self.due_date,
                "origin": "invoice",
                "invoice_name": invoice.name if invoice else None,
            }
        if self.source_installment_item:
            item = self.source_installment_item
            invoice = item.invoice
            return {
                "source_type": "installment_item",
                "source_id": item.id,
                "description": item.purchase_description or item.description,
                "amount": item.amount,
                "date": invoice.due_date if invoice else self.due_date,
                "origin": "invoice",
                "invoice_name": invoice.name if invoice else None,
                "purchase_id": item.purchase_id,
                "installment_number": item.installment_number,
                "installment_count": item.installment_count,
            }
        return None
