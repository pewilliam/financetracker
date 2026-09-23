"""Store a per-invoice planned payment date

Revision ID: 0038_invoice_planned_payment
Revises: 0037_payment_forecast_kind
"""
from alembic import op
import sqlalchemy as sa


revision = "0038_invoice_planned_payment"
down_revision = "0037_payment_forecast_kind"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("invoices", sa.Column("planned_payment_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("invoices", "planned_payment_date")
