"""Add optional reserve end month

Revision ID: 0017_reserve_end_month
Revises: 0016_multiple_sources
Create Date: 2026-08-14

"""
from alembic import op
import sqlalchemy as sa

revision = "0017_reserve_end_month"
down_revision = "0016_multiple_sources"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "simulations",
        sa.Column("reserve_end_month", sa.String(length=7), nullable=True),
    )


def downgrade():
    op.drop_column("simulations", "reserve_end_month")
