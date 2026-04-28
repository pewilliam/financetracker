"""Add invoice paid status and recurrence months

Revision ID: 0004_invoice_rec
Revises: 0003_monthly_balance_user
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0004_invoice_rec"
down_revision = "0003_monthly_balance_user"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    invoice_columns = {column["name"] for column in inspector.get_columns("invoices")}
    recurrence_columns = {column["name"] for column in inspector.get_columns("recurrences")}

    if "paid" not in invoice_columns:
        op.add_column(
            "invoices",
            sa.Column("paid", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )
    if "recurrence_months" not in recurrence_columns:
        op.add_column(
            "recurrences",
            sa.Column("recurrence_months", sa.Integer(), nullable=False, server_default="1"),
        )


def downgrade():
    op.drop_column("recurrences", "recurrence_months")
    op.drop_column("invoices", "paid")
