"""Add saved simulations

Revision ID: 0010_saved_simulations
Revises: 0009_receivable_people
Create Date: 2026-07-01

"""
from alembic import op
import sqlalchemy as sa

revision = "0010_saved_simulations"
down_revision = "0009_receivable_people"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "simulations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("include_real", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_simulations_user"),
        sa.UniqueConstraint("user_id", "name", name="uq_simulations_user_name"),
    )
    op.create_index("ix_simulations_user_id", "simulations", ["user_id"], unique=False)

    op.create_table(
        "simulation_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("simulation_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("description", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("installment_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("recurrence_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("value_mode", sa.String(length=20), nullable=False, server_default="equal"),
        sa.Column("start_month", sa.String(length=7), nullable=False),
        sa.Column("custom_values", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["simulation_id"], ["simulations.id"], name="fk_simulation_items_simulation", ondelete="CASCADE"),
    )
    op.create_index("ix_simulation_items_simulation_id", "simulation_items", ["simulation_id"], unique=False)


def downgrade():
    op.drop_index("ix_simulation_items_simulation_id", table_name="simulation_items")
    op.drop_table("simulation_items")
    op.drop_index("ix_simulations_user_id", table_name="simulations")
    op.drop_table("simulations")
