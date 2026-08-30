"""Add allocation categories to saved simulations

Revision ID: 0018_allocation_categories
Revises: 0017_reserve_end_month
Create Date: 2026-08-15

"""
from alembic import op
import sqlalchemy as sa


revision = "0018_allocation_categories"
down_revision = "0017_reserve_end_month"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "simulations",
        sa.Column("allocation_categories", sa.JSON(), nullable=True),
    )
    op.execute("UPDATE simulations SET allocation_categories = JSON_ARRAY() WHERE allocation_categories IS NULL")
    op.alter_column("simulations", "allocation_categories", existing_type=sa.JSON(), nullable=False)


def downgrade():
    op.drop_column("simulations", "allocation_categories")
