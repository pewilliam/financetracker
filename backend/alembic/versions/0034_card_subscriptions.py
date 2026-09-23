"""Add credit card subscriptions

Revision ID: 0034_card_subscriptions
Revises: 0033_credit_cards
"""
from alembic import op
import sqlalchemy as sa


revision = "0034_card_subscriptions"
down_revision = "0033_credit_cards"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "card_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("credit_card_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("charge_day", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["credit_card_id"], ["credit_cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_card_subscriptions_user_id", "card_subscriptions", ["user_id"])
    op.create_index("ix_card_subscriptions_credit_card_id", "card_subscriptions", ["credit_card_id"])
    op.create_index("ix_card_subscriptions_category_id", "card_subscriptions", ["category_id"])

    op.create_table(
        "card_subscription_skips",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subscription_id", sa.Integer(), nullable=False),
        sa.Column("charge_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["subscription_id"], ["card_subscriptions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("subscription_id", "charge_date", name="uq_card_subscription_skips_charge"),
    )
    op.create_index("ix_card_subscription_skips_subscription_id", "card_subscription_skips", ["subscription_id"])

    op.create_table(
        "card_subscription_categories",
        sa.Column("card_subscription_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["card_subscription_id"], ["card_subscriptions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("card_subscription_id", "category_id"),
        sa.UniqueConstraint("card_subscription_id", "category_id", name="uq_card_subscription_categories_owner_category"),
    )

    op.add_column("invoice_items", sa.Column("subscription_id", sa.Integer(), nullable=True))
    op.add_column("invoice_items", sa.Column("subscription_charge_date", sa.Date(), nullable=True))
    op.create_index("ix_invoice_items_subscription_id", "invoice_items", ["subscription_id"])
    op.create_foreign_key(
        "fk_invoice_items_subscription",
        "invoice_items",
        "card_subscriptions",
        ["subscription_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_invoice_items_subscription_charge",
        "invoice_items",
        ["subscription_id", "subscription_charge_date"],
    )


def downgrade():
    op.drop_constraint("uq_invoice_items_subscription_charge", "invoice_items", type_="unique")
    op.drop_constraint("fk_invoice_items_subscription", "invoice_items", type_="foreignkey")
    op.drop_index("ix_invoice_items_subscription_id", table_name="invoice_items")
    op.drop_column("invoice_items", "subscription_charge_date")
    op.drop_column("invoice_items", "subscription_id")
    op.drop_table("card_subscription_categories")
    op.drop_index("ix_card_subscription_skips_subscription_id", table_name="card_subscription_skips")
    op.drop_table("card_subscription_skips")
    op.drop_index("ix_card_subscriptions_category_id", table_name="card_subscriptions")
    op.drop_index("ix_card_subscriptions_credit_card_id", table_name="card_subscriptions")
    op.drop_index("ix_card_subscriptions_user_id", table_name="card_subscriptions")
    op.drop_table("card_subscriptions")
