"""Add installment item status

Revision ID: 0012_installment_item_status
Revises: 0011_user_invoice_edit_setting
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa

revision = "0012_installment_item_status"
down_revision = "0011_user_invoice_edit_setting"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "installment_items",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
    )
    op.add_column(
        "installment_items",
        sa.Column("refund_invoice_item_id", sa.Integer(), nullable=True),
    )


def downgrade():
    op.drop_column("installment_items", "refund_invoice_item_id")
    op.drop_column("installment_items", "status")
