"""Split receivable people

Revision ID: 0009_receivable_people
Revises: 0008_receivables
Create Date: 2026-04-29

"""
from alembic import op
import sqlalchemy as sa

revision = "0009_receivable_people"
down_revision = "0008_receivables"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "receivable_people",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_receivable_people_user"),
        sa.UniqueConstraint("user_id", "name", name="uq_receivable_people_user_name"),
    )
    op.create_index("ix_receivable_people_user_id", "receivable_people", ["user_id"], unique=False)

    op.execute(
        """
        INSERT INTO receivable_people (user_id, name, created_at, updated_at)
        SELECT user_id, person_name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM receivables
        GROUP BY user_id, person_name
        """
    )

    op.add_column("receivables", sa.Column("person_id", sa.Integer(), nullable=True))
    op.create_index("ix_receivables_person_id", "receivables", ["person_id"], unique=False)
    op.execute(
        """
        UPDATE receivables r
        JOIN receivable_people p
          ON p.user_id = r.user_id
         AND p.name = r.person_name
        SET r.person_id = p.id
        """
    )
    op.alter_column("receivables", "person_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key("fk_receivables_person", "receivables", "receivable_people", ["person_id"], ["id"])
    op.drop_column("receivables", "person_name")


def downgrade():
    op.add_column("receivables", sa.Column("person_name", sa.String(length=255), nullable=True))
    op.execute(
        """
        UPDATE receivables r
        JOIN receivable_people p ON p.id = r.person_id
        SET r.person_name = p.name
        """
    )
    op.alter_column("receivables", "person_name", existing_type=sa.String(length=255), nullable=False)
    op.drop_constraint("fk_receivables_person", "receivables", type_="foreignkey")
    op.drop_index("ix_receivables_person_id", table_name="receivables")
    op.drop_column("receivables", "person_id")
    op.drop_index("ix_receivable_people_user_id", table_name="receivable_people")
    op.drop_table("receivable_people")
