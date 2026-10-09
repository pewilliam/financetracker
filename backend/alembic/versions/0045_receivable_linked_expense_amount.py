"""Track the part of a receivable attributed to its linked expense."""
from alembic import op
import sqlalchemy as sa


revision = "0045_receivable_expense_amount"
down_revision = "0044_analysis_preferences"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("receivables") as batch:
        batch.add_column(sa.Column("linked_expense_amount", sa.Numeric(10, 2), nullable=True))

    op.execute(
        """
        UPDATE receivables
        SET linked_expense_amount = total_amount
        WHERE source_transaction_id IS NOT NULL
           OR source_invoice_item_id IS NOT NULL
           OR source_installment_item_id IS NOT NULL
        """
    )


def downgrade():
    with op.batch_alter_table("receivables") as batch:
        batch.drop_column("linked_expense_amount")
