from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, Receivable, ReceivablePayment, ReceivablePerson, Transaction, User
from app.schemas.receivables import (
    ExpenseOptionOut,
    ReceivableCreate,
    ReceivableExpenseLinkIn,
    ReceivableOut,
    ReceivablePaidPayload,
    ReceivablePaymentCreate,
    ReceivablePersonCreate,
    ReceivablePersonOut,
    ReceivableUpdate,
)
from app.schemas.transactions import TransactionOut
from app.security import get_current_user
from app.services.categories import category_ids_from_payload, get_user_categories, set_item_categories

router = APIRouter(prefix="/api/receivables", tags=["receivables"])


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _status_for(receivable: Receivable) -> str:
    total = _money(receivable.total_amount)
    received = _money(receivable.received_amount)
    if received >= total:
        return "paid"
    if received > 0:
        return "partial"
    if receivable.due_date < date.today():
        return "overdue"
    return "pending"


def _sync_status(receivable: Receivable) -> None:
    receivable.status = _status_for(receivable)
    if receivable.status != "paid":
        receivable.paid_at = None


def _load_receivable(db: Session, receivable_id: int, user_id: int) -> Receivable:
    receivable = (
        db.query(Receivable)
        .options(
            selectinload(Receivable.person),
            selectinload(Receivable.payments),
            selectinload(Receivable.source_transaction),
            selectinload(Receivable.source_invoice_item).selectinload(InvoiceItem.invoice).selectinload(Invoice.template),
            selectinload(Receivable.source_installment_item).selectinload(InstallmentItem.purchase),
            selectinload(Receivable.source_installment_item).selectinload(InstallmentItem.invoice).selectinload(Invoice.template),
        )
        .filter(Receivable.id == receivable_id, Receivable.user_id == user_id)
        .first()
    )
    if not receivable:
        raise HTTPException(status_code=404, detail="Receivable not found")
    return receivable


def _receivable_load_options():
    return (
        selectinload(Receivable.person),
        selectinload(Receivable.categories),
        selectinload(Receivable.payments),
        selectinload(Receivable.source_transaction),
        selectinload(Receivable.source_invoice_item).selectinload(InvoiceItem.invoice).selectinload(Invoice.template),
        selectinload(Receivable.source_installment_item).selectinload(InstallmentItem.purchase),
        selectinload(Receivable.source_installment_item).selectinload(InstallmentItem.invoice).selectinload(Invoice.template),
    )


def _clear_expense_link(receivable: Receivable) -> None:
    receivable.source_transaction_id = None
    receivable.source_invoice_item_id = None
    receivable.source_installment_item_id = None


def _set_expense_source(receivable: Receivable, source_type: str, source_id: int) -> None:
    _clear_expense_link(receivable)
    if source_type == "transaction":
        receivable.source_transaction_id = source_id
    elif source_type == "invoice_item":
        receivable.source_invoice_item_id = source_id
    elif source_type == "installment_item":
        receivable.source_installment_item_id = source_id


def _linked_amount(db: Session, field, source_id: int, exclude_id: int | None = None) -> Decimal:
    query = db.query(Receivable).filter(field == source_id)
    if exclude_id:
        query = query.filter(Receivable.id != exclude_id)
    total = sum((_money(item.total_amount) for item in query.all()), Decimal("0.00"))
    transaction_field = {
        "source_transaction_id": Transaction.linked_expense_transaction_id,
        "source_invoice_item_id": Transaction.linked_expense_invoice_item_id,
        "source_installment_item_id": Transaction.linked_expense_installment_item_id,
    }.get(field.key)
    if transaction_field is not None:
        total += sum(
            (_money(item.amount) for item in db.query(Transaction).filter(transaction_field == source_id).all()),
            Decimal("0.00"),
        )
    return total


