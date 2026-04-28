"""Add users and ownership columns

Revision ID: 0002_auth_users
Revises: 0001_initial
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0002_auth_users"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # Keeps existing local data reachable after the migration.
    op.execute(
        "INSERT INTO users (id, name, email, password_hash) "
        "VALUES (1, 'Legacy User', 'legacy@example.com', '$2b$12$P1nK1ps7yXET2DpLwdIc4.u9igH8n036VGGjAg51GEkCkecv2AP2S')"
    )

    op.add_column("recurrences", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("invoices", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("transactions", sa.Column("user_id", sa.Integer(), nullable=True))

    op.execute("UPDATE recurrences SET user_id = 1 WHERE user_id IS NULL")
    op.execute("UPDATE invoices SET user_id = 1 WHERE user_id IS NULL")
    op.execute("UPDATE transactions SET user_id = 1 WHERE user_id IS NULL")

    op.alter_column("recurrences", "user_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("invoices", "user_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("transactions", "user_id", existing_type=sa.Integer(), nullable=False)

    op.create_index("ix_recurrences_user_id", "recurrences", ["user_id"], unique=False)
    op.create_index("ix_invoices_user_id", "invoices", ["user_id"], unique=False)
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"], unique=False)

    op.create_foreign_key("fk_recurrences_user", "recurrences", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_invoices_user", "invoices", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_transactions_user", "transactions", "users", ["user_id"], ["id"])


def downgrade():
    op.drop_constraint("fk_transactions_user", "transactions", type_="foreignkey")
    op.drop_constraint("fk_invoices_user", "invoices", type_="foreignkey")
    op.drop_constraint("fk_recurrences_user", "recurrences", type_="foreignkey")
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_index("ix_invoices_user_id", table_name="invoices")
    op.drop_index("ix_recurrences_user_id", table_name="recurrences")
    op.drop_column("transactions", "user_id")
    op.drop_column("invoices", "user_id")
    op.drop_column("recurrences", "user_id")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
