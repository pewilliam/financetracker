"""Add reserve start month to saved simulations

Revision ID: 0014_reserve_start_month
Revises: 0013_simulation_planning
Create Date: 2026-08-14

"""
from alembic import op
import sqlalchemy as sa

revision = "0014_reserve_start_month"
down_revision = "0013_simulation_planning"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "simulations",
        sa.Column("reserve_start_month", sa.String(length=7), nullable=True),
    )


def downgrade():
    op.drop_column("simulations", "reserve_start_month")
