"""Desired products, offers and immutable price snapshots.

Revision ID: 0039_desired_products
Revises: 0038_invoice_planned_payment
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import LONGTEXT


revision = "0039_desired_products"
down_revision = "0038_invoice_planned_payment"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "desired_products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100)),
        sa.Column("description", sa.Text()),
        sa.Column("image_data", sa.Text().with_variant(LONGTEXT(), "mysql")),
        sa.Column("image_source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("target_price", sa.Numeric(10, 2)),
        sa.Column("planned_purchase_date", sa.Date()),
        sa.Column("status", sa.String(30), nullable=False, server_default="want"),
        sa.Column("chosen_offer_id", sa.Integer()),
        sa.Column("purchase_offer_snapshot", sa.JSON()),
        sa.Column("purchase_store", sa.String(150)),
        sa.Column("paid_price", sa.Numeric(10, 2)),
        sa.Column("purchase_date", sa.Date()),
        sa.Column("purchase_payment_method", sa.String(20)),
        sa.Column("purchase_installment_count", sa.Integer()),
        sa.Column("purchase_installment_amount", sa.Numeric(10, 2)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_desired_products_user_id", "desired_products", ["user_id"])
    op.create_table(
        "product_offers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("desired_products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("store", sa.String(150), nullable=False),
        sa.Column("url", sa.String(2048)),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("shipping", sa.Numeric(10, 2)),
        sa.Column("payment_method", sa.String(20), nullable=False, server_default="cash"),
        sa.Column("installment_count", sa.Integer()),
        sa.Column("installment_amount", sa.Numeric(10, 2)),
        sa.Column("notes", sa.Text()),
        sa.Column("recorded_at", sa.Date(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("deleted_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_product_offers_product_id", "product_offers", ["product_id"])
    op.create_table(
        "offer_price_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("offer_id", sa.Integer(), sa.ForeignKey("product_offers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("shipping", sa.Numeric(10, 2)),
        sa.Column("payment_method", sa.String(20), nullable=False),
        sa.Column("installment_count", sa.Integer()),
        sa.Column("installment_amount", sa.Numeric(10, 2)),
        sa.Column("total_cost", sa.Numeric(10, 2), nullable=False),
        sa.Column("recorded_at", sa.Date(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_offer_price_history_offer_id", "offer_price_history", ["offer_id"])


def downgrade():
    op.drop_index("ix_offer_price_history_offer_id", table_name="offer_price_history")
    op.drop_table("offer_price_history")
    op.drop_index("ix_product_offers_product_id", table_name="product_offers")
    op.drop_table("product_offers")
    op.drop_index("ix_desired_products_user_id", table_name="desired_products")
    op.drop_table("desired_products")
