"""Add reserve planning to saved simulations

Revision ID: 0013_simulation_planning
Revises: 0012_installment_item_status
Create Date: 2026-08-14

"""
from alembic import op
import sqlalchemy as sa

revision = "0013_simulation_planning"
down_revision = "0012_installment_item_status"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "simulations",
        sa.Column("reserve_mode", sa.String(length=20), nullable=False, server_default="percentage"),
    )
    op.add_column(
        "simulations",
        sa.Column("reserve_value", sa.Numeric(10, 2), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("simulations", "reserve_value")
    op.drop_column("simulations", "reserve_mode")
