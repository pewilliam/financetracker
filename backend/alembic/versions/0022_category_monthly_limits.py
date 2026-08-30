"""Add monthly spending limits to categories

Revision ID: 0022_category_limits
Revises: 0021_receivable_categories
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa


revision = "0022_category_limits"
down_revision = "0021_receivable_categories"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("categories", sa.Column("monthly_limit", sa.Numeric(precision=12, scale=2), nullable=True))


def downgrade():
    op.drop_column("categories", "monthly_limit")
