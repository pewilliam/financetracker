"""Link receivables to expense sources and installment series

Revision ID: 0024_receivable_links
Revises: 0023_budget_planning
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa


revision = "0024_receivable_links"
down_revision = "0023_budget_planning"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("receivables", sa.Column("series_id", sa.String(length=36), nullable=True))
    op.add_column("receivables", sa.Column("series_installment_number", sa.Integer(), nullable=True))
    op.add_column("receivables", sa.Column("series_installment_count", sa.Integer(), nullable=True))
    op.add_column("receivables", sa.Column("source_transaction_id", sa.Integer(), nullable=True))
    op.add_column("receivables", sa.Column("source_invoice_item_id", sa.Integer(), nullable=True))
    op.add_column("receivables", sa.Column("source_installment_item_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_receivable_source_transaction", "receivables", "transactions", ["source_transaction_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_receivable_source_invoice_item", "receivables", "invoice_items", ["source_invoice_item_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_receivable_source_installment_item", "receivables", "installment_items", ["source_installment_item_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_receivables_series_id", "receivables", ["series_id"], unique=False)
    op.create_index("ix_receivables_source_transaction_id", "receivables", ["source_transaction_id"], unique=False)
    op.create_index("ix_receivables_source_invoice_item_id", "receivables", ["source_invoice_item_id"], unique=False)
    op.create_index("ix_receivables_source_installment_item_id", "receivables", ["source_installment_item_id"], unique=False)


def downgrade():
    op.drop_index("ix_receivables_source_installment_item_id", table_name="receivables")
    op.drop_index("ix_receivables_source_invoice_item_id", table_name="receivables")
    op.drop_index("ix_receivables_source_transaction_id", table_name="receivables")
    op.drop_index("ix_receivables_series_id", table_name="receivables")
    op.drop_constraint("fk_receivable_source_installment_item", "receivables", type_="foreignkey")
    op.drop_constraint("fk_receivable_source_invoice_item", "receivables", type_="foreignkey")
    op.drop_constraint("fk_receivable_source_transaction", "receivables", type_="foreignkey")
    op.drop_column("receivables", "source_installment_item_id")
    op.drop_column("receivables", "source_invoice_item_id")
    op.drop_column("receivables", "source_transaction_id")
    op.drop_column("receivables", "series_installment_count")
    op.drop_column("receivables", "series_installment_number")
    op.drop_column("receivables", "series_id")
