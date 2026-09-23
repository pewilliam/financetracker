"""Add subscription billing period and commitment term

Revision ID: 0035_subscription_commitment
Revises: 0034_card_subscriptions
"""
from alembic import op
import sqlalchemy as sa


revision = "0035_subscription_commitment"
down_revision = "0034_card_subscriptions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "card_subscriptions",
        sa.Column("billing_interval_months", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "card_subscriptions",
        sa.Column("term_kind", sa.String(length=20), nullable=False, server_default="indefinite"),
    )
    op.add_column("card_subscriptions", sa.Column("term_months", sa.Integer(), nullable=True))
    op.add_column("card_subscriptions", sa.Column("term_end_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("card_subscriptions", "term_end_date")
    op.drop_column("card_subscriptions", "term_months")
    op.drop_column("card_subscriptions", "term_kind")
    op.drop_column("card_subscriptions", "billing_interval_months")
