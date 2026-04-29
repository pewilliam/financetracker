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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="receivables")
    person = relationship("ReceivablePerson", back_populates="receivables")
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
