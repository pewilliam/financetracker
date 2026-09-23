"""Evolve invoice templates into credit cards.

Revision ID: 0033_credit_cards
Revises: 0032_primary_wallet
"""
import logging

from alembic import op
import sqlalchemy as sa


revision = "0033_credit_cards"
down_revision = "0032_primary_wallet"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")


def _count(connection, table: str) -> int:
    return int(connection.execute(sa.text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0)


def _exists(connection, sql: str, **params) -> bool:
    return bool(connection.execute(sa.text(sql), params).scalar())


def _has_table(connection, name: str) -> bool:
    return _exists(
        connection,
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = :name",
        name=name,
    )


def _has_index(connection, table: str, name: str) -> bool:
    return _exists(
        connection,
        "SELECT COUNT(*) FROM information_schema.statistics "
        "WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :name",
        table=table,
        name=name,
    )


def _has_constraint(connection, table: str, name: str) -> bool:
    return _exists(
        connection,
        "SELECT COUNT(*) FROM information_schema.table_constraints "
        "WHERE table_schema = DATABASE() AND table_name = :table AND constraint_name = :name",
        table=table,
        name=name,
    )


def upgrade():
    connection = op.get_bind()
    template_table = "invoice_templates" if _has_table(connection, "invoice_templates") else "credit_cards"
    before = {
        "templates": _count(connection, template_table),
        "invoices": _count(connection, "invoices"),
        "invoice_items": _count(connection, "invoice_items"),
        "installment_items": _count(connection, "installment_items"),
        "installment_purchases": _count(connection, "installment_purchases"),
    }
    log.info("credit card migration starting with counts %s", before)

    if _has_table(connection, "invoice_templates"):
        op.rename_table("invoice_templates", "credit_cards")
    if _has_constraint(connection, "credit_cards", "fk_invoice_templates_user"):
        op.drop_constraint("fk_invoice_templates_user", "credit_cards", type_="foreignkey")
    if _has_index(connection, "credit_cards", "ix_invoice_templates_user_id"):
        op.drop_index("ix_invoice_templates_user_id", table_name="credit_cards")
    if not _has_index(connection, "credit_cards", "ix_credit_cards_user_id"):
        op.create_index("ix_credit_cards_user_id", "credit_cards", ["user_id"])
    if not _has_constraint(connection, "credit_cards", "fk_credit_cards_user"):
        op.create_foreign_key("fk_credit_cards_user", "credit_cards", "users", ["user_id"], ["id"])

    op.alter_column(
        "credit_cards",
        "default_due_day",
        new_column_name="due_day",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.add_column("credit_cards", sa.Column("closing_day", sa.Integer(), nullable=True))
    op.add_column("credit_cards", sa.Column("credit_limit", sa.Numeric(10, 2), nullable=True))
    op.add_column("credit_cards", sa.Column("institution", sa.String(length=255), nullable=True))
    op.add_column("credit_cards", sa.Column("default_wallet_id", sa.Integer(), nullable=True))
    op.create_index("ix_credit_cards_default_wallet_id", "credit_cards", ["default_wallet_id"])
    op.create_foreign_key(
        "fk_credit_cards_default_wallet",
        "credit_cards",
        "wallets",
        ["default_wallet_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(sa.text(
        "UPDATE credit_cards SET closing_day = CASE "
        "WHEN due_day - 7 >= 1 THEN due_day - 7 ELSE due_day - 7 + 30 END"
    ))
    op.alter_column("credit_cards", "closing_day", existing_type=sa.Integer(), nullable=False)

    op.drop_constraint("fk_invoices_template", "invoices", type_="foreignkey")
    op.drop_index("ix_invoices_template_id", table_name="invoices")
    op.alter_column(
        "invoices",
        "template_id",
        new_column_name="credit_card_id",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.create_index("ix_invoices_credit_card_id", "invoices", ["credit_card_id"])
    op.create_foreign_key("fk_invoices_credit_card", "invoices", "credit_cards", ["credit_card_id"], ["id"])

    duplicates = connection.execute(sa.text(
        "SELECT credit_card_id, due_date, COUNT(*) AS cycle_count "
        "FROM invoices GROUP BY credit_card_id, due_date HAVING COUNT(*) > 1"
    )).fetchall()
    if duplicates:
        sample = ", ".join(f"card {row[0]} due {row[1]} x{row[2]}" for row in duplicates[:8])
        raise RuntimeError(f"Cannot add uq_invoices_card_due; duplicate invoice cycles: {sample}")
    op.create_unique_constraint("uq_invoices_card_due", "invoices", ["credit_card_id", "due_date"])

    op.add_column("invoice_items", sa.Column("purchase_date", sa.Date(), nullable=True))
    op.execute(sa.text(
        "UPDATE invoice_items ii "
        "JOIN invoices i ON i.id = ii.invoice_id "
        "SET ii.purchase_date = i.due_date"
    ))

    missing_cards = int(connection.execute(sa.text(
        "SELECT COUNT(*) FROM invoices WHERE credit_card_id IS NULL"
    )).scalar() or 0)
    if missing_cards:
        raise RuntimeError(f"Invoices left without a credit card: {missing_cards}")

    after = {
        "cards": _count(connection, "credit_cards"),
        "invoices": _count(connection, "invoices"),
        "invoice_items": _count(connection, "invoice_items"),
        "installment_items": _count(connection, "installment_items"),
        "installment_purchases": _count(connection, "installment_purchases"),
    }
    log.info("credit card migration finished with counts %s", after)
    if after["cards"] != before["templates"]:
        raise RuntimeError(f"Credit card count {after['cards']} does not match template count {before['templates']}")
    for key in ("invoices", "invoice_items", "installment_items", "installment_purchases"):
        if after[key] < before[key]:
            raise RuntimeError(f"{key} dropped from {before[key]} to {after[key]}")


def downgrade():
    op.drop_column("invoice_items", "purchase_date")
    op.drop_constraint("uq_invoices_card_due", "invoices", type_="unique")
    op.drop_constraint("fk_invoices_credit_card", "invoices", type_="foreignkey")
    op.drop_index("ix_invoices_credit_card_id", table_name="invoices")
    op.alter_column(
        "invoices",
        "credit_card_id",
        new_column_name="template_id",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.create_index("ix_invoices_template_id", "invoices", ["template_id"])
    op.create_foreign_key("fk_invoices_template", "invoices", "credit_cards", ["template_id"], ["id"])

    op.drop_constraint("fk_credit_cards_default_wallet", "credit_cards", type_="foreignkey")
    op.drop_index("ix_credit_cards_default_wallet_id", table_name="credit_cards")
    op.drop_column("credit_cards", "default_wallet_id")
    op.drop_column("credit_cards", "institution")
    op.drop_column("credit_cards", "credit_limit")
    op.drop_column("credit_cards", "closing_day")
    op.alter_column(
        "credit_cards",
        "due_day",
        new_column_name="default_due_day",
        existing_type=sa.Integer(),
        existing_nullable=False,
    )
    op.drop_constraint("fk_credit_cards_user", "credit_cards", type_="foreignkey")
    op.drop_index("ix_credit_cards_user_id", table_name="credit_cards")
    op.create_index("ix_invoice_templates_user_id", "credit_cards", ["user_id"])
    op.create_foreign_key("fk_invoice_templates_user", "credit_cards", "users", ["user_id"], ["id"])
    op.rename_table("credit_cards", "invoice_templates")
