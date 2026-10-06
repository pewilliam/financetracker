"""Persist product media framing without changing existing media."""
from alembic import op
import sqlalchemy as sa

revision = "0042_product_media_frame"
down_revision = "0041_product_media"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("desired_products") as batch:
        batch.add_column(sa.Column("media_frame", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("desired_products") as batch:
        batch.drop_column("media_frame")
