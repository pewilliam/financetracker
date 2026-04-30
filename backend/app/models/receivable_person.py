from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.database import Base


class ReceivablePerson(Base):
    __tablename__ = "receivable_people"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_receivable_people_user_name"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="receivable_people")
    receivables = relationship("Receivable", back_populates="person")
