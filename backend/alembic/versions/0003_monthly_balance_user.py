"""Add user scoped monthly opening balances

Revision ID: 0003_monthly_balance_user
Revises: 0002_auth_users
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0003_monthly_balance_user"
down_revision = "0002_auth_users"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("monthly_balance")}
    indexes = {index["name"] for index in inspector.get_indexes("monthly_balance")}
    uniques = {constraint["name"] for constraint in inspector.get_unique_constraints("monthly_balance")}

    if "user_id" not in columns:
        op.add_column("monthly_balance", sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute("UPDATE monthly_balance SET user_id = 1 WHERE user_id IS NULL")
    op.alter_column("monthly_balance", "user_id", existing_type=sa.Integer(), nullable=False)

    if "uq_monthly_balance_year_month" in uniques or "uq_monthly_balance_year_month" in indexes:
        op.drop_constraint("uq_monthly_balance_year_month", "monthly_balance", type_="unique")
    if "ix_monthly_balance_user_id" not in indexes:
        op.create_index("ix_monthly_balance_user_id", "monthly_balance", ["user_id"], unique=False)
    if "uq_monthly_balance_user_year_month" not in uniques:
        op.create_unique_constraint(
            "uq_monthly_balance_user_year_month",
            "monthly_balance",
            ["user_id", "year", "month"],
        )

    foreign_keys = {fk["name"] for fk in inspector.get_foreign_keys("monthly_balance")}
    if "fk_monthly_balance_user" not in foreign_keys:
        op.create_foreign_key("fk_monthly_balance_user", "monthly_balance", "users", ["user_id"], ["id"])


def downgrade():
    op.drop_constraint("fk_monthly_balance_user", "monthly_balance", type_="foreignkey")
    op.drop_constraint("uq_monthly_balance_user_year_month", "monthly_balance", type_="unique")
    op.drop_index("ix_monthly_balance_user_id", table_name="monthly_balance")
    op.create_unique_constraint("uq_monthly_balance_year_month", "monthly_balance", ["year", "month"])
    op.drop_column("monthly_balance", "user_id")
