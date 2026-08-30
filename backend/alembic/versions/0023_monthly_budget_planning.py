"""Add monthly income and reserve planning

Revision ID: 0023_budget_planning
Revises: 0022_category_limits
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa


revision = "0023_budget_planning"
down_revision = "0022_category_limits"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "monthly_budget_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("income_mode", sa.String(length=24), nullable=False, server_default="transactions"),
        sa.Column("manual_income", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("expected_income", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("user_id", "year", "month", name="uq_monthly_budget_plan_period"),
    )
    op.create_index("ix_monthly_budget_plans_user_id", "monthly_budget_plans", ["user_id"], unique=False)

    op.create_table(
        "monthly_budget_incomes",
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["plan_id"], ["monthly_budget_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("plan_id", "transaction_id"),
    )

    op.create_table(
        "budget_reserve_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("effective_year", sa.Integer(), nullable=False),
        sa.Column("effective_month", sa.Integer(), nullable=False),
        sa.Column("rule_type", sa.String(length=24), nullable=False, server_default="percentage"),
        sa.Column("value", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("user_id", "effective_year", "effective_month", name="uq_budget_reserve_rule_period"),
    )
    op.create_index("ix_budget_reserve_rules_user_id", "budget_reserve_rules", ["user_id"], unique=False)


def downgrade():
    op.drop_index("ix_budget_reserve_rules_user_id", table_name="budget_reserve_rules")
    op.drop_table("budget_reserve_rules")
    op.drop_table("monthly_budget_incomes")
    op.drop_index("ix_monthly_budget_plans_user_id", table_name="monthly_budget_plans")
    op.drop_table("monthly_budget_plans")
