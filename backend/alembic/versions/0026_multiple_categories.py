"""Allow multiple categories per financial item.

Revision ID: 0026_multiple_categories
Revises: 0025_transaction_links
"""
from alembic import op
import sqlalchemy as sa


revision = "0026_multiple_categories"
down_revision = "0025_transaction_links"
branch_labels = None
depends_on = None


LINKS = (
    ("transaction_categories", "transaction_id", "transactions"),
    ("invoice_item_categories", "invoice_item_id", "invoice_items"),
    ("installment_purchase_categories", "installment_purchase_id", "installment_purchases"),
    ("recurrence_categories", "recurrence_id", "recurrences"),
    ("receivable_categories", "receivable_id", "receivables"),
)


def upgrade():
    for table_name, owner_column, owner_table in LINKS:
        op.create_table(
            table_name,
            sa.Column(owner_column, sa.Integer(), nullable=False),
            sa.Column("category_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint([owner_column], [f"{owner_table}.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint(owner_column, "category_id"),
            sa.UniqueConstraint(owner_column, "category_id", name=f"uq_{table_name}_owner_category"),
        )
        op.execute(
            sa.text(
                f"INSERT INTO {table_name} ({owner_column}, category_id) "
                f"SELECT id, category_id FROM {owner_table} WHERE category_id IS NOT NULL"
            )
        )


def downgrade():
    for table_name, _, _ in reversed(LINKS):
        op.drop_table(table_name)
