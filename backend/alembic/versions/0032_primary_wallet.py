"""Add a primary wallet per user.

Revision ID: 0032_primary_wallet
Revises: 0031_wallets
"""
from alembic import op
import sqlalchemy as sa


revision = "0032_primary_wallet"
down_revision = "0031_wallets"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "wallets",
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_wallets_user_primary", "wallets", ["user_id", "is_primary"])
    op.execute(sa.text("""
        UPDATE wallets AS wallet
        JOIN (
            SELECT user_id, MIN(id) AS wallet_id
            FROM wallets
            WHERE active = 1
            GROUP BY user_id
        ) AS selected ON selected.wallet_id = wallet.id
        SET wallet.is_primary = 1
    """))


def downgrade():
    op.drop_index("ix_wallets_user_primary", table_name="wallets")
    op.drop_column("wallets", "is_primary")
