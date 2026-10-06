"""Align the latest offer snapshot with the user-provided price date."""
from alembic import op
import sqlalchemy as sa


revision = "0043_fix_offer_history_dates"
down_revision = "0042_product_media_frame"
branch_labels = None
depends_on = None


def upgrade():
    dialect = op.get_bind().dialect.name
    if dialect == "mysql":
        op.execute(sa.text("""
            UPDATE offer_price_history AS history
            JOIN (
                SELECT offer_id, MAX(id) AS history_id
                FROM offer_price_history
                GROUP BY offer_id
            ) AS latest ON latest.history_id = history.id
            JOIN product_offers AS offer ON offer.id = history.offer_id
            SET history.recorded_at = offer.recorded_at
            WHERE history.recorded_at <> offer.recorded_at
        """))
        return

    op.execute(sa.text("""
        UPDATE offer_price_history
        SET recorded_at = (
            SELECT product_offers.recorded_at
            FROM product_offers
            WHERE product_offers.id = offer_price_history.offer_id
        )
        WHERE id IN (
            SELECT latest.history_id
            FROM (
                SELECT MAX(id) AS history_id
                FROM offer_price_history
                GROUP BY offer_id
            ) AS latest
        )
    """))


def downgrade():
    pass
