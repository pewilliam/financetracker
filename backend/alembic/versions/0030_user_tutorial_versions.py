"""Persist tutorial progress for each user.

Revision ID: 0030_user_tutorial_versions
Revises: 0029_user_auth_version
"""
from alembic import op
import sqlalchemy as sa


revision = "0030_user_tutorial_versions"
down_revision = "0029_user_auth_version"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("simulation_tutorial_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "users",
        sa.Column("months_tutorial_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade():
    op.drop_column("users", "months_tutorial_version")
    op.drop_column("users", "simulation_tutorial_version")
