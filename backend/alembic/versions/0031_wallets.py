"""Add wallets, transfers and traceable balance adjustments.

Revision ID: 0031_wallets
Revises: 0030_user_tutorial_versions
"""
from datetime import date

from alembic import op
import sqlalchemy as sa


revision = "0031_wallets"
down_revision = "0030_user_tutorial_versions"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "wallets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("institution", sa.String(length=100), nullable=True),
        sa.Column("type", sa.String(length=30), nullable=False, server_default="other"),
        sa.Column("initial_balance", sa.Numeric(10, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("tracking_started_on", sa.Date(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#14A078"),
        sa.Column("icon", sa.String(length=40), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"])
    op.create_table(
        "wallet_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("wallet_id", sa.Integer(), sa.ForeignKey("wallets.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("balance_before", sa.Numeric(10, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(10, 2), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_wallet_adjustments_user_id", "wallet_adjustments", ["user_id"])
    op.create_index("ix_wallet_adjustments_wallet_id", "wallet_adjustments", ["wallet_id"])
    op.create_index("ix_wallet_adjustments_date", "wallet_adjustments", ["date"])
    op.create_table(
        "wallet_transfers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_wallet_id", sa.Integer(), sa.ForeignKey("wallets.id"), nullable=False),
        sa.Column("destination_wallet_id", sa.Integer(), sa.ForeignKey("wallets.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_wallet_transfers_user_id", "wallet_transfers", ["user_id"])
    op.create_index("ix_wallet_transfers_source_wallet_id", "wallet_transfers", ["source_wallet_id"])
    op.create_index("ix_wallet_transfers_destination_wallet_id", "wallet_transfers", ["destination_wallet_id"])
    op.create_index("ix_wallet_transfers_date", "wallet_transfers", ["date"])

    op.add_column("transactions", sa.Column("wallet_id", sa.Integer(), nullable=True))
    op.create_index("ix_transactions_wallet_id", "transactions", ["wallet_id"])
    op.create_foreign_key("fk_transactions_wallet_id", "transactions", "wallets", ["wallet_id"], ["id"], ondelete="RESTRICT")
    op.add_column("recurrences", sa.Column("wallet_id", sa.Integer(), nullable=True))
    op.create_index("ix_recurrences_wallet_id", "recurrences", ["wallet_id"])
    op.create_foreign_key("fk_recurrences_wallet_id", "recurrences", "wallets", ["wallet_id"], ["id"], ondelete="RESTRICT")

    bind = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Integer()))
    balances = sa.table(
        "monthly_balance",
        sa.column("user_id", sa.Integer()),
        sa.column("year", sa.Integer()),
        sa.column("month", sa.Integer()),
        sa.column("opening_balance", sa.Numeric(10, 2)),
    )
    transactions = sa.table(
        "transactions",
        sa.column("id", sa.Integer()),
        sa.column("user_id", sa.Integer()),
        sa.column("wallet_id", sa.Integer()),
        sa.column("date", sa.Date()),
    )
    recurrences = sa.table(
        "recurrences",
        sa.column("user_id", sa.Integer()),
        sa.column("wallet_id", sa.Integer()),
    )
    wallets = sa.table(
        "wallets",
        sa.column("id", sa.Integer()),
        sa.column("user_id", sa.Integer()),
        sa.column("name", sa.String()),
        sa.column("type", sa.String()),
        sa.column("initial_balance", sa.Numeric(10, 2)),
        sa.column("tracking_started_on", sa.Date()),
        sa.column("color", sa.String()),
        sa.column("active", sa.Boolean()),
    )
    for user_id in bind.execute(sa.select(users.c.id)).scalars():
        anchor = bind.execute(
            sa.select(balances.c.year, balances.c.month, balances.c.opening_balance)
            .where(
                balances.c.user_id == user_id,
                sa.or_(
                    balances.c.year < date.today().year,
                    sa.and_(balances.c.year == date.today().year, balances.c.month <= date.today().month),
                ),
            )
            .order_by(balances.c.year.desc(), balances.c.month.desc())
            .limit(1)
        ).first()
        if anchor:
            tracking_started_on = date(int(anchor.year), int(anchor.month), 1)
            initial_balance = anchor.opening_balance or 0
        else:
            earliest = bind.execute(
                sa.select(sa.func.min(transactions.c.date)).where(transactions.c.user_id == user_id)
            ).scalar()
            tracking_started_on = earliest or date.today()
            initial_balance = 0
        result = bind.execute(wallets.insert().values(
            user_id=user_id,
            name="Carteira principal",
            type="other",
            initial_balance=initial_balance,
            tracking_started_on=tracking_started_on,
            color="#14A078",
            active=True,
        ))
        wallet_id = result.lastrowid
        bind.execute(transactions.update().where(transactions.c.user_id == user_id).values(wallet_id=wallet_id))
        bind.execute(recurrences.update().where(recurrences.c.user_id == user_id).values(wallet_id=wallet_id))


def downgrade():
    op.drop_constraint("fk_recurrences_wallet_id", "recurrences", type_="foreignkey")
    op.drop_index("ix_recurrences_wallet_id", table_name="recurrences")
    op.drop_column("recurrences", "wallet_id")
    op.drop_constraint("fk_transactions_wallet_id", "transactions", type_="foreignkey")
    op.drop_index("ix_transactions_wallet_id", table_name="transactions")
    op.drop_column("transactions", "wallet_id")
    op.drop_table("wallet_transfers")
    op.drop_table("wallet_adjustments")
    op.drop_table("wallets")
