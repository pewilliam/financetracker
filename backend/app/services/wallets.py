from datetime import date
from decimal import Decimal

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.wallet import Wallet, WalletAdjustment, WalletTransfer
from app.models.transaction import Transaction


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def default_wallet(db: Session, user_id: int, *, create: bool = True) -> Wallet | None:
    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id, Wallet.active.is_(True))
        .order_by(Wallet.is_primary.desc(), Wallet.id)
        .first()
    )
    if wallet:
        if not wallet.is_primary:
            set_primary_wallet(db, wallet)
        return wallet
    if not create:
        return None
    wallet = Wallet(
        user_id=user_id,
        name="Carteira principal",
        type="other",
        initial_balance=Decimal("0.00"),
        tracking_started_on=date.today(),
        color="#14A078",
        is_primary=True,
    )
    db.add(wallet)
    db.flush()
    return wallet


def set_primary_wallet(db: Session, wallet: Wallet) -> Wallet:
    db.query(Wallet).filter(
        Wallet.user_id == wallet.user_id,
        Wallet.id != wallet.id,
        Wallet.is_primary.is_(True),
    ).update({Wallet.is_primary: False}, synchronize_session=False)
    wallet.is_primary = True
    return wallet


def user_wallet(db: Session, user_id: int, wallet_id: int | None, *, active_only: bool = False) -> Wallet:
    wallet = default_wallet(db, user_id) if wallet_id is None else db.query(Wallet).filter(
        Wallet.id == wallet_id,
        Wallet.user_id == user_id,
    ).first()
    if not wallet or (active_only and not wallet.active):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


def wallet_balance(
    db: Session,
    wallet: Wallet,
    as_of: date | None = None,
    *,
    tracking_started_on: date | None = None,
) -> Decimal:
    as_of = as_of or date.today()
    tracking_start = tracking_started_on or wallet.tracking_started_on
    if as_of < tracking_start:
        return Decimal("0.00")
    end_filters = [Transaction.date <= as_of]
    signed = case((Transaction.type == "income", Transaction.amount), else_=-Transaction.amount)
    transaction_net = db.query(func.coalesce(func.sum(signed), 0)).filter(
        Transaction.wallet_id == wallet.id,
        Transaction.date >= tracking_start,
        *end_filters,
    ).scalar()
    adjustment_query = db.query(func.coalesce(func.sum(WalletAdjustment.amount), 0)).filter(
        WalletAdjustment.wallet_id == wallet.id,
        WalletAdjustment.date >= tracking_start,
    )
    incoming_query = db.query(func.coalesce(func.sum(WalletTransfer.amount), 0)).filter(
        WalletTransfer.destination_wallet_id == wallet.id,
        WalletTransfer.date >= tracking_start,
    )
    outgoing_query = db.query(func.coalesce(func.sum(WalletTransfer.amount), 0)).filter(
        WalletTransfer.source_wallet_id == wallet.id,
        WalletTransfer.date >= tracking_start,
    )
    adjustment_query = adjustment_query.filter(WalletAdjustment.date <= as_of)
    incoming_query = incoming_query.filter(WalletTransfer.date <= as_of)
    outgoing_query = outgoing_query.filter(WalletTransfer.date <= as_of)
    return money(wallet.initial_balance) + money(transaction_net) + money(adjustment_query.scalar()) + money(incoming_query.scalar()) - money(outgoing_query.scalar())


def serialize_wallet(db: Session, wallet: Wallet) -> dict:
    signed_income = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.wallet_id == wallet.id,
        Transaction.type == "income",
        Transaction.date >= wallet.tracking_started_on,
        Transaction.date <= date.today(),
    ).scalar()
    signed_expense = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.wallet_id == wallet.id,
        Transaction.type == "expense",
        Transaction.date >= wallet.tracking_started_on,
        Transaction.date <= date.today(),
    ).scalar()
    count = db.query(func.count(Transaction.id)).filter(
        Transaction.wallet_id == wallet.id,
    ).scalar()
    return {
        **{column.name: getattr(wallet, column.name) for column in wallet.__table__.columns},
        "current_balance": wallet_balance(db, wallet),
        "total_income": money(signed_income),
        "total_expenses": money(signed_expense),
        "transaction_count": int(count or 0),
    }
