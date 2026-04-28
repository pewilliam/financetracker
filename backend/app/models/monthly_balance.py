from sqlalchemy import Column, DateTime, Integer, Numeric, func
from app.database import Base


class MonthlyBalance(Base):
    __tablename__ = "monthly_balance"

    id = Column(Integer, primary_key=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    opening_balance = Column(Numeric(10, 2), nullable=False, default=0)
    closing_balance = Column(Numeric(10, 2), nullable=False, default=0)
    total_expenses = Column(Numeric(10, 2), nullable=False, default=0)
    total_income = Column(Numeric(10, 2), nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())
