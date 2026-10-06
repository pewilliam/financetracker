"""Link desired products to user categories and retain imported identifiers."""
from alembic import op
import sqlalchemy as sa

revision = "0040_product_import"
down_revision = "0039_desired_products"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("desired_products") as batch:
        batch.add_column(sa.Column("category_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("ean", sa.String(14), nullable=True))
        batch.add_column(sa.Column("source_url", sa.String(2048), nullable=True))
        batch.create_index("ix_desired_products_category_id", ["category_id"])
        batch.create_foreign_key("fk_desired_products_category", "categories", ["category_id"], ["id"], ondelete="SET NULL")
    # Match legacy labels only within the owner's category list. Unmatched labels
    # remain available for editing; do not create financial categories implicitly.
    op.execute(sa.text("""UPDATE desired_products SET category_id = (
        SELECT MIN(categories.id) FROM categories
        WHERE categories.user_id = desired_products.user_id
        AND LOWER(categories.name) = LOWER(desired_products.category)
    ) WHERE category IS NOT NULL"""))


def downgrade():
    with op.batch_alter_table("desired_products") as batch:
        batch.drop_constraint("fk_desired_products_category", type_="foreignkey")
        batch.drop_index("ix_desired_products_category_id")
        batch.drop_column("source_url")
        batch.drop_column("ean")
        batch.drop_column("category_id")
