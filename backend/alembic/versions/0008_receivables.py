"""Add receivables

Revision ID: 0008_receivables
Revises: 0007_invoice_templates
Create Date: 2026-04-29

"""
from alembic import op
import sqlalchemy as sa

revision = "0008_receivables"
down_revision = "0007_invoice_templates"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "receivables",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("person_name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("received_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "paid", "overdue", "partial", name="receivable_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("paid_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_receivables_user"),
    )
    op.create_index("ix_receivables_due_date", "receivables", ["due_date"], unique=False)
    op.create_index("ix_receivables_user_id", "receivables", ["user_id"], unique=False)

    op.create_table(
        "receivable_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("receivable_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["receivable_id"], ["receivables.id"], name="fk_receivable_payments_receivable"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], name="fk_receivable_payments_transaction", ondelete="SET NULL"),
    )
    op.create_index("ix_receivable_payments_paid_at", "receivable_payments", ["paid_at"], unique=False)
    op.create_index("ix_receivable_payments_receivable_id", "receivable_payments", ["receivable_id"], unique=False)
    op.create_index("ix_receivable_payments_transaction_id", "receivable_payments", ["transaction_id"], unique=False)


def downgrade():
    op.drop_index("ix_receivable_payments_transaction_id", table_name="receivable_payments")
    op.drop_index("ix_receivable_payments_receivable_id", table_name="receivable_payments")
    op.drop_index("ix_receivable_payments_paid_at", table_name="receivable_payments")
    op.drop_table("receivable_payments")
    op.drop_index("ix_receivables_user_id", table_name="receivables")
    op.drop_index("ix_receivables_due_date", table_name="receivables")
    op.drop_table("receivables")
