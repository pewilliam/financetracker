from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship
from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    type = Column(Enum("expense", "income", name="transaction_type"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    description = Column(String(255))
    is_future = Column(Boolean, default=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    recurrence_id = Column(Integer, ForeignKey("recurrences.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    linked_expense_transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    linked_expense_invoice_item_id = Column(Integer, ForeignKey("invoice_items.id", ondelete="SET NULL"), nullable=True, index=True)
    linked_expense_installment_item_id = Column(Integer, ForeignKey("installment_items.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="transactions")
    invoice = relationship("Invoice", foreign_keys=[invoice_id], back_populates="transactions")
    recurrence = relationship("Recurrence", foreign_keys=[recurrence_id], back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    linked_expense_transaction = relationship("Transaction", foreign_keys=[linked_expense_transaction_id], remote_side=[id])
    linked_expense_invoice_item = relationship("InvoiceItem", foreign_keys=[linked_expense_invoice_item_id])
    linked_expense_installment_item = relationship("InstallmentItem", foreign_keys=[linked_expense_installment_item_id])

    @property
    def linked_expense(self):
        if self.linked_expense_transaction:
            return {
                "source_type": "transaction",
                "source_id": self.linked_expense_transaction.id,
                "description": self.linked_expense_transaction.description or "Gasto sem descrição",
                "amount": self.linked_expense_transaction.amount,
                "date": self.linked_expense_transaction.date,
                "origin": "months",
                "category_id": self.linked_expense_transaction.category_id,
            }
        if self.linked_expense_invoice_item:
            item = self.linked_expense_invoice_item
            invoice = item.invoice
            return {
                "source_type": "invoice_item",
                "source_id": item.id,
                "description": item.description,
                "amount": item.amount,
                "date": invoice.due_date if invoice else self.date,
                "origin": "invoice",
                "invoice_name": invoice.name if invoice else None,
                "category_id": item.category_id,
            }
        if self.linked_expense_installment_item:
            item = self.linked_expense_installment_item
            invoice = item.invoice
            return {
                "source_type": "installment_item",
                "source_id": item.id,
                "description": item.purchase_description or item.description,
                "amount": item.amount,
                "date": invoice.due_date if invoice else self.date,
                "origin": "invoice",
                "invoice_name": invoice.name if invoice else None,
                "purchase_id": item.purchase_id,
                "installment_number": item.installment_number,
                "installment_count": item.installment_count,
                "category_id": item.category_id,
            }
        return None
