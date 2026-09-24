from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Transaction, Wallet, WalletAdjustment, WalletTransfer
from app.services.wallets import money, wallet_balances_as_of

REASON_ORDER = (
    "initial_balance",
    "income",
    "expense",
    "adjustment",
    "transfer_in",
    "transfer_out",
)


def _movement(
    kind: str,
    amount: Decimal,
    movement_date: date,
    description: str | None = None,
    counterpart_wallet_name: str | None = None,
    counterpart_archived: bool = False,
) -> dict:
    return {
        "kind": kind,
        "amount": money(amount),
        "description": description or None,
        "date": movement_date,
        "counterpart_wallet_name": counterpart_wallet_name,
        "counterpart_archived": counterpart_archived,
    }


def build_day_wallets(db: Session, user_id: int, target: date) -> dict:
    """Active-wallet composition of the consolidated balance on one calendar day."""
    wallets = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id, Wallet.active.is_(True))
        .order_by(Wallet.is_primary.desc(), Wallet.name, Wallet.id)
        .all()
    )
    considered = [wallet for wallet in wallets if wallet.tracking_started_on <= target]
    previous = target - timedelta(days=1)
    before = wallet_balances_as_of(db, considered, previous)
    after = wallet_balances_as_of(db, considered, target)
    considered_ids = [wallet.id for wallet in considered]

    movements: dict[int, list[dict]] = {wallet.id: [] for wallet in considered}
    if considered_ids:
        transactions = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.wallet_id.in_(considered_ids),
                Transaction.date == target,
            )
            .order_by(Transaction.id)
            .all()
        )
        for row in transactions:
            wallet = next(item for item in considered if item.id == row.wallet_id)
            if row.date < wallet.tracking_started_on:
                continue
            if row.invoice_id is not None and money(row.amount) == 0:
                continue
            signed = money(row.amount) if row.type == "income" else -money(row.amount)
            movements[row.wallet_id].append(_movement(row.type, signed, row.date, row.description))

        adjustments = (
            db.query(WalletAdjustment)
            .filter(
                WalletAdjustment.wallet_id.in_(considered_ids),
                WalletAdjustment.date == target,
            )
            .order_by(WalletAdjustment.id)
            .all()
        )
        for row in adjustments:
            wallet = next(item for item in considered if item.id == row.wallet_id)
            if row.date < wallet.tracking_started_on:
                continue
            movements[row.wallet_id].append(_movement("adjustment", row.amount, row.date, row.description))

        transfers = (
            db.query(WalletTransfer)
            .filter(
                WalletTransfer.user_id == user_id,
                WalletTransfer.date == target,
                or_(
                    WalletTransfer.source_wallet_id.in_(considered_ids),
                    WalletTransfer.destination_wallet_id.in_(considered_ids),
                ),
            )
            .order_by(WalletTransfer.id)
            .all()
        )
        involved_ids = {
            wallet_id
            for transfer in transfers
            for wallet_id in (transfer.source_wallet_id, transfer.destination_wallet_id)
        }
        names = {
            wallet.id: wallet
            for wallet in db.query(Wallet).filter(Wallet.id.in_(involved_ids or {0}), Wallet.user_id == user_id).all()
        }
        active_ids = {wallet.id for wallet in considered}
        for transfer in transfers:
            source = names.get(transfer.source_wallet_id)
            destination = names.get(transfer.destination_wallet_id)
            if transfer.source_wallet_id in active_ids:
                source_wallet = next(item for item in considered if item.id == transfer.source_wallet_id)
                if transfer.date >= source_wallet.tracking_started_on:
                    other = destination
                    movements[transfer.source_wallet_id].append(_movement(
                        "transfer_out",
                        -money(transfer.amount),
                        transfer.date,
                        transfer.description,
                        other.name if other else None,
                        bool(other and not other.active),
                    ))
            if transfer.destination_wallet_id in active_ids:
                destination_wallet = next(item for item in considered if item.id == transfer.destination_wallet_id)
                if transfer.date >= destination_wallet.tracking_started_on:
                    other = source
                    movements[transfer.destination_wallet_id].append(_movement(
                        "transfer_in",
                        money(transfer.amount),
                        transfer.date,
                        transfer.description,
                        other.name if other else None,
                        bool(other and not other.active),
                    ))

    rows = []
    total = Decimal("0.00")
    for wallet in considered:
        if wallet.tracking_started_on == target:
            movements[wallet.id].insert(0, _movement(
                "initial_balance",
                wallet.initial_balance,
                target,
                wallet.name,
            ))
        balance_before = before.get(wallet.id, Decimal("0.00"))
        balance = after.get(wallet.id, Decimal("0.00"))
        variation = money(balance - balance_before)
        wallet_movements = movements[wallet.id]
        reasons = [kind for kind in REASON_ORDER if any(item["kind"] == kind for item in wallet_movements)]
        if not reasons:
            reasons = ["unchanged"]
        rows.append({
            "wallet_id": wallet.id,
            "wallet_name": wallet.name,
            "color": wallet.color,
            "opening_balance": balance_before,
            "balance_before": balance_before,
            "variation": variation,
            "balance": balance,
            "changed": variation != 0 or any(item["kind"] != "initial_balance" for item in wallet_movements),
            "reasons": reasons,
            "movements": wallet_movements,
        })
        total += balance

    rows.sort(key=lambda row: (not row["changed"], row["wallet_name"].lower(), row["wallet_id"]))
    return {
        "date": target,
        "consolidated_balance": money(total),
        "wallets_total": money(total),
        "wallets": rows,
    }
