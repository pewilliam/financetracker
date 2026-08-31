"""Link income transactions to expense sources

Revision ID: 0025_transaction_links
Revises: 0024_receivable_links
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa


revision = "0025_transaction_links"
down_revision = "0024_receivable_links"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("transactions", sa.Column("linked_expense_transaction_id", sa.Integer(), nullable=True))
    op.add_column("transactions", sa.Column("linked_expense_invoice_item_id", sa.Integer(), nullable=True))
    op.add_column("transactions", sa.Column("linked_expense_installment_item_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_transaction_linked_expense_transaction", "transactions", "transactions", ["linked_expense_transaction_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_transaction_linked_expense_invoice_item", "transactions", "invoice_items", ["linked_expense_invoice_item_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_transaction_linked_expense_installment_item", "transactions", "installment_items", ["linked_expense_installment_item_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_transactions_linked_expense_transaction_id", "transactions", ["linked_expense_transaction_id"], unique=False)
    op.create_index("ix_transactions_linked_expense_invoice_item_id", "transactions", ["linked_expense_invoice_item_id"], unique=False)
    op.create_index("ix_transactions_linked_expense_installment_item_id", "transactions", ["linked_expense_installment_item_id"], unique=False)


def downgrade():
    op.drop_index("ix_transactions_linked_expense_installment_item_id", table_name="transactions")
    op.drop_index("ix_transactions_linked_expense_invoice_item_id", table_name="transactions")
    op.drop_index("ix_transactions_linked_expense_transaction_id", table_name="transactions")
    op.drop_constraint("fk_transaction_linked_expense_installment_item", "transactions", type_="foreignkey")
    op.drop_constraint("fk_transaction_linked_expense_invoice_item", "transactions", type_="foreignkey")
    op.drop_constraint("fk_transaction_linked_expense_transaction", "transactions", type_="foreignkey")
    op.drop_column("transactions", "linked_expense_installment_item_id")
    op.drop_column("transactions", "linked_expense_invoice_item_id")
    op.drop_column("transactions", "linked_expense_transaction_id")
