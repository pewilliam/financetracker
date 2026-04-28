import calendar
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import extract, func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import MonthlyBalance, Recurrence, Transaction, User
from app.schemas.months import MonthCardSummaryOut, MonthDayOut, MonthResponse, MonthSummaryOut, OpeningBalancePayload
from app.security import get_current_user

router = APIRouter(prefix="/api/months", tags=["months"])

MONTH_NAMES = {
    1: "Janeiro",
    2: "Fevereiro",
    3: "Março",
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
}


def _to_decimal(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def _month_bounds(year: int, month: int):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")
    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last_day)
    return start, end, last_day


def _opening_balance(db: Session, start: date, user_id: int) -> Decimal:
    configured = (
        db.query(MonthlyBalance)
        .filter(
            MonthlyBalance.user_id == user_id,
            MonthlyBalance.year == start.year,
            MonthlyBalance.month == start.month,
        )
        .first()
    )
    if configured:
        return _to_decimal(configured.opening_balance)

    income_before = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "income",
            Transaction.date < start,
        )
        .scalar()
    )
    expenses_before = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.date < start,
        )
        .scalar()
    )
    return _to_decimal(income_before) - _to_decimal(expenses_before)


def _build_month_data(db: Session, year: int, month: int, user_id: int) -> MonthResponse:
    start, end, last_day = _month_bounds(year, month)
    transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )

    opening_balance = _opening_balance(db, start, user_id)

    by_date: dict[date, list[Transaction]] = {}
    for tx in transactions:
        by_date.setdefault(tx.date, []).append(tx)

    balance = opening_balance
    total_income = Decimal("0.00")
    total_expenses = Decimal("0.00")
    days: list[MonthDayOut] = []

    for day in range(1, last_day + 1):
        current_date = date(year, month, day)
        day_transactions = by_date.get(current_date, [])
        income = sum(
            (tx.amount for tx in day_transactions if tx.type == "income"),
            Decimal("0.00"),
        )
        expenses = sum(
            (tx.amount for tx in day_transactions if tx.type == "expense"),
            Decimal("0.00"),
        )
        balance = balance + income - expenses
        total_income += income
        total_expenses += expenses
        notes = "; ".join([tx.description for tx in day_transactions if tx.description])
        has_future = any(tx.is_future for tx in day_transactions)

        days.append(
            MonthDayOut(
                date=current_date,
                expenses=expenses,
                income=income,
                balance=balance,
                notes=notes or None,
                has_future=has_future,
                transactions=day_transactions,
            )
        )

    return MonthResponse(
        year=year,
        month=month,
        opening_balance=opening_balance,
        closing_balance=balance,
        total_expenses=total_expenses,
        total_income=total_income,
        days=days,
    )


@router.get("/{year}/{month}", response_model=MonthResponse)
def get_month(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _build_month_data(db, year, month, current_user.id)


@router.get("/{year}/{month}/summary", response_model=MonthSummaryOut)
def get_month_summary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = _build_month_data(db, year, month, current_user.id)
    start, end, _ = _month_bounds(year, month)
    today = date.today()

    if end < today:
        current_balance = data.closing_balance
        future_net = Decimal("0.00")
    elif start > today:
        current_balance = data.opening_balance
        future_net = data.total_income - data.total_expenses
    else:
        current_index = min(today.day, len(data.days)) - 1
        current_balance = data.days[current_index].balance if data.days else data.opening_balance
        future_net = sum(
            (
                day.income - day.expenses
                for day in data.days[current_index + 1 :]
            ),
            Decimal("0.00"),
        )

    projected_closing = current_balance + future_net
    difference = data.total_expenses - data.total_income

    return MonthSummaryOut(
        year=year,
        month=month,
        total_expenses=data.total_expenses,
        total_income=data.total_income,
        difference=difference,
        current_balance=current_balance,
        projected_closing=projected_closing,
        future_net=future_net,
    )


@router.get("/summary", response_model=list[MonthCardSummaryOut])
def list_month_summaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    year_expr = extract("year", Transaction.date)
    month_expr = extract("month", Transaction.date)
    month_rows = (
        db.query(
            year_expr.label("year"),
            month_expr.label("month"),
        )
        .filter(Transaction.user_id == current_user.id)
        .group_by(year_expr, month_expr)
        .order_by(year_expr.desc(), month_expr.desc())
        .all()
    )

    summaries: list[MonthCardSummaryOut] = []
    for row in month_rows:
        row_year = int(row.year)
        row_month = int(row.month)
        data = _build_month_data(db, row_year, row_month, current_user.id)
        opening = data.opening_balance
        difference_pct = Decimal("0.00")
        if opening:
            difference_pct = ((data.closing_balance - opening) / abs(opening)) * Decimal("100")

        summaries.append(
            MonthCardSummaryOut(
                year=row_year,
                month=row_month,
                label=f"{MONTH_NAMES[row_month]} de {row_year}",
                opening_balance=opening,
                total_expenses=data.total_expenses,
                total_income=data.total_income,
                closing_balance=data.closing_balance,
                difference_pct=difference_pct,
            )
        )

    return summaries


@router.post("/{year}/{month}/apply-recurrences")
def apply_recurrences(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, _, last_day = _month_bounds(year, month)
    recurrences = (
        db.query(Recurrence)
        .filter(Recurrence.user_id == current_user.id, Recurrence.active.is_(True))
        .all()
    )
    created = 0
    today = date.today()

    for recurrence in recurrences:
        if recurrence.recurrence_months:
            generated = (
                db.query(func.count(Transaction.id))
                .filter(
                    Transaction.recurrence_id == recurrence.id,
                    Transaction.user_id == current_user.id,
                )
                .scalar()
            )
            if generated >= recurrence.recurrence_months:
                recurrence.active = False
                continue

        day = max(1, min(recurrence.day_of_month, last_day))
        target_date = date(year, month, day)
        exists = (
            db.query(Transaction)
            .filter(
                Transaction.recurrence_id == recurrence.id,
                Transaction.user_id == current_user.id,
                Transaction.date == target_date,
            )
            .first()
        )
        if exists:
            continue

        db.add(
            Transaction(
                user_id=current_user.id,
                date=target_date,
                type=recurrence.type,
                amount=recurrence.amount,
                description=recurrence.description,
                is_future=target_date > today,
                recurrence_id=recurrence.id,
            )
        )
        created += 1

    db.commit()
    return {"created": created}


@router.put("/{year}/{month}/opening-balance", response_model=OpeningBalancePayload)
def set_opening_balance(
    year: int,
    month: int,
    payload: OpeningBalancePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _month_bounds(year, month)
    row = (
        db.query(MonthlyBalance)
        .filter(
            MonthlyBalance.user_id == current_user.id,
            MonthlyBalance.year == year,
            MonthlyBalance.month == month,
        )
        .first()
    )
    if not row:
        row = MonthlyBalance(user_id=current_user.id, year=year, month=month)
        db.add(row)
    row.opening_balance = payload.opening_balance
    db.commit()
    return {"opening_balance": row.opening_balance}
