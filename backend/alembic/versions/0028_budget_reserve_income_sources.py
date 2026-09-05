"""Choose which monthly incomes compose the reserve base.

Revision ID: 0028_reserve_income_sources
Revises: 0027_category_preferences
"""
from alembic import op
import sqlalchemy as sa


revision = "0028_reserve_income_sources"
down_revision = "0027_category_preferences"
branch_labels = None
depends_on = None


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("monthly_budget_incomes")}
    if "include_in_reserve" not in columns:
        op.add_column(
            "monthly_budget_incomes",
            sa.Column("include_in_reserve", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        )


def downgrade():
    op.drop_column("monthly_budget_incomes", "include_in_reserve")
