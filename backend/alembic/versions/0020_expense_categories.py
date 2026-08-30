"""Add user expense categories

Revision ID: 0020_expense_categories
Revises: 0019_item_categories
Create Date: 2026-08-30

"""
from alembic import op
import sqlalchemy as sa


revision = "0020_expense_categories"
down_revision = "0019_item_categories"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#64748B"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"], unique=False)

    for table in ("transactions", "invoice_items", "installment_purchases", "recurrences"):
        op.add_column(table, sa.Column("category_id", sa.Integer(), nullable=True))
        op.create_index(f"ix_{table}_category_id", table, ["category_id"], unique=False)
        op.create_foreign_key(
            f"fk_{table}_category",
            table,
            "categories",
            ["category_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    for table in ("recurrences", "installment_purchases", "invoice_items", "transactions"):
        op.drop_constraint(f"fk_{table}_category", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_category_id", table_name=table)
        op.drop_column(table, "category_id")
    op.drop_index("ix_categories_user_id", table_name="categories")
    op.drop_table("categories")
