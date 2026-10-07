"""Persist the selected offer and first payment date for purchase analysis."""
from alembic import op
import sqlalchemy as sa


revision = "0044_analysis_preferences"
down_revision = "0043_fix_offer_history_dates"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("desired_products") as batch:
        batch.add_column(sa.Column("analysis_offer_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("analysis_first_payment_date", sa.Date(), nullable=True))


def downgrade():
    with op.batch_alter_table("desired_products") as batch:
        batch.drop_column("analysis_first_payment_date")
        batch.drop_column("analysis_offer_id")
