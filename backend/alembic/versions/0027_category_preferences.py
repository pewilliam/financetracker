"""Add category analysis and income planning preferences.

Revision ID: 0027_category_preferences
Revises: 0026_multiple_categories
"""
from alembic import op
import sqlalchemy as sa


revision = "0027_category_preferences"
down_revision = "0026_multiple_categories"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "categories",
        sa.Column("ignore_in_category_analysis", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "categories",
        sa.Column("include_in_income_planning", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    op.execute(
        sa.text(
            "UPDATE categories SET include_in_income_planning = 1 "
            "WHERE LOWER(name) = 'renda'"
        )
    )


def downgrade():
    op.drop_column("categories", "include_in_income_planning")
    op.drop_column("categories", "ignore_in_category_analysis")
