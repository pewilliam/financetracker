"""Store direct product media URLs without downloading remote files."""
from alembic import op
import sqlalchemy as sa

revision = "0041_product_media"
down_revision = "0040_product_import"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("desired_products") as batch:
        batch.add_column(sa.Column("media_url", sa.String(2048), nullable=True))
        batch.add_column(sa.Column("media_type", sa.String(10), nullable=False, server_default="image"))


def downgrade():
    with op.batch_alter_table("desired_products") as batch:
        batch.drop_column("media_type")
        batch.drop_column("media_url")
