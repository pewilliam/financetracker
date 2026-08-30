"""Add categories to receivables

Revision ID: 0021_receivable_categories
Revises: 0020_expense_categories
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa


revision = "0021_receivable_categories"
down_revision = "0020_expense_categories"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("receivables", sa.Column("category_id", sa.Integer(), nullable=True))
    op.create_index("ix_receivables_category_id", "receivables", ["category_id"], unique=False)
    op.create_foreign_key(
        "fk_receivables_category",
        "receivables",
        "categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("fk_receivables_category", "receivables", type_="foreignkey")
    op.drop_index("ix_receivables_category_id", table_name="receivables")
    op.drop_column("receivables", "category_id")
