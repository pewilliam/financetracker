"""Allow multiple simulated income sources for planned reserve

Revision ID: 0016_multiple_sources
Revises: 0015_reserve_source
Create Date: 2026-08-14

"""
from alembic import op
import sqlalchemy as sa

revision = "0016_multiple_sources"
down_revision = "0015_reserve_source"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "simulations",
        sa.Column("reserve_source_item_positions", sa.JSON(), nullable=True),
    )
    op.execute(
        "UPDATE simulations "
        "SET reserve_source_item_positions = JSON_ARRAY(reserve_source_item_position) "
        "WHERE reserve_source_item_position IS NOT NULL"
    )
    op.execute(
        "UPDATE simulations SET reserve_source_item_positions = JSON_ARRAY() "
        "WHERE reserve_source_item_positions IS NULL"
    )
    op.alter_column("simulations", "reserve_source_item_positions", existing_type=sa.JSON(), nullable=False)
    op.drop_column("simulations", "reserve_source_item_position")


def downgrade():
    op.add_column(
        "simulations",
        sa.Column("reserve_source_item_position", sa.Integer(), nullable=True),
    )
    op.execute(
        "UPDATE simulations "
        "SET reserve_source_item_position = CAST(JSON_UNQUOTE(JSON_EXTRACT(reserve_source_item_positions, '$[0]')) AS UNSIGNED) "
        "WHERE JSON_LENGTH(reserve_source_item_positions) > 0"
    )
    op.drop_column("simulations", "reserve_source_item_positions")
