"""Add overdue invoice edit setting

Revision ID: 0011_user_invoice_edit_setting
Revises: 0010_saved_simulations
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa

revision = "0011_user_invoice_edit_setting"
down_revision = "0010_saved_simulations"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("allow_overdue_invoice_edits", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )


def downgrade():
    op.drop_column("users", "allow_overdue_invoice_edits")
