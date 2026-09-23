"""Remember whether the card pays on the first day, the last day, or a fixed day

Revision ID: 0037_payment_forecast_kind
Revises: 0036_card_payment_forecast
"""
from alembic import op
import sqlalchemy as sa


revision = "0037_payment_forecast_kind"
down_revision = "0036_card_payment_forecast"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("credit_cards", sa.Column("payment_forecast_kind", sa.String(length=20), nullable=True))
    op.execute(
        "UPDATE credit_cards SET payment_forecast_kind = 'day' WHERE payment_forecast_day IS NOT NULL"
    )


def downgrade():
    op.drop_column("credit_cards", "payment_forecast_kind")
