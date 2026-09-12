from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Date as SqlDate, DateTime, Integer, Numeric, String, case, cast, func, literal, null, select, union_all
from sqlalchemy.orm import Session, aliased

from app.database import get_db
from app.models import Recurrence, Transaction, User, Wallet, WalletAdjustment, WalletTransfer
from app.schemas.wallets import (
    WalletAdjustmentCreate,
    WalletDetailOut,
    WalletConsolidationCreate,
    WalletConsolidationPreview,
    WalletConsolidationResult,
    WalletMovementPageOut,
    WalletOut,
    WalletSummaryOut,
    WalletTransferCreate,
    WalletUpdate,
    WalletCreate,
)
from app.security import get_current_user
from app.services.wallets import money, serialize_wallet, set_primary_wallet, user_wallet, wallet_balance

router = APIRouter(prefix="/api/wallets", tags=["wallets"])


def _clean_description(value: str | None) -> str | None:
    cleaned = " ".join((value or "").split())
    return cleaned or None


def _wallet_consolidation_preview(
    payload: WalletConsolidationCreate,
    db: Session,
    current_user: User,
) -> tuple[dict, Wallet, Wallet]:
    if payload.source_wallet_id == payload.destination_wallet_id:
        raise HTTPException(status_code=400, detail="Choose two different wallets")
    source = user_wallet(db, current_user.id, payload.source_wallet_id, active_only=True)
    destination = user_wallet(db, current_user.id, payload.destination_wallet_id, active_only=True)
    transaction_query = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.wallet_id == source.id,
    )
    transaction_count, earliest_date, latest_date = transaction_query.with_entities(
        func.count(Transaction.id),
        func.min(Transaction.date),
        func.max(Transaction.date),
    ).one()
    expense_query = transaction_query.filter(Transaction.type == "expense")
    income_query = transaction_query.filter(Transaction.type == "income")
    expense_count, expense_total = expense_query.with_entities(
        func.count(Transaction.id), func.coalesce(func.sum(Transaction.amount), 0),
    ).one()
    income_count, income_total = income_query.with_entities(
        func.count(Transaction.id), func.coalesce(func.sum(Transaction.amount), 0),
    ).one()
    recurrence_query = db.query(Recurrence).filter(
        Recurrence.user_id == current_user.id,
        Recurrence.wallet_id == source.id,
    )
    recurrence_count = recurrence_query.count()
    expense_recurrence_count = recurrence_query.filter(Recurrence.type == "expense").count()
    income_recurrence_count = recurrence_query.filter(Recurrence.type == "income").count()
    adjustment_query = db.query(WalletAdjustment).filter(
        WalletAdjustment.user_id == current_user.id,
        WalletAdjustment.wallet_id == source.id,
    )
    adjustment_count = adjustment_query.count()
    direct_transfer_query = db.query(WalletTransfer).filter(
        WalletTransfer.user_id == current_user.id,
        ((WalletTransfer.source_wallet_id == source.id) & (WalletTransfer.destination_wallet_id == destination.id))
        | ((WalletTransfer.source_wallet_id == destination.id) & (WalletTransfer.destination_wallet_id == source.id)),
    )
    direct_transfer_count, direct_transfer_total = direct_transfer_query.with_entities(
        func.count(WalletTransfer.id), func.coalesce(func.sum(WalletTransfer.amount), 0),
    ).one()
    redirected_transfer_count = db.query(func.count(WalletTransfer.id)).filter(
        WalletTransfer.user_id == current_user.id,
        ((WalletTransfer.source_wallet_id == source.id) & (WalletTransfer.destination_wallet_id != destination.id))
        | ((WalletTransfer.destination_wallet_id == source.id) & (WalletTransfer.source_wallet_id != destination.id)),
    ).scalar()
    tracking_after = destination.tracking_started_on
    if payload.adjust_tracking_start and source.tracking_started_on < tracking_after:
        tracking_after = source.tracking_started_on

    realized_expense_total = expense_query.with_entities(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.date >= source.tracking_started_on,
        Transaction.date <= date.today(),
    ).scalar()
    realized_income_total = income_query.with_entities(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.date >= source.tracking_started_on,
        Transaction.date <= date.today(),
    ).scalar()
    source_before = wallet_balance(db, source)
    destination_before = wallet_balance(db, destination)
    destination_with_tracking = wallet_balance(db, destination, tracking_started_on=tracking_after)

    direct_source_effect = Decimal("0.00")
    direct_destination_effect = Decimal("0.00")
    for transfer in direct_transfer_query.all():
        if transfer.date > date.today():
            continue
        if transfer.date >= source.tracking_started_on:
            direct_source_effect += transfer.amount if transfer.destination_wallet_id == source.id else -transfer.amount
        if transfer.date >= tracking_after:
            direct_destination_effect += transfer.amount if transfer.destination_wallet_id == destination.id else -transfer.amount

    source_after = Decimal("0.00")
    destination_after = money(source_before + destination_with_tracking - direct_source_effect - direct_destination_effect)
    active_wallets = db.query(Wallet).filter(
        Wallet.user_id == current_user.id,
        Wallet.active.is_(True),
    ).all()
    total_before = sum((wallet_balance(db, wallet) for wallet in active_wallets), Decimal("0.00"))
    total_after = total_before - source_before - destination_before + source_after + destination_after
    return {
        "source_wallet_id": source.id,
        "destination_wallet_id": destination.id,
        "transaction_count": int(transaction_count or 0),
        "expense_count": int(expense_count or 0),
        "expense_total": money(expense_total),
        "realized_expense_total": money(realized_expense_total),
        "income_count": int(income_count or 0),
        "income_total": money(income_total),
        "realized_income_total": money(realized_income_total),
        "recurrence_count": int(recurrence_count or 0),
        "expense_recurrence_count": int(expense_recurrence_count or 0),
        "income_recurrence_count": int(income_recurrence_count or 0),
        "adjustment_count": int(adjustment_count or 0),
        "initial_balance": money(source.initial_balance),
        "direct_transfer_count": int(direct_transfer_count or 0),
        "direct_transfer_total": money(direct_transfer_total),
        "redirected_transfer_count": int(redirected_transfer_count or 0),
        "earliest_date": earliest_date,
        "latest_date": latest_date,
        "source_balance_before": money(source_before),
        "source_balance_after": money(source_after),
        "destination_balance_before": money(destination_before),
        "destination_balance_after": money(destination_after),
        "total_balance_before": money(total_before),
        "total_balance_after": money(total_after),
        "tracking_start_before": destination.tracking_started_on,
        "tracking_start_after": tracking_after,
        "tracking_start_changes": tracking_after != destination.tracking_started_on,
        "destination_becomes_primary": bool(source.is_primary),
    }, source, destination


