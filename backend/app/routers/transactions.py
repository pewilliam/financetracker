from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, Receivable, Recurrence, Transaction, User
from app.schemas.receivables import ReceivableExpenseLinkIn
from app.schemas.transactions import TransactionBatchCreate, TransactionBatchOut, TransactionCreate, TransactionOut, TransactionUpdate
from app.security import get_current_user
from app.services.categories import category_ids_from_payload, get_user_categories, set_item_categories

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _clear_expense_link(transaction: Transaction) -> None:
    transaction.linked_expense_transaction_id = None
    transaction.linked_expense_invoice_item_id = None
    transaction.linked_expense_installment_item_id = None


def _source_for_link(db: Session, user_id: int, link: ReceivableExpenseLinkIn):
    if link.source_type == "transaction":
        source = db.query(Transaction).filter(
            Transaction.id == link.source_id,
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.invoice_id.is_(None),
        ).first()
        if not source:
            raise HTTPException(status_code=404, detail="Expense transaction not found")
        return source, Receivable.source_transaction_id, Transaction.linked_expense_transaction_id, "linked_expense_transaction_id"
    if link.source_type == "invoice_item":
        source = (
            db.query(InvoiceItem)
            .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
            .filter(InvoiceItem.id == link.source_id, Invoice.user_id == user_id, InvoiceItem.amount > 0)
            .first()
        )
        if not source:
            raise HTTPException(status_code=404, detail="Invoice expense item not found")
        return source, Receivable.source_invoice_item_id, Transaction.linked_expense_invoice_item_id, "linked_expense_invoice_item_id"
    if link.source_type == "installment_item":
        source = (
            db.query(InstallmentItem)
            .join(InstallmentPurchase, InstallmentPurchase.id == InstallmentItem.purchase_id)
            .filter(
                InstallmentItem.id == link.source_id,
                InstallmentPurchase.user_id == user_id,
                InstallmentItem.status == "pending",
            )
            .first()
        )
        if not source:
            raise HTTPException(status_code=404, detail="Installment expense item not found")
        return source, Receivable.source_installment_item_id, Transaction.linked_expense_installment_item_id, "linked_expense_installment_item_id"
    raise HTTPException(status_code=400, detail="Select a specific expense or installment")


def _apply_expense_link(
    db: Session,
    user_id: int,
    transaction: Transaction,
    link: ReceivableExpenseLinkIn | None,
) -> None:
    if link is None:
        _clear_expense_link(transaction)
        return
    if transaction.type != "income":
        raise HTTPException(status_code=400, detail="Only income transactions can be linked as receivables")

    source, receivable_field, transaction_field, target_field = _source_for_link(db, user_id, link)
    receivable_total = sum(
        (_money(item.total_amount) for item in db.query(Receivable).filter(receivable_field == source.id).all()),
        Decimal("0.00"),
    )
    transaction_query = db.query(Transaction).filter(transaction_field == source.id)
    if transaction.id:
        transaction_query = transaction_query.filter(Transaction.id != transaction.id)
    transaction_total = sum((_money(item.amount) for item in transaction_query.all()), Decimal("0.00"))
    available = max(_money(source.amount) - receivable_total - transaction_total, Decimal("0.00"))
    if _money(transaction.amount) > available:
        raise HTTPException(status_code=400, detail=f"Income amount exceeds expense amount available ({available})")

    _clear_expense_link(transaction)
    setattr(transaction, target_field, source.id)


def _current_expense_link(transaction: Transaction) -> ReceivableExpenseLinkIn | None:
    if transaction.linked_expense_transaction_id:
        return ReceivableExpenseLinkIn(source_type="transaction", source_id=transaction.linked_expense_transaction_id)
    if transaction.linked_expense_invoice_item_id:
        return ReceivableExpenseLinkIn(source_type="invoice_item", source_id=transaction.linked_expense_invoice_item_id)
    if transaction.linked_expense_installment_item_id:
        return ReceivableExpenseLinkIn(source_type="installment_item", source_id=transaction.linked_expense_installment_item_id)
    return None


