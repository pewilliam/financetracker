from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint, func
from app.database import Base


class MonthlyBalance(Base):
    __tablename__ = "monthly_balance"
    __table_args__ = (UniqueConstraint("user_id", "year", "month", name="uq_monthly_balance_user_year_month"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    opening_balance = Column(Numeric(10, 2), nullable=False, default=0)
    closing_balance = Column(Numeric(10, 2), nullable=False, default=0)
    total_expenses = Column(Numeric(10, 2), nullable=False, default=0)
    total_income = Column(Numeric(10, 2), nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())
