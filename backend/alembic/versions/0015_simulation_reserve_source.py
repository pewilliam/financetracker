"""Add simulated income source for planned reserve

Revision ID: 0015_reserve_source
Revises: 0014_reserve_start_month
Create Date: 2026-08-14

"""
from alembic import op
import sqlalchemy as sa

revision = "0015_reserve_source"
down_revision = "0014_reserve_start_month"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "simulations",
        sa.Column("reserve_source_item_position", sa.Integer(), nullable=True),
    )


def downgrade():
    op.drop_column("simulations", "reserve_source_item_position")
