"""Split invoice templates from monthly invoices

Revision ID: 0007_invoice_templates
Revises: 0006_invoice_color
Create Date: 2026-04-28

"""
from alembic import op
import sqlalchemy as sa

revision = "0007_invoice_templates"
down_revision = "0006_invoice_color"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "invoice_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False, server_default="#3B82F6"),
        sa.Column("default_due_day", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_invoice_templates_user"),
    )
    op.create_index("ix_invoice_templates_user_id", "invoice_templates", ["user_id"], unique=False)

    op.add_column("invoices", sa.Column("template_id", sa.Integer(), nullable=True))
    op.create_index("ix_invoices_template_id", "invoices", ["template_id"], unique=False)

    op.execute(
        """
        INSERT INTO invoice_templates (user_id, name, color, default_due_day, active, created_at)
        SELECT
            user_id,
            name,
            COALESCE(color, '#3B82F6') AS color,
            DAY(MIN(due_date)) AS default_due_day,
            1 AS active,
            CURRENT_TIMESTAMP
        FROM invoices
        GROUP BY user_id, name, COALESCE(color, '#3B82F6')
        """
    )
    op.execute(
        """
        UPDATE invoices i
        JOIN invoice_templates t
          ON t.user_id = i.user_id
         AND t.name = i.name
         AND t.color = COALESCE(i.color, '#3B82F6')
        SET i.template_id = t.id
        """
    )

    op.alter_column("invoices", "template_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key("fk_invoices_template", "invoices", "invoice_templates", ["template_id"], ["id"])
    op.drop_column("invoices", "color")
    op.drop_column("invoices", "name")


def downgrade():
    op.add_column("invoices", sa.Column("name", sa.String(length=255), nullable=True))
    op.add_column("invoices", sa.Column("color", sa.String(length=20), nullable=True, server_default="#3B82F6"))
    op.execute(
        """
        UPDATE invoices i
        JOIN invoice_templates t ON t.id = i.template_id
        SET i.name = t.name,
            i.color = t.color
        """
    )
    op.alter_column("invoices", "name", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("invoices", "color", existing_type=sa.String(length=20), nullable=False)
    op.drop_constraint("fk_invoices_template", "invoices", type_="foreignkey")
    op.drop_index("ix_invoices_template_id", table_name="invoices")
    op.drop_column("invoices", "template_id")
    op.drop_index("ix_invoice_templates_user_id", table_name="invoice_templates")
    op.drop_table("invoice_templates")