def _validate_source_amount(
    db: Session,
    field,
    source_id: int,
    source_amount,
    requested_amount: Decimal,
    exclude_id: int | None = None,
) -> None:
    available = max(_money(source_amount) - _linked_amount(db, field, source_id, exclude_id), Decimal("0.00"))
    if requested_amount > available:
        raise HTTPException(status_code=400, detail=f"Receivable amount exceeds expense amount available ({available})")


def _single_source(db: Session, user_id: int, link: ReceivableExpenseLinkIn):
    if link.source_type == "transaction":
        source = db.query(Transaction).filter(
            Transaction.id == link.source_id,
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.invoice_id.is_(None),
        ).first()
        if not source:
            raise HTTPException(status_code=404, detail="Expense transaction not found")
        return "transaction", source, source.date, Receivable.source_transaction_id

    if link.source_type == "invoice_item":
        source = (
            db.query(InvoiceItem)
            .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
            .filter(InvoiceItem.id == link.source_id, Invoice.user_id == user_id, InvoiceItem.amount > 0)
            .first()
        )
        if not source:
            raise HTTPException(status_code=404, detail="Invoice expense item not found")
        return "invoice_item", source, source.invoice.due_date, Receivable.source_invoice_item_id

    if link.source_type == "installment_item" and link.installment_scope == "single":
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
        due_date = source.invoice.due_date if source.invoice else date.today()
        return "installment_item", source, due_date, Receivable.source_installment_item_id

    return None


def _installment_sources(db: Session, user_id: int, link: ReceivableExpenseLinkIn) -> list[InstallmentItem]:
    start_number = 1
    if link.source_type == "installment_purchase":
        purchase = db.query(InstallmentPurchase).filter(
            InstallmentPurchase.id == link.source_id,
            InstallmentPurchase.user_id == user_id,
        ).first()
    elif link.source_type == "installment_item":
        selected = (
            db.query(InstallmentItem)
            .join(InstallmentPurchase, InstallmentPurchase.id == InstallmentItem.purchase_id)
            .filter(InstallmentItem.id == link.source_id, InstallmentPurchase.user_id == user_id)
            .first()
        )
        if not selected:
            raise HTTPException(status_code=404, detail="Installment expense item not found")
        purchase = selected.purchase
        start_number = selected.installment_number if link.installment_scope == "remaining" else 1
    else:
        return []

    if not purchase:
        raise HTTPException(status_code=404, detail="Installment purchase not found")
    items = [
        item for item in purchase.items
        if item.status == "pending" and item.invoice_id and item.installment_number >= start_number
    ]
    items.sort(key=lambda item: item.installment_number)
    if not items:
        raise HTTPException(status_code=400, detail="Installment purchase has no payable installments")
    return items


def _allocate_installments(total: Decimal, items: list[InstallmentItem], mode: str) -> list[Decimal]:
    if mode == "per_installment":
        return [_money(total) for _ in items]
    source_total = sum((_money(item.amount) for item in items), Decimal("0.00"))
    if source_total <= 0:
        raise HTTPException(status_code=400, detail="Installment purchase amount must be greater than zero")
    allocated = []
    running = Decimal("0.00")
    for index, item in enumerate(items):
        amount = _money(total - running) if index == len(items) - 1 else _money(total * _money(item.amount) / source_total)
        allocated.append(amount)
        running += amount
    return allocated


