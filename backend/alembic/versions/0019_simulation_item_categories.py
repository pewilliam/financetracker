"""Associate simulated purchases with allocation categories

Revision ID: 0019_item_categories
Revises: 0018_allocation_categories
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa


revision = "0019_item_categories"
down_revision = "0018_allocation_categories"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "simulation_items",
        sa.Column("category_id", sa.String(length=64), nullable=True),
    )


def downgrade():
    op.drop_column("simulation_items", "category_id")
