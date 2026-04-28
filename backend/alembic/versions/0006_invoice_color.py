"""Add invoice color

Revision ID: 0006_invoice_color
Revises: 0005_installments
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0006_invoice_color"
down_revision = "0005_installments"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "invoices",
        sa.Column("color", sa.String(length=20), nullable=False, server_default="#3B82F6"),
    )


def downgrade():
    op.drop_column("invoices", "color")
