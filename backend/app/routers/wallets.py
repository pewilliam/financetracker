from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Date as SqlDate, DateTime, Integer, Numeric, String, case, cast, func, literal, null, select, union_all
from sqlalchemy.orm import Session, aliased

from app.database import get_db
from app.models import Transaction, User, Wallet, WalletAdjustment, WalletTransfer
from app.schemas.wallets import (
    WalletAdjustmentCreate,
    WalletDetailOut,
    WalletMovementPageOut,
    WalletOut,
    WalletSummaryOut,
    WalletTransferCreate,
    WalletUpdate,
    WalletCreate,
)
from app.security import get_current_user
from app.services.wallets import money, serialize_wallet, user_wallet, wallet_balance

router = APIRouter(prefix="/api/wallets", tags=["wallets"])


def _clean_description(value: str | None) -> str | None:
    cleaned = " ".join((value or "").split())
    return cleaned or None


@router.get("", response_model=WalletSummaryOut)
def list_wallets(
    include_archived: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Wallet).filter(Wallet.user_id == current_user.id)
    if not include_archived:
        query = query.filter(Wallet.active.is_(True))
    wallets = query.order_by(Wallet.active.desc(), Wallet.created_at, Wallet.id).all()
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
    wallet = Wallet(user_id=current_user.id, **payload.model_dump())
    db.add(wallet)
    db.commit()
    db.refresh(wallet)
    return serialize_wallet(db, wallet)


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
