from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    CardSubscription,
    CreditCard,
    InstallmentItem,
    InstallmentPurchase,
    Invoice,
    InvoiceItem,
    Transaction,
    User,
    Wallet,
)
from app.schemas.cards import CardCreate, CardCurrentInvoiceOut, CardOut, CardUpdate
from app.schemas.invoices import InvoiceOut, PurchaseCreate
from app.security import get_current_user
from app.services.categories import category_ids_from_payload, get_user_categories, set_item_categories
from app.services.credit_cards import available_credit, committed_by_card, get_or_create_invoice, invoice_period
from app.services.invoices import (
    apply_payment_forecast,
    invoice_transaction_description,
    normalize_invoice_color,
    recalculate_invoice_total,
    sync_open_invoices_to_card,
)
from app.services.subscriptions import (
    ensure_commitment_invoices,
    first_charge_on_or_after,
    materialize_due_subscriptions,
    subscription_plan,
)
from app.routers.invoices import present_invoices, present_saved_invoice

router = APIRouter(prefix="/api/cards", tags=["cards"])


def _owned_wallet(db: Session, user_id: int, wallet_id: int | None) -> Wallet | None:
    if wallet_id is None:
        return None
    wallet = (
        db.query(Wallet)
        .filter(Wallet.id == wallet_id, Wallet.user_id == user_id, Wallet.active.is_(True))
        .first()
    )
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