def _apply_expense_link(
    db: Session,
    user_id: int,
    receivable: Receivable,
    link: ReceivableExpenseLinkIn | None,
) -> list[Receivable]:
    if link is None:
        _clear_expense_link(receivable)
        receivable.series_id = None
        receivable.series_installment_number = None
        receivable.series_installment_count = None
        return []

    single = _single_source(db, user_id, link)
    if single:
        source_type, source, due_date, field = single
        amount = _money(receivable.total_amount)
        _validate_source_amount(db, field, source.id, source.amount, amount, receivable.id)
        stays_in_series = source_type == "installment_item" and receivable.source_installment_item_id == source.id and receivable.series_id
        if not stays_in_series:
            receivable.series_id = None
            receivable.series_installment_number = None
            receivable.series_installment_count = None
        _set_expense_source(receivable, source_type, source.id)
        receivable.due_date = due_date
        return []

    items = _installment_sources(db, user_id, link)
    allocations = _allocate_installments(_money(receivable.total_amount), items, link.allocation_mode)
    for item, amount in zip(items, allocations):
        _validate_source_amount(
            db,
            Receivable.source_installment_item_id,
            item.id,
            item.amount,
            amount,
            receivable.id if receivable.source_installment_item_id == item.id else None,
        )
    if _money(receivable.received_amount) > allocations[0]:
        raise HTTPException(status_code=400, detail="First installment amount cannot be lower than amount already received")

    series_id = receivable.series_id or str(uuid4())
    count = len(items)
    first_item = items[0]
    receivable.total_amount = allocations[0]
    receivable.due_date = first_item.invoice.due_date
    receivable.series_id = series_id if count > 1 else None
    receivable.series_installment_number = 1 if count > 1 else None
    receivable.series_installment_count = count if count > 1 else None
    _set_expense_source(receivable, "installment_item", first_item.id)

    created = []
    for index, (item, amount) in enumerate(zip(items[1:], allocations[1:]), start=2):
        sibling = Receivable(
            user_id=user_id,
            person_id=receivable.person_id,
            description=receivable.description,
            total_amount=amount,
            received_amount=Decimal("0.00"),
            due_date=item.invoice.due_date,
            notes=receivable.notes,
            category_id=receivable.category_id,
            series_id=series_id,
            series_installment_number=index,
            series_installment_count=count,
            source_installment_item_id=item.id,
        )
        set_item_categories(sibling, list(receivable.categories))
        _sync_status(sibling)
        db.add(sibling)
        created.append(sibling)
    return created


def _load_person(db: Session, person_id: int, user_id: int) -> ReceivablePerson:
    person = (
        db.query(ReceivablePerson)
        .filter(ReceivablePerson.id == person_id, ReceivablePerson.user_id == user_id)
        .first()
    )
    if not person:
        raise HTTPException(status_code=404, detail="Receivable person not found")
    return person


def _person_by_name(db: Session, user_id: int, name: str) -> ReceivablePerson | None:
    return (
        db.query(ReceivablePerson)
        .filter(ReceivablePerson.user_id == user_id, ReceivablePerson.name == name)
        .first()
    )


