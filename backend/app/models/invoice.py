from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import relationship
from app.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    template_id = Column(Integer, ForeignKey("invoice_templates.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    due_date = Column(Date, nullable=False, index=True)
    total_amount = Column(Numeric(10, 2), nullable=False, default=0)
    paid = Column(Boolean, nullable=False, default=False)
    linked_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="invoices")
    template = relationship("InvoiceTemplate", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    installment_items = relationship("InstallmentItem", back_populates="invoice", passive_deletes=True)
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

    @property
    def name(self) -> str:
        return self.template.name if self.template else ""

    @property
    def color(self) -> str:
        return self.template.color if self.template else "#3B82F6"
