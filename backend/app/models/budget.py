from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class MonthlyBudgetPlan(Base):
    __tablename__ = "monthly_budget_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "month", name="uq_monthly_budget_plan_period"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    income_mode = Column(String(24), nullable=False, default="transactions")
    manual_income = Column(Numeric(12, 2), nullable=True)
    expected_income = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="monthly_budget_plans")
    selected_incomes = relationship(
        "MonthlyBudgetIncome",
        back_populates="plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class MonthlyBudgetIncome(Base):
    __tablename__ = "monthly_budget_incomes"

    plan_id = Column(
        Integer,
        ForeignKey("monthly_budget_plans.id", ondelete="CASCADE"),
        primary_key=True,
    )
    transaction_id = Column(
        Integer,
        ForeignKey("transactions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    include_in_reserve = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())

    plan = relationship("MonthlyBudgetPlan", back_populates="selected_incomes")
    transaction = relationship("Transaction")


class BudgetReserveRule(Base):
    __tablename__ = "budget_reserve_rules"
    __table_args__ = (
        UniqueConstraint("user_id", "effective_year", "effective_month", name="uq_budget_reserve_rule_period"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    effective_year = Column(Integer, nullable=False)
    effective_month = Column(Integer, nullable=False)
    rule_type = Column(String(24), nullable=False, default="percentage")
    value = Column(Numeric(12, 2), nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="budget_reserve_rules")