def _person_for_payload(db: Session, user_id: int, person_id: int | None, person_name: str | None) -> ReceivablePerson:
    if person_id:
        return _load_person(db, person_id, user_id)

    name = (person_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Person is required")

    person = _person_by_name(db, user_id, name)
    if person:
        return person

    person = ReceivablePerson(user_id=user_id, name=name)
    db.add(person)
    db.flush()
    return person


def _set_receivable_categories(db: Session, user_id: int, receivable: Receivable, category_ids: list[int]) -> None:
    categories = get_user_categories(db, user_id, category_ids)
    set_item_categories(receivable, categories)
    transaction_ids = [payment.transaction_id for payment in receivable.payments if payment.transaction_id]
    if transaction_ids:
        transactions = db.query(Transaction).filter(
            Transaction.id.in_(transaction_ids),
            Transaction.user_id == user_id,
        ).all()
        for transaction in transactions:
            set_item_categories(transaction, categories)


def _create_income_transaction(db: Session, user_id: int, receivable: Receivable, amount: Decimal, paid_at: date) -> Transaction:
    transaction = Transaction(
        user_id=user_id,
        date=paid_at,
        type="income",
        amount=amount,
        description=f"Recebimento - {receivable.person_name}: {receivable.description}",
        is_future=False,
        category_id=receivable.category_id,
    )
    set_item_categories(transaction, list(receivable.categories))
    db.add(transaction)
    db.flush()
    return transaction


def _register_payment(
    db: Session,
    user_id: int,
    receivable: Receivable,
    amount: Decimal,
    paid_at: date,
    category_ids: list[int],
) -> Receivable:
    if paid_at > date.today():
        raise HTTPException(status_code=400, detail="Payment date cannot be in the future")

    _sync_status(receivable)
    if receivable.status == "paid":
        raise HTTPException(status_code=400, detail="Receivable already paid")

    payment_amount = _money(amount)
    remaining = _money(receivable.total_amount) - _money(receivable.received_amount)
    if payment_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    if payment_amount > remaining:
        raise HTTPException(status_code=400, detail="Payment amount exceeds remaining amount")

    _set_receivable_categories(db, user_id, receivable, category_ids)

    transaction = _create_income_transaction(db, user_id, receivable, payment_amount, paid_at)
    payment = ReceivablePayment(
        receivable_id=receivable.id,
        transaction_id=transaction.id,
        amount=payment_amount,
        paid_at=paid_at,
    )
    db.add(payment)
    receivable.received_amount = _money(receivable.received_amount) + payment_amount

    if _money(receivable.received_amount) >= _money(receivable.total_amount):
        receivable.received_amount = _money(receivable.total_amount)
        receivable.status = "paid"
        receivable.paid_at = paid_at
    else:
        _sync_status(receivable)

    db.commit()
    return _load_receivable(db, receivable.id, user_id)


@router.get("", response_model=list[ReceivableOut])
def list_receivables(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivables = (
        db.query(Receivable)
        .options(*_receivable_load_options())
        .filter(Receivable.user_id == current_user.id)
        .order_by(Receivable.due_date, Receivable.id)
        .all()
    )
    changed = False
    for receivable in receivables:
        previous = receivable.status
        _sync_status(receivable)
        changed = changed or previous != receivable.status
    if changed:
        db.commit()

    if status:
        receivables = [receivable for receivable in receivables if receivable.status == status]
    return receivables


@router.get("/expense-options", response_model=list[ExpenseOptionOut])
def list_receivable_expense_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    linked = db.query(Receivable).filter(Receivable.user_id == current_user.id).all()
    linked_transactions = db.query(Transaction).filter(Transaction.user_id == current_user.id, Transaction.type == "income").all()

    def allocation(field_name: str, transaction_field_name: str, source_id: int):
        matches = [item for item in linked if getattr(item, field_name) == source_id]
        transaction_matches = [item for item in linked_transactions if getattr(item, transaction_field_name) == source_id]
        linked_amount = sum((_money(item.total_amount) for item in matches), Decimal("0.00"))
        linked_amount += sum((_money(item.amount) for item in transaction_matches), Decimal("0.00"))
        return linked_amount, [item.id for item in matches], [item.id for item in transaction_matches]

    result = []
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == "expense",
            Transaction.invoice_id.is_(None),
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .all()
    )
    for item in transactions:
        linked_amount, receivable_ids, transaction_ids = allocation("source_transaction_id", "linked_expense_transaction_id", item.id)
        result.append(ExpenseOptionOut(
            source_type="transaction",
            source_id=item.id,
            description=item.description or "Gasto sem descrição",
            amount=_money(item.amount),
            available_amount=max(_money(item.amount) - linked_amount, Decimal("0.00")),
            linked_amount=linked_amount,
            receivable_ids=receivable_ids,
            transaction_ids=transaction_ids,
            date=item.date,
            origin="months",
            category_id=item.category_id,
            category_ids=item.category_ids,
            categories=item.categories,
        ))

    invoice_items = (
        db.query(InvoiceItem)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .options(selectinload(InvoiceItem.invoice).selectinload(Invoice.template))
        .filter(Invoice.user_id == current_user.id, InvoiceItem.amount > 0)
        .order_by(Invoice.due_date.desc(), InvoiceItem.id.desc())
        .all()
    )
    for item in invoice_items:
        linked_amount, receivable_ids, transaction_ids = allocation("source_invoice_item_id", "linked_expense_invoice_item_id", item.id)
        result.append(ExpenseOptionOut(
            source_type="invoice_item",
            source_id=item.id,
            description=item.description,
            amount=_money(item.amount),
            available_amount=max(_money(item.amount) - linked_amount, Decimal("0.00")),
            linked_amount=linked_amount,
            receivable_ids=receivable_ids,
            transaction_ids=transaction_ids,
            date=item.invoice.due_date,
            origin="invoice",
            invoice_name=item.invoice.name,
            category_id=item.category_id,
            category_ids=item.category_ids,
            categories=item.categories,
        ))

    purchases = (
        db.query(InstallmentPurchase)
        .options(
            selectinload(InstallmentPurchase.items).selectinload(InstallmentItem.invoice).selectinload(Invoice.template)
        )
        .filter(InstallmentPurchase.user_id == current_user.id)
        .order_by(InstallmentPurchase.id.desc())
        .all()
    )
    for purchase in purchases:
        items = sorted(
            [item for item in purchase.items if item.status == "pending" and item.invoice_id],
            key=lambda item: item.installment_number,
        )
        if not items:
            continue
        purchase_amount = sum((_money(item.amount) for item in items), Decimal("0.00"))
        purchase_linked = Decimal("0.00")
        purchase_receivable_ids = []
        purchase_transaction_ids = []
        for item in items:
            linked_amount, receivable_ids, transaction_ids = allocation("source_installment_item_id", "linked_expense_installment_item_id", item.id)
            purchase_linked += linked_amount
            purchase_receivable_ids.extend(receivable_ids)
            purchase_transaction_ids.extend(transaction_ids)
            result.append(ExpenseOptionOut(
                source_type="installment_item",
                source_id=item.id,
                description=purchase.description,
                amount=_money(item.amount),
                available_amount=max(_money(item.amount) - linked_amount, Decimal("0.00")),
                linked_amount=linked_amount,
                receivable_ids=receivable_ids,
                transaction_ids=transaction_ids,
                date=item.invoice.due_date,
                origin="invoice",
                invoice_name=item.invoice.name,
                purchase_id=purchase.id,
                installment_number=item.installment_number,
                installment_count=purchase.installment_count,
                category_id=purchase.category_id,
                category_ids=purchase.category_ids,
                categories=purchase.categories,
            ))
        result.append(ExpenseOptionOut(
            source_type="installment_purchase",
            source_id=purchase.id,
            description=purchase.description,
            amount=purchase_amount,
            available_amount=max(purchase_amount - purchase_linked, Decimal("0.00")),
            linked_amount=purchase_linked,
            receivable_ids=sorted(set(purchase_receivable_ids)),
            transaction_ids=sorted(set(purchase_transaction_ids)),
            date=items[0].invoice.due_date,
            origin="invoice",
            invoice_name=items[0].invoice.name,
            purchase_id=purchase.id,
            installment_count=len(items),
            category_id=purchase.category_id,
            category_ids=purchase.category_ids,
            categories=purchase.categories,
        ))
    return result


@router.get("/linked-transactions", response_model=list[TransactionOut])
def list_linked_receivable_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == "income",
            or_(
                Transaction.linked_expense_transaction_id.is_not(None),
                Transaction.linked_expense_invoice_item_id.is_not(None),
                Transaction.linked_expense_installment_item_id.is_not(None),
            ),
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )


