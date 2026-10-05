"""Read-only, user-scoped facts for the financial assistant prototype."""

import calendar
from datetime import date
from decimal import Decimal

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import Category, Transaction, Wallet
from app.services.wallets import wallet_balances_as_of


def _month_start(day: date, offset: int = 0) -> date:
    index = day.year * 12 + day.month - 1 + offset
    return date(index // 12, index % 12 + 1, 1)


def _amount(value) -> str:
    return str(Decimal(value or 0).quantize(Decimal("0.01")))


def financial_snapshot(db: Session, user_id: int, today: date) -> dict:
    """Return bounded aggregates, never credentials or arbitrary database rows."""
    start = _month_start(today, -5)
    previous_start = _month_start(today, -1)
    previous_end = date(
        previous_start.year,
        previous_start.month,
        min(today.day, calendar.monthrange(previous_start.year, previous_start.month)[1]),
    )
    active_wallet_ids = db.query(Wallet.id).filter(Wallet.user_id == user_id, Wallet.active.is_(True))
    visible = or_(Transaction.wallet_id.is_(None), Transaction.wallet_id.in_(active_wallet_ids))
    realized = (
        Transaction.user_id == user_id,
        Transaction.date >= start,
        Transaction.date <= today,
        Transaction.is_future.is_(False),
        visible,
    )

    daily_totals = db.query(
        Transaction.date, Transaction.type, func.sum(Transaction.amount), func.count(Transaction.id)
    ).filter(*realized).group_by(Transaction.date, Transaction.type).all()
    monthly = {
        _month_start(today, offset).strftime("%Y-%m"): {
            "income": Decimal("0"), "expenses": Decimal("0"), "transactions": 0
        }
        for offset in range(-5, 1)
    }
    comparable = {
        "current": {"income": Decimal("0"), "expenses": Decimal("0")},
        "previous": {"income": Decimal("0"), "expenses": Decimal("0")},
    }
    for day, kind, amount, count in daily_totals:
        key = day.strftime("%Y-%m")
        field = "income" if kind == "income" else "expenses"
        monthly[key][field] += Decimal(amount)
        monthly[key]["transactions"] += count
        if day >= _month_start(today):
            comparable["current"][field] += Decimal(amount)
        elif previous_start <= day <= previous_end:
            comparable["previous"][field] += Decimal(amount)

    monthly_rows = [
        {
            "month": month,
            "income": _amount(values["income"]),
            "expenses": _amount(values["expenses"]),
            "net": _amount(values["income"] - values["expenses"]),
            "transactions": values["transactions"],
        }
        for month, values in monthly.items()
    ]
    category_rows = db.query(
        Category.name, func.sum(Transaction.amount)
    ).outerjoin(
        Category,
        (Category.id == Transaction.category_id) & (Category.user_id == user_id),
    ).filter(
        *realized,
        Transaction.date >= _month_start(today),
        Transaction.type == "expense",
        Transaction.invoice_id.is_(None),
    ).group_by(Category.name).order_by(func.sum(Transaction.amount).desc()).limit(8).all()

    largest_rows = db.query(
        Transaction.date, Transaction.description, Transaction.amount, Transaction.invoice_id
    ).filter(
        *realized,
        Transaction.date >= _month_start(today),
        Transaction.type == "expense",
    ).order_by(Transaction.amount.desc(), Transaction.id.desc()).limit(8).all()

    wallets = db.query(Wallet).filter(Wallet.user_id == user_id, Wallet.active.is_(True)).all()
    balances = wallet_balances_as_of(db, wallets, today) if wallets else {}
    wallet_total = sum((balances.get(wallet.id, Decimal("0")) for wallet in wallets), Decimal("0"))

    return {
        "as_of": today.isoformat(),
        "coverage_start": start.isoformat(),
        "scope": "Only realized transactions through today in active wallets (and legacy entries without a wallet).",
        "monthly": monthly_rows,
        "month_to_date_comparison": {
            "current_period": f"{_month_start(today)} to {today}",
            "previous_period": f"{previous_start} to {previous_end}",
            "current": {key: _amount(value) for key, value in comparable["current"].items()},
            "previous": {key: _amount(value) for key, value in comparable["previous"].items()},
        },
        "current_month_direct_expense_categories": [
            {"category": name or "Sem categoria", "amount": _amount(amount)}
            for name, amount in category_rows
        ],
        "largest_current_month_expenses": [
            {
                "date": day.isoformat(),
                "description": (description or "Gasto sem descrição")[:100],
                "amount": _amount(amount),
                "source": "invoice payment" if invoice_id is not None else "direct transaction",
            }
            for day, description, amount, invoice_id in largest_rows
        ],
        "active_wallet_count": len(wallets),
        "active_wallet_total_balance": _amount(wallet_total) if wallets else None,
        "limitations": [
            "Categories cover direct expenses with a primary category; invoice items are not broken down here.",
            "Wallet balances can include opening balances and adjustments; monthly net only includes transactions.",
            "There is no investment return or bank interest data in this snapshot.",
            "Future entries and planned receivables are excluded.",
        ],
    }
