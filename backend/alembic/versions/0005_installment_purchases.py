"""Add installment purchases

Revision ID: 0005_installments
Revises: 0004_invoice_rec
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0005_installments"
down_revision = "0004_invoice_rec"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "installment_purchases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("installment_count", sa.Integer(), nullable=False),
        sa.Column("installment_value", sa.Numeric(10, 2), nullable=False),
        sa.Column("first_invoice_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["first_invoice_id"], ["invoices.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_installment_purchases_user_id", "installment_purchases", ["user_id"], unique=False)

    op.create_table(
        "installment_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("purchase_id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=True),
        sa.Column("installment_number", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["purchase_id"], ["installment_purchases.id"]),
    )
    op.create_index("ix_installment_items_invoice_id", "installment_items", ["invoice_id"], unique=False)
    op.create_index("ix_installment_items_purchase_id", "installment_items", ["purchase_id"], unique=False)


def downgrade():
    op.drop_index("ix_installment_items_purchase_id", table_name="installment_items")
    op.drop_index("ix_installment_items_invoice_id", table_name="installment_items")
    op.drop_table("installment_items")
    op.drop_index("ix_installment_purchases_user_id", table_name="installment_purchases")
    op.drop_table("installment_purchases")