@router.get("", response_model=WalletSummaryOut)
def list_wallets(
    include_archived: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Wallet).filter(Wallet.user_id == current_user.id)
    if not include_archived:
        query = query.filter(Wallet.active.is_(True))
    wallets = query.order_by(Wallet.active.desc(), Wallet.is_primary.desc(), Wallet.created_at, Wallet.id).all()
    if not wallets:
        user_wallet(db, current_user.id, None)
        db.commit()
        wallets = db.query(Wallet).filter(Wallet.user_id == current_user.id).all()
    serialized = [serialize_wallet(db, wallet) for wallet in wallets]
    active = [item for item in serialized if item["active"]]
    return {
        "total_balance": sum((money(item["current_balance"]) for item in active), Decimal("0.00")),
        "active_count": len(active),
        "wallets": serialized,
        "needs_organization": len(active) == 1 and active[0]["name"] == "Carteira principal",
    }


@router.post("", response_model=WalletOut, status_code=status.HTTP_201_CREATED)
def create_wallet(
    payload: WalletCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    has_primary = db.query(Wallet.id).filter(
        Wallet.user_id == current_user.id,
        Wallet.active.is_(True),
        Wallet.is_primary.is_(True),
    ).first()
    wallet = Wallet(user_id=current_user.id, is_primary=not bool(has_primary), **payload.model_dump())
    db.add(wallet)
    db.commit()
    db.refresh(wallet)
    return serialize_wallet(db, wallet)


@router.post("/consolidation/preview", response_model=WalletConsolidationPreview)
def preview_wallet_consolidation(
    payload: WalletConsolidationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    preview, _, _ = _wallet_consolidation_preview(payload, db, current_user)
    return preview


@router.post("/consolidation", response_model=WalletConsolidationResult)
def consolidate_wallet(
    payload: WalletConsolidationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    preview, source, destination = _wallet_consolidation_preview(payload, db, current_user)
    if not any((
        preview["transaction_count"],
        preview["recurrence_count"],
        preview["adjustment_count"],
        preview["initial_balance"],
        preview["direct_transfer_count"],
        preview["redirected_transfer_count"],
    )):
        raise HTTPException(status_code=400, detail="No wallet history to consolidate")
    if preview["total_balance_after"] != preview["total_balance_before"]:
        raise HTTPException(status_code=400, detail="Wallet consolidation would change total balance")
    if preview["tracking_start_changes"]:
        destination.tracking_started_on = preview["tracking_start_after"]
    if preview["destination_becomes_primary"]:
        set_primary_wallet(db, destination)

    if source.initial_balance:
        balance_before = wallet_balance(
            db,
            destination,
            source.tracking_started_on,
            tracking_started_on=preview["tracking_start_after"],
        )
        db.add(WalletAdjustment(
            user_id=current_user.id,
            wallet_id=destination.id,
            date=source.tracking_started_on,
            amount=source.initial_balance,
            balance_before=balance_before,
            balance_after=money(balance_before + source.initial_balance),
            description=f"Saldo inicial consolidado de {source.name}",
        ))
        source.initial_balance = Decimal("0.00")

    moved_transactions = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.wallet_id == source.id,
    ).update({Transaction.wallet_id: destination.id}, synchronize_session=False)
    moved_adjustments = db.query(WalletAdjustment).filter(
        WalletAdjustment.user_id == current_user.id,
        WalletAdjustment.wallet_id == source.id,
    ).update({WalletAdjustment.wallet_id: destination.id}, synchronize_session=False)
    moved_recurrences = db.query(Recurrence).filter(
        Recurrence.user_id == current_user.id,
        Recurrence.wallet_id == source.id,
    ).update({Recurrence.wallet_id: destination.id}, synchronize_session=False)

    removed_transfers = db.query(WalletTransfer).filter(
        WalletTransfer.user_id == current_user.id,
        ((WalletTransfer.source_wallet_id == source.id) & (WalletTransfer.destination_wallet_id == destination.id))
        | ((WalletTransfer.source_wallet_id == destination.id) & (WalletTransfer.destination_wallet_id == source.id)),
    ).delete(synchronize_session=False)
    redirected_outgoing = db.query(WalletTransfer).filter(
        WalletTransfer.user_id == current_user.id,
        WalletTransfer.source_wallet_id == source.id,
        WalletTransfer.destination_wallet_id != destination.id,
    ).update({WalletTransfer.source_wallet_id: destination.id}, synchronize_session=False)
    redirected_incoming = db.query(WalletTransfer).filter(
        WalletTransfer.user_id == current_user.id,
        WalletTransfer.destination_wallet_id == source.id,
        WalletTransfer.source_wallet_id != destination.id,
    ).update({WalletTransfer.destination_wallet_id: destination.id}, synchronize_session=False)
    db.commit()
    db.refresh(source)
    db.refresh(destination)
    return {
        "moved_transaction_count": moved_transactions,
        "moved_recurrence_count": moved_recurrences,
        "moved_adjustment_count": moved_adjustments,
        "removed_transfer_count": removed_transfers,
        "redirected_transfer_count": redirected_outgoing + redirected_incoming,
        "source_wallet": serialize_wallet(db, source),
        "destination_wallet": serialize_wallet(db, destination),
    }


@router.get("/{wallet_id}", response_model=WalletDetailOut)
def get_wallet(
    wallet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = user_wallet(db, current_user.id, wallet_id)
    return {**serialize_wallet(db, wallet), "movements": []}


@router.get("/{wallet_id}/movements", response_model=WalletMovementPageOut)
def list_wallet_movements(
    wallet_id: int,
    year: int | None = Query(default=None, ge=1, le=9999),
    month: int | None = Query(default=None, ge=1, le=12),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = user_wallet(db, current_user.id, wallet_id)
    today = date.today()
    selected_year = year or today.year
    selected_month = month or today.month
    period_start = date(selected_year, selected_month, 1)
    period_end = date(selected_year + 1, 1, 1) if selected_month == 12 else date(selected_year, selected_month + 1, 1)

    empty_integer = cast(null(), Integer)
    empty_string = cast(null(), String(100))
    transaction_movements = select(
        Transaction.id.label("id"),
        case((Transaction.type == "income", literal("income")), else_=literal("expense")).label("kind"),
        Transaction.date.label("date"),
        case((Transaction.type == "income", Transaction.amount), else_=-Transaction.amount).label("amount"),
        Transaction.description.label("description"),
        Transaction.wallet_id.label("wallet_id"),
        empty_integer.label("counterpart_wallet_id"),
        empty_string.label("counterpart_wallet_name"),
        Transaction.created_at.label("created_at"),
    ).where(
        Transaction.user_id == current_user.id,
        Transaction.wallet_id == wallet.id,
        Transaction.date >= period_start,
        Transaction.date < period_end,
    )
    adjustment_movements = select(
        WalletAdjustment.id.label("id"),
        literal("adjustment").label("kind"),
        WalletAdjustment.date.label("date"),
        WalletAdjustment.amount.label("amount"),
        func.coalesce(WalletAdjustment.description, literal("Ajuste de saldo")).label("description"),
        WalletAdjustment.wallet_id.label("wallet_id"),
        empty_integer.label("counterpart_wallet_id"),
        empty_string.label("counterpart_wallet_name"),
        WalletAdjustment.created_at.label("created_at"),
    ).where(
        WalletAdjustment.user_id == current_user.id,
        WalletAdjustment.wallet_id == wallet.id,
        WalletAdjustment.date >= period_start,
        WalletAdjustment.date < period_end,
    )

    counterpart = aliased(Wallet)
    outgoing_transfers = select(
        WalletTransfer.id.label("id"),
        literal("transfer_out").label("kind"),
        WalletTransfer.date.label("date"),
        (-WalletTransfer.amount).label("amount"),
        func.coalesce(WalletTransfer.description, literal("Transferência entre carteiras")).label("description"),
        WalletTransfer.source_wallet_id.label("wallet_id"),
        WalletTransfer.destination_wallet_id.label("counterpart_wallet_id"),
        counterpart.name.label("counterpart_wallet_name"),
        WalletTransfer.created_at.label("created_at"),
    ).join(counterpart, counterpart.id == WalletTransfer.destination_wallet_id).where(
        WalletTransfer.user_id == current_user.id,
        WalletTransfer.source_wallet_id == wallet.id,
        WalletTransfer.date >= period_start,
        WalletTransfer.date < period_end,
    )

    counterpart = aliased(Wallet)
    incoming_transfers = select(
        WalletTransfer.id.label("id"),
        literal("transfer_in").label("kind"),
        WalletTransfer.date.label("date"),
        WalletTransfer.amount.label("amount"),
        func.coalesce(WalletTransfer.description, literal("Transferência entre carteiras")).label("description"),
        WalletTransfer.destination_wallet_id.label("wallet_id"),
        WalletTransfer.source_wallet_id.label("counterpart_wallet_id"),
        counterpart.name.label("counterpart_wallet_name"),
        WalletTransfer.created_at.label("created_at"),
    ).join(counterpart, counterpart.id == WalletTransfer.source_wallet_id).where(
        WalletTransfer.user_id == current_user.id,
        WalletTransfer.destination_wallet_id == wallet.id,
        WalletTransfer.date >= period_start,
        WalletTransfer.date < period_end,
    )

    statements = [transaction_movements, adjustment_movements, outgoing_transfers, incoming_transfers]
    if period_start <= wallet.tracking_started_on < period_end:
        statements.append(select(
            literal(0).label("id"),
            literal("initial_balance").label("kind"),
            literal(wallet.tracking_started_on, type_=SqlDate).label("date"),
            literal(wallet.initial_balance, type_=Numeric(10, 2)).label("amount"),
            literal("Saldo inicial").label("description"),
            literal(wallet.id).label("wallet_id"),
            empty_integer.label("counterpart_wallet_id"),
            empty_string.label("counterpart_wallet_name"),
            literal(wallet.created_at, type_=DateTime).label("created_at"),
        ))

    movements = union_all(*statements).subquery("wallet_movements")
    total = db.execute(select(func.count()).select_from(movements)).scalar_one()
    rows = db.execute(
        select(movements)
        .order_by(movements.c.date.desc(), movements.c.created_at.desc(), movements.c.kind, movements.c.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).mappings().all()
    return {
        "items": [dict(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
        "year": selected_year,
        "month": selected_month,
    }


@router.put("/{wallet_id}", response_model=WalletOut)
def update_wallet(
    wallet_id: int,
    payload: WalletUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = user_wallet(db, current_user.id, wallet_id)
    data = payload.model_dump(exclude_unset=True)
    if "tracking_started_on" in data and data["tracking_started_on"] != wallet.tracking_started_on:
        has_history = db.query(Transaction.id).filter(Transaction.wallet_id == wallet.id).first() \
            or db.query(WalletAdjustment.id).filter(WalletAdjustment.wallet_id == wallet.id).first() \
            or db.query(WalletTransfer.id).filter(
                (WalletTransfer.source_wallet_id == wallet.id) | (WalletTransfer.destination_wallet_id == wallet.id)
            ).first()
        if has_history:
            raise HTTPException(status_code=400, detail="Tracking date cannot be changed after movements exist")
    for field, value in data.items():
        setattr(wallet, field, value)
    db.commit()
    db.refresh(wallet)
    return serialize_wallet(db, wallet)


@router.patch("/{wallet_id}/primary", response_model=WalletOut)
def set_wallet_as_primary(
    wallet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = user_wallet(db, current_user.id, wallet_id, active_only=True)
    set_primary_wallet(db, wallet)
    db.commit()
    db.refresh(wallet)
    return serialize_wallet(db, wallet)


@router.post("/{wallet_id}/adjustments", response_model=WalletDetailOut)
def adjust_wallet_balance(
    wallet_id: int,
    payload: WalletAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = user_wallet(db, current_user.id, wallet_id, active_only=True)
    if payload.date < wallet.tracking_started_on:
        raise HTTPException(status_code=400, detail="Adjustment date cannot precede wallet tracking")
    before = wallet_balance(db, wallet, payload.date)
    difference = money(payload.actual_balance) - before
    if difference == 0:
        raise HTTPException(status_code=400, detail="Balance is already equal to the informed amount")
    db.add(WalletAdjustment(
        user_id=current_user.id,
        wallet_id=wallet.id,
        date=payload.date,
        amount=difference,
        balance_before=before,
        balance_after=money(payload.actual_balance),
        description=_clean_description(payload.description),
    ))
    db.commit()
    return get_wallet(wallet.id, db, current_user)


@router.post("/transfers", response_model=WalletDetailOut, status_code=status.HTTP_201_CREATED)
def transfer_between_wallets(
    payload: WalletTransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.source_wallet_id == payload.destination_wallet_id:
        raise HTTPException(status_code=400, detail="Choose two different wallets")
    source = user_wallet(db, current_user.id, payload.source_wallet_id, active_only=True)
    destination = user_wallet(db, current_user.id, payload.destination_wallet_id, active_only=True)
    if payload.date < source.tracking_started_on or payload.date < destination.tracking_started_on:
        raise HTTPException(status_code=400, detail="Transfer date cannot precede wallet tracking")
    db.add(WalletTransfer(
        user_id=current_user.id,
        source_wallet_id=source.id,
        destination_wallet_id=destination.id,
        date=payload.date,
        amount=payload.amount,
        description=_clean_description(payload.description),
    ))
    db.commit()
    return get_wallet(source.id, db, current_user)


@router.patch("/{wallet_id}/archive", response_model=WalletOut)
def archive_wallet(
    wallet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = user_wallet(db, current_user.id, wallet_id)
    if wallet.active:
        active_count = db.query(Wallet.id).filter(Wallet.user_id == current_user.id, Wallet.active.is_(True)).count()
        if active_count <= 1:
            raise HTTPException(status_code=400, detail="Keep at least one active wallet")
        if wallet.is_primary:
            raise HTTPException(status_code=400, detail="Choose another primary wallet before archiving")
        if wallet_balance(db, wallet) != 0:
            raise HTTPException(status_code=400, detail="Transfer or adjust the wallet balance to zero before archiving")
    wallet.active = False
    db.commit()
    db.refresh(wallet)
    return serialize_wallet(db, wallet)


@router.patch("/{wallet_id}/restore", response_model=WalletOut)
def restore_wallet(
    wallet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = user_wallet(db, current_user.id, wallet_id)
    wallet.active = True
    db.commit()
    db.refresh(wallet)
    return serialize_wallet(db, wallet)
