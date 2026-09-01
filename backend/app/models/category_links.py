from sqlalchemy import Column, ForeignKey, Integer, Table, UniqueConstraint

from app.database import Base


def _category_link_table(name: str, owner_table: str, owner_column: str):
    return Table(
        name,
        Base.metadata,
        Column(owner_column, Integer, ForeignKey(f"{owner_table}.id", ondelete="CASCADE"), primary_key=True),
        Column("category_id", Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
        UniqueConstraint(owner_column, "category_id", name=f"uq_{name}_owner_category"),
    )


transaction_categories = _category_link_table(
    "transaction_categories", "transactions", "transaction_id"
)
invoice_item_categories = _category_link_table(
    "invoice_item_categories", "invoice_items", "invoice_item_id"
)
installment_purchase_categories = _category_link_table(
    "installment_purchase_categories", "installment_purchases", "installment_purchase_id"
)
recurrence_categories = _category_link_table(
    "recurrence_categories", "recurrences", "recurrence_id"
)
receivable_categories = _category_link_table(
    "receivable_categories", "receivables", "receivable_id"
)