@router.get("/people", response_model=list[ReceivablePersonOut])
def list_receivable_people(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ReceivablePerson)
        .filter(ReceivablePerson.user_id == current_user.id)
        .order_by(ReceivablePerson.name)
        .all()
    )


@router.post("/people", response_model=ReceivablePersonOut)
def create_receivable_person(
    payload: ReceivablePersonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Person name is required")

    person = _person_by_name(db, current_user.id, name)
    if person:
        return person

    person = ReceivablePerson(user_id=current_user.id, name=name)
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.post("", response_model=ReceivableOut)
def create_receivable(
    payload: ReceivableCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))
    person = _person_for_payload(db, current_user.id, payload.person_id, payload.person_name)
    receivable = Receivable(
        user_id=current_user.id,
        person_id=person.id,
        description=payload.description.strip(),
        total_amount=_money(payload.total_amount),
        received_amount=Decimal("0.00"),
        due_date=payload.due_date,
        notes=payload.notes.strip() if payload.notes else None,
        category_id=payload.category_id,
    )
    set_item_categories(receivable, selected_categories)
    if not receivable.description:
        raise HTTPException(status_code=400, detail="Description is required")

    _sync_status(receivable)
    db.add(receivable)
    db.flush()
    if payload.expense_link is not None:
        _apply_expense_link(db, current_user.id, receivable, payload.expense_link)
    db.commit()
    return _load_receivable(db, receivable.id, current_user.id)


