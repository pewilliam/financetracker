"""Add a user authentication version for token revocation.

Revision ID: 0029_user_auth_version
Revises: 0028_reserve_income_sources
"""
from alembic import op
import sqlalchemy as sa


revision = "0029_user_auth_version"
down_revision = "0028_reserve_income_sources"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("auth_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade():
    op.drop_column("users", "auth_version")
