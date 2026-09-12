from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Transaction, User, Wallet, WalletAdjustment, WalletTransfer
from app.schemas.wallets import (
    WalletAdjustmentCreate,
    WalletDetailOut,
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
    movements = [{
        "id": 0,
        "kind": "initial_balance",
        "date": wallet.tracking_started_on,
        "amount": wallet.initial_balance,
        "description": "Saldo inicial",
        "wallet_id": wallet.id,
        "created_at": wallet.created_at,
    }]
    for transaction in db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.wallet_id == wallet.id,
    ).all():
        movements.append({
            "id": transaction.id,
            "kind": transaction.type,
            "date": transaction.date,
            "amount": transaction.amount if transaction.type == "income" else -transaction.amount,
            "description": transaction.description,
            "wallet_id": wallet.id,
            "created_at": transaction.created_at,
        })
    for adjustment in db.query(WalletAdjustment).filter(WalletAdjustment.wallet_id == wallet.id).all():
        movements.append({
            "id": adjustment.id,
            "kind": "adjustment",
            "date": adjustment.date,
            "amount": adjustment.amount,
            "description": adjustment.description or "Ajuste de saldo",
            "wallet_id": wallet.id,
            "created_at": adjustment.created_at,
        })
    wallet_names = {item.id: item.name for item in db.query(Wallet).filter(Wallet.user_id == current_user.id).all()}
    transfers = db.query(WalletTransfer).filter(
        WalletTransfer.user_id == current_user.id,
        (WalletTransfer.source_wallet_id == wallet.id) | (WalletTransfer.destination_wallet_id == wallet.id),
    ).all()
    for transfer in transfers:
        incoming = transfer.destination_wallet_id == wallet.id
        counterpart_id = transfer.source_wallet_id if incoming else transfer.destination_wallet_id
        movements.append({
            "id": transfer.id,
            "kind": "transfer_in" if incoming else "transfer_out",
            "date": transfer.date,
            "amount": transfer.amount if incoming else -transfer.amount,
            "description": transfer.description or "Transferência entre carteiras",
            "wallet_id": wallet.id,
            "counterpart_wallet_id": counterpart_id,
            "counterpart_wallet_name": wallet_names.get(counterpart_id),
            "created_at": transfer.created_at,
        })
    movements.sort(key=lambda item: (item["date"], item["created_at"] or wallet.created_at), reverse=True)
    return {**serialize_wallet(db, wallet), "movements": movements}


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
