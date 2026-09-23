"""Add the card payment forecast day used by monthly control

Revision ID: 0036_card_payment_forecast
Revises: 0035_subscription_commitment
"""
from alembic import op
import sqlalchemy as sa


revision = "0036_card_payment_forecast"
down_revision = "0035_subscription_commitment"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("credit_cards", sa.Column("payment_forecast_day", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("credit_cards", "payment_forecast_day")