def _clean_institution(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _card_counts(db: Session, user_id: int) -> dict[int, tuple[int, int]]:
    rows = (
        db.query(
            Invoice.credit_card_id,
            func.count(Invoice.id),
            func.coalesce(func.sum(case((Invoice.paid.is_(False), 1), else_=0)), 0),
        )
        .filter(Invoice.user_id == user_id)
        .group_by(Invoice.credit_card_id)
        .all()
    )
    return {card_id: (int(total or 0), int(pending or 0)) for card_id, total, pending in rows}


def _blocked_card_ids(db: Session, user_id: int) -> set[int]:
    rows = (
        db.query(Invoice.credit_card_id)
        .outerjoin(InvoiceItem, InvoiceItem.invoice_id == Invoice.id)
        .outerjoin(InstallmentItem, InstallmentItem.invoice_id == Invoice.id)
        .outerjoin(InstallmentPurchase, InstallmentPurchase.first_invoice_id == Invoice.id)
        .filter(
            Invoice.user_id == user_id,
            or_(
                Invoice.total_amount != 0,
                InvoiceItem.id.isnot(None),
                InstallmentItem.id.isnot(None),
                InstallmentPurchase.id.isnot(None),
            ),
        )
        .distinct()
        .all()
    )
    return {card_id for (card_id,) in rows}


def _current_invoices(db: Session, user_id: int, cards: list[CreditCard]) -> dict[int, Invoice]:
    if not cards:
        return {}
    today = date.today()
    due_by_card = {card.id: invoice_period(card.closing_day, card.due_day, today)[1] for card in cards}
    rows = (
        db.query(Invoice)
        .filter(
            Invoice.user_id == user_id,
            Invoice.credit_card_id.in_(due_by_card),
            Invoice.due_date.in_(set(due_by_card.values())),
        )
        .all()
    )
    found = {(row.credit_card_id, row.due_date): row for row in rows}
    return {
        card_id: found[(card_id, due_date)]
        for card_id, due_date in due_by_card.items()
        if (card_id, due_date) in found
    }


def _out(
    card: CreditCard,
    counts: dict[int, tuple[int, int]],
    committed: dict[int, Decimal],
    current: dict[int, Invoice],
    blocked_card_ids: set[int] | None = None,
) -> CardOut:
    total, pending = counts.get(card.id, (0, 0))
    used = committed.get(card.id, Decimal("0.00"))
    _, current_due = invoice_period(card.closing_day, card.due_day, date.today())
    current_invoice = current.get(card.id)
    return CardOut(
        id=card.id,
        name=card.name,
        color=card.color,
        due_day=card.due_day,
        closing_day=card.closing_day,
        payment_forecast_kind=card.payment_forecast_kind,
        payment_forecast_day=card.payment_forecast_day,
        credit_limit=card.credit_limit,
        institution=card.institution,
        default_wallet_id=card.default_wallet_id,
        active=card.active,
        created_at=card.created_at,
        total_invoices=total,
        pending_invoices=pending,
        can_delete=not card.active and card.id not in (blocked_card_ids or set()),
        committed=used,
        available=available_credit(card.credit_limit, used),
        current_due_date=current_due,
        current_invoice=CardCurrentInvoiceOut(
            id=current_invoice.id,
            due_date=current_invoice.due_date,
            total_amount=current_invoice.total_amount,
            paid=current_invoice.paid,
        ) if current_invoice else None,
    )


def _load_card(db: Session, user_id: int, card_id: int) -> CreditCard:
    card = (
        db.query(CreditCard)
        .filter(CreditCard.id == card_id, CreditCard.user_id == user_id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.get("", response_model=list[CardOut])
def list_cards(
    active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(CreditCard).filter(CreditCard.user_id == current_user.id)
    if active is not None:
        query = query.filter(CreditCard.active.is_(active))
    changed = materialize_due_subscriptions(db, current_user)
    if ensure_commitment_invoices(db, current_user):
        changed = True
    if changed:
        db.commit()
    cards = query.order_by(CreditCard.active.desc(), CreditCard.name).all()
    card_ids = [card.id for card in cards]
    counts = _card_counts(db, current_user.id)
    committed = committed_by_card(db, current_user.id, card_ids)
    current = _current_invoices(db, current_user.id, cards)
    blocked = _blocked_card_ids(db, current_user.id)
    return [_out(card, counts, committed, current, blocked) for card in cards]


@router.post("", response_model=CardOut)
def create_card(
    payload: CardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_wallet(db, current_user.id, payload.default_wallet_id)
    created_fields = payload.model_fields_set
    forecast_kind, forecast_day = apply_payment_forecast(
        payload.payment_forecast_kind if "payment_forecast_kind" in created_fields else None,
        payload.payment_forecast_day if "payment_forecast_day" in created_fields else None,
        kind_was_sent="payment_forecast_kind" in created_fields,
    )
    card = CreditCard(
        user_id=current_user.id,
        name=payload.name.strip(),
        color=normalize_invoice_color(payload.color),
        due_day=payload.due_day,
        closing_day=payload.closing_day,
        payment_forecast_kind=forecast_kind,
        payment_forecast_day=forecast_day,
        credit_limit=payload.credit_limit,
        institution=_clean_institution(payload.institution),
        default_wallet_id=payload.default_wallet_id,
        active=True,
    )
    if not card.name:
        raise HTTPException(status_code=400, detail="Name is required")
    db.add(card)
    db.commit()
    db.refresh(card)
    return _out(card, {}, {}, {})


@router.put("/{card_id}", response_model=CardOut)
def update_card(
    card_id: int,
    payload: CardUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = _load_card(db, current_user.id, card_id)
    fields = payload.model_fields_set
    previous_due_day = card.due_day
    previous_closing_day = card.closing_day
    if "name" in fields and payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        card.name = name
        linked_ids = [
            invoice.linked_transaction_id
            for invoice in db.query(Invoice)
            .filter(Invoice.user_id == current_user.id, Invoice.credit_card_id == card.id)
            .all()
            if invoice.linked_transaction_id
        ]
        if linked_ids:
            db.query(Transaction).filter(Transaction.id.in_(linked_ids)).update(
                {Transaction.description: invoice_transaction_description(name)},
                synchronize_session=False,
            )
    if "color" in fields and payload.color is not None:
        card.color = normalize_invoice_color(payload.color)
    if "due_day" in fields and payload.due_day is not None:
        card.due_day = payload.due_day
    if "closing_day" in fields and payload.closing_day is not None:
        card.closing_day = payload.closing_day
    forecast_changed = "payment_forecast_kind" in fields or "payment_forecast_day" in fields
    if forecast_changed:
        kind, day = apply_payment_forecast(
            payload.payment_forecast_kind if "payment_forecast_kind" in fields else card.payment_forecast_kind,
            payload.payment_forecast_day if "payment_forecast_day" in fields else card.payment_forecast_day,
            kind_was_sent="payment_forecast_kind" in fields,
        )
        card.payment_forecast_kind = kind
        card.payment_forecast_day = day
    calendar_changed = card.due_day != previous_due_day or card.closing_day != previous_closing_day
    if calendar_changed or forecast_changed:
        sync_open_invoices_to_card(
            db,
            card,
            previous_due_day=previous_due_day,
            previous_closing_day=previous_closing_day,
            calendar_changed=calendar_changed,
        )
    if "credit_limit" in fields:
        card.credit_limit = payload.credit_limit
    if "institution" in fields:
        card.institution = _clean_institution(payload.institution)
    if "default_wallet_id" in fields:
        _owned_wallet(db, current_user.id, payload.default_wallet_id)
        card.default_wallet_id = payload.default_wallet_id
    db.commit()
    db.refresh(card)
    return _out(
        card,
        _card_counts(db, current_user.id),
        committed_by_card(db, current_user.id, [card.id]),
        _current_invoices(db, current_user.id, [card]),
        _blocked_card_ids(db, current_user.id),
    )


@router.patch("/{card_id}/toggle", response_model=CardOut)
def toggle_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = _load_card(db, current_user.id, card_id)
    card.active = not card.active
    db.commit()
    db.refresh(card)
    return _out(
        card,
        _card_counts(db, current_user.id),
        committed_by_card(db, current_user.id, [card.id]),
        _current_invoices(db, current_user.id, [card]),
        _blocked_card_ids(db, current_user.id),
    )


@router.delete("/{card_id}", status_code=204)
def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = _load_card(db, current_user.id, card_id)
    if card.active:
        raise HTTPException(status_code=409, detail="Desative o cartão antes de excluí-lo.")
    if card.id in _blocked_card_ids(db, current_user.id):
        raise HTTPException(
            status_code=409,
            detail="Este cartão possui faturas com histórico financeiro e não pode ser excluído.",
        )

    invoices = (
        db.query(Invoice)
        .filter(Invoice.user_id == current_user.id, Invoice.credit_card_id == card.id)
        .all()
    )
    invoice_ids = [invoice.id for invoice in invoices]
    linked_transaction_ids = [invoice.linked_transaction_id for invoice in invoices if invoice.linked_transaction_id]
    for invoice in invoices:
        invoice.linked_transaction_id = None
    if invoices:
        db.flush()
        transaction_query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
        if linked_transaction_ids:
            transaction_query = transaction_query.filter(
                or_(Transaction.invoice_id.in_(invoice_ids), Transaction.id.in_(linked_transaction_ids))
            )
        else:
            transaction_query = transaction_query.filter(Transaction.invoice_id.in_(invoice_ids))
        transaction_query.delete(synchronize_session=False)
        for invoice in invoices:
            db.delete(invoice)
        db.flush()
    db.delete(card)
    db.commit()
    return None


@router.get("/{card_id}/invoices", response_model=list[InvoiceOut])
def list_card_invoices(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _load_card(db, current_user.id, card_id)
    return present_invoices(
        db,
        current_user,
        include_items=True,
        credit_card_id=card_id,
    )


@router.get("/{card_id}/invoices/current", response_model=InvoiceOut)
def get_current_card_invoice(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = _load_card(db, current_user.id, card_id)
    changed = materialize_due_subscriptions(db, current_user)
    if ensure_commitment_invoices(db, current_user):
        changed = True
    if changed:
        db.commit()
    _, due_date = invoice_period(card.closing_day, card.due_day, date.today())
    existing = (
        db.query(Invoice)
        .filter(
            Invoice.user_id == current_user.id,
            Invoice.credit_card_id == card.id,
            Invoice.due_date == due_date,
        )
        .first()
    )
    if existing is None:
        invoice = get_or_create_invoice(
            db,
            current_user.id,
            card,
            date.today(),
            allow_overdue=current_user.allow_overdue_invoice_edits,
        )
        db.commit()
        invoice_id = invoice.id
    else:
        invoice_id = existing.id
    presented = present_invoices(
        db,
        current_user,
        include_items=True,
        ids=[invoice_id],
        materialize=False,
    )
    return presented[0]


@router.post("/{card_id}/purchases", response_model=InvoiceOut)
def create_card_purchase(
    card_id: int,
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = _load_card(db, current_user.id, card_id)
    if payload.recurring:
        if payload.amount <= 0:
            raise HTTPException(status_code=400, detail="Recurring purchase amount must be greater than zero")
        charge_day = payload.charge_day or payload.purchase_date.day
        if charge_day < 1 or charge_day > 31:
            raise HTTPException(status_code=400, detail="Charge day must be between 1 and 31")
        start_date = first_charge_on_or_after(payload.purchase_date, charge_day)
        interval, term_kind, term_months, term_end_date = subscription_plan(
            payload.billing_period,
            payload.term_kind,
            payload.term_months,
            payload.term_end_date,
            start_date,
        )
        selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))
        subscription = CardSubscription(
            user_id=current_user.id,
            credit_card_id=card.id,
            description=payload.description.strip(),
            amount=payload.amount,
            charge_day=charge_day,
            start_date=start_date,
            billing_interval_months=interval,
            term_kind=term_kind,
            term_months=term_months,
            term_end_date=term_end_date,
            active=True,
            category_id=selected_categories[0].id if selected_categories else None,
        )
        set_item_categories(subscription, selected_categories)
        db.add(subscription)
        db.flush()
        materialize_due_subscriptions(db, current_user)
        db.commit()
        _, due_date = invoice_period(card.closing_day, card.due_day, start_date)
        presented = present_invoices(
            db,
            current_user,
            include_items=True,
            credit_card_id=card.id,
            materialize=False,
        )
        chosen = next((invoice for invoice in presented if invoice.due_date == due_date), None)
        if chosen is not None:
            return chosen
        if presented:
            return presented[0]
        raise HTTPException(status_code=400, detail="Recurring purchase could not be placed on an invoice")

    invoice = get_or_create_invoice(
        db,
        current_user.id,
        card,
        payload.purchase_date,
        allow_overdue=current_user.allow_overdue_invoice_edits,
    )
    selected_categories = get_user_categories(db, current_user.id, category_ids_from_payload(payload))
    item = InvoiceItem(
        invoice_id=invoice.id,
        description=payload.description,
        amount=payload.amount,
        category_id=payload.category_id,
        purchase_date=payload.purchase_date,
    )
    set_item_categories(item, selected_categories)
    db.add(item)
    db.flush()
    recalculate_invoice_total(db, invoice)
    db.commit()
    return present_saved_invoice(db, current_user, invoice.id)