@router.put("/{receivable_id}", response_model=ReceivableOut)
def update_receivable(
    receivable_id: int,
    payload: ReceivableUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    data = payload.model_dump(exclude_unset=True)

    if "person_id" in data or "person_name" in data:
        person = _person_for_payload(db, current_user.id, data.get("person_id"), data.get("person_name"))
        receivable.person_id = person.id
    if "description" in data:
        receivable.description = data["description"].strip()
    if "total_amount" in data:
        next_total = _money(data["total_amount"])
        if next_total < _money(receivable.received_amount):
            raise HTTPException(status_code=400, detail="Total amount cannot be lower than received amount")
        receivable.total_amount = next_total
    if "due_date" in data:
        receivable.due_date = data["due_date"]
    if "notes" in data:
        receivable.notes = data["notes"].strip() if data["notes"] else None
    selected_category_ids = category_ids_from_payload(payload)
    if selected_category_ids is not None:
        _set_receivable_categories(db, current_user.id, receivable, selected_category_ids)
    if "expense_link" in data:
        _apply_expense_link(db, current_user.id, receivable, payload.expense_link)

    if not receivable.description:
        raise HTTPException(status_code=400, detail="Description is required")

    _sync_status(receivable)
    db.commit()
    return _load_receivable(db, receivable.id, current_user.id)


@router.patch("/{receivable_id}/paid", response_model=ReceivableOut)
def mark_receivable_paid(
    receivable_id: int,
    payload: ReceivablePaidPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    remaining = _money(receivable.total_amount) - _money(receivable.received_amount)
    category_ids = category_ids_from_payload(payload)
    if category_ids is None:
        category_ids = receivable.category_ids
    return _register_payment(db, current_user.id, receivable, remaining, payload.paid_at, category_ids)


@router.post("/{receivable_id}/payments", response_model=ReceivableOut)
def create_receivable_payment(
    receivable_id: int,
    payload: ReceivablePaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    category_ids = category_ids_from_payload(payload)
    if category_ids is None:
        category_ids = receivable.category_ids
    return _register_payment(db, current_user.id, receivable, payload.amount, payload.paid_at, category_ids)


@router.delete("/{receivable_id}/payments/{payment_id}", response_model=ReceivableOut)
def delete_receivable_payment(
    receivable_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    payment = next((item for item in receivable.payments if item.id == payment_id), None)
    if not payment:
        raise HTTPException(status_code=404, detail="Receivable payment not found")

    receivable.received_amount = max(_money(receivable.received_amount) - _money(payment.amount), Decimal("0.00"))
    transaction_id = payment.transaction_id
    db.delete(payment)

    if transaction_id:
        transaction = (
            db.query(Transaction)
            .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
            .first()
        )
        if transaction:
            db.delete(transaction)

    _sync_status(receivable)
    db.commit()
    return _load_receivable(db, receivable.id, current_user.id)


@router.delete("/{receivable_id}", status_code=204)
def delete_receivable(
    receivable_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receivable = _load_receivable(db, receivable_id, current_user.id)
    if receivable.payments:
        raise HTTPException(status_code=400, detail="Receivable has payments")

    db.delete(receivable)
    db.commit()
    return None
