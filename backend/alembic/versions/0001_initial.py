"""Initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "recurrences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column(
            "type",
            sa.Enum("expense", "income", name="transaction_type"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("linked_transaction_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_invoices_due_date", "invoices", ["due_date"], unique=False)

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("expense", "income", name="transaction_type"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_future", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("invoice_id", sa.Integer(), nullable=True),
        sa.Column("recurrence_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.ForeignKeyConstraint(["recurrence_id"], ["recurrences.id"]),
    )
    op.create_index("ix_transactions_date", "transactions", ["date"], unique=False)

    op.create_table(
        "invoice_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
    )

    op.create_table(
        "monthly_balance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("opening_balance", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("closing_balance", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total_expenses", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total_income", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("year", "month", name="uq_monthly_balance_year_month"),
    )

    op.create_foreign_key(
        "fk_invoices_linked_transaction",
        "invoices",
        "transactions",
        ["linked_transaction_id"],
        ["id"],
    )


def downgrade():
    op.drop_constraint("fk_invoices_linked_transaction", "invoices", type_="foreignkey")
    op.drop_table("monthly_balance")
    op.drop_table("invoice_items")
    op.drop_index("ix_transactions_date", table_name="transactions")
    op.drop_table("transactions")
    op.drop_index("ix_invoices_due_date", table_name="invoices")
    op.drop_table("invoices")
    op.drop_table("recurrences")