@router.post("", response_model=TransactionOut)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_future = payload.is_future
    if not is_future and payload.date > date.today():
        is_future = True

    if payload.invoice_id:
        invoice = (
            db.query(Invoice)
            .filter(Invoice.id == payload.invoice_id, Invoice.user_id == current_user.id)
            .first()
        )
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

    if payload.recurrence_id:
        recurrence = (
            db.query(Recurrence)
            .filter(
                Recurrence.id == payload.recurrence_id,
                Recurrence.user_id == current_user.id,
            )
            .first()
        )
        if not recurrence:
            raise HTTPException(status_code=404, detail="Recurrence not found")

    selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))

    transaction = Transaction(
        user_id=current_user.id,
        date=payload.date,
        type=payload.type,
        amount=payload.amount,
        description=payload.description,
        is_future=is_future,
        invoice_id=payload.invoice_id,
        recurrence_id=payload.recurrence_id,
        category_id=payload.category_id,
    )
    set_item_categories(transaction, selected_categories)
    db.add(transaction)
    db.flush()
    if payload.expense_link is not None:
        _apply_expense_link(db, current_user.id, transaction, payload.expense_link)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post("/batch", response_model=TransactionBatchOut)
def create_transaction_batch(
    payload: TransactionBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")
    if (payload.end_date - payload.start_date).days >= 366:
        raise HTTPException(status_code=400, detail="Batch period cannot exceed 366 days")

    normalized_rules = []
    expected_count = 0
    for rule in payload.rules:
        weekdays = set(rule.weekdays)
        if any(weekday < 0 or weekday > 6 for weekday in weekdays):
            raise HTTPException(status_code=400, detail="Weekdays must be between 0 and 6")
        normalized_rules.append((rule, weekdays))

    cursor = payload.start_date
    while cursor <= payload.end_date:
        expected_count += sum(cursor.weekday() in weekdays for _, weekdays in normalized_rules)
        cursor += timedelta(days=1)
    if expected_count == 0:
        raise HTTPException(status_code=400, detail="The selected rules do not generate any transactions")
    if expected_count > 1000:
        raise HTTPException(status_code=400, detail="A batch can create at most 1000 transactions")

    selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))
    today = date.today()
    transactions = []
    cursor = payload.start_date
    while cursor <= payload.end_date:
        for rule, weekdays in normalized_rules:
            if cursor.weekday() not in weekdays:
                continue
            transaction = Transaction(
                user_id=current_user.id,
                date=cursor,
                type=payload.type,
                amount=rule.amount,
                description=(rule.description or "").strip() or None,
                is_future=cursor > today,
                category_id=selected_categories[0].id if selected_categories else None,
            )
            set_item_categories(transaction, selected_categories)
            db.add(transaction)
            transactions.append(transaction)
        cursor += timedelta(days=1)

    try:
        db.commit()
        for transaction in transactions:
            db.refresh(transaction)
    except Exception:
        db.rollback()
        raise
    return TransactionBatchOut(created_count=len(transactions), transactions=transactions)


@router.put("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    data = payload.model_dump(exclude_unset=True)
    expense_link_set = "expense_link" in data
    data.pop("expense_link", None)
    selected_category_ids = category_ids_from_payload(payload)
    data.pop("category_ids", None)
    data.pop("category_id", None)
    for field, value in data.items():
        setattr(transaction, field, value)

    if payload.invoice_id:
        invoice = (
            db.query(Invoice)
            .filter(Invoice.id == payload.invoice_id, Invoice.user_id == current_user.id)
            .first()
        )
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

    if payload.recurrence_id:
        recurrence = (
            db.query(Recurrence)
            .filter(
                Recurrence.id == payload.recurrence_id,
                Recurrence.user_id == current_user.id,
            )
            .first()
        )
        if not recurrence:
            raise HTTPException(status_code=404, detail="Recurrence not found")

    if selected_category_ids is not None:
        set_item_categories(
            transaction,
            get_user_categories(db, current_user.id, selected_category_ids),
        )

    if payload.date and transaction.is_future is False and payload.date > date.today():
        transaction.is_future = True

    if expense_link_set:
        _apply_expense_link(db, current_user.id, transaction, payload.expense_link)
    elif transaction.type != "income":
        _clear_expense_link(transaction)
    else:
        current_link = _current_expense_link(transaction)
        if current_link:
            _apply_expense_link(db, current_user.id, transaction, current_link)

    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if transaction.invoice_id:
        invoice = (
            db.query(Invoice)
            .filter(Invoice.id == transaction.invoice_id, Invoice.user_id == current_user.id)
            .first()
        )
        if invoice and invoice.linked_transaction_id == transaction.id:
            invoice.linked_transaction_id = None

    db.delete(transaction)
    db.commit()
    return {"status": "deleted"}
