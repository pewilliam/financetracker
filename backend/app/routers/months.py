import calendar
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import extract, func, or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Category, InstallmentItem, Invoice, InvoiceItem, MonthlyBalance, Transaction, User
from app.schemas.months import CategoryBreakdownOut, CategoryExpenseOut, MonthCardSummaryOut, MonthDayOut, MonthResponse, MonthSummaryOut, OpeningBalancePayload
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
    configured_for_month = (
        db.query(MonthlyBalance)
        .filter(
            MonthlyBalance.user_id == user_id,
            MonthlyBalance.year == start.year,
            MonthlyBalance.month == start.month,
        )
        .first()
    )
    if configured_for_month:
        return _to_decimal(configured_for_month.opening_balance)

    anchor = (
        db.query(MonthlyBalance)
        .filter(
            MonthlyBalance.user_id == user_id,
            or_(
                MonthlyBalance.year < start.year,
                (MonthlyBalance.year == start.year) & (MonthlyBalance.month < start.month),
            ),
        )
        .order_by(MonthlyBalance.year.desc(), MonthlyBalance.month.desc())
        .first()
    )
    if anchor:
        anchor_start = date(anchor.year, anchor.month, 1)
        income_since_anchor = (
            db.query(func.coalesce(func.sum(Transaction.amount), 0))
            .filter(
                Transaction.user_id == user_id,
                Transaction.type == "income",
                Transaction.date >= anchor_start,
                Transaction.date < start,
            )
            .scalar()
        )
        expenses_since_anchor = (
            db.query(func.coalesce(func.sum(Transaction.amount), 0))
            .filter(
                Transaction.user_id == user_id,
                Transaction.type == "expense",
                Transaction.date >= anchor_start,
                Transaction.date < start,
            )
            .scalar()
        )
        return (
            _to_decimal(anchor.opening_balance)
            + _to_decimal(income_since_anchor)
            - _to_decimal(expenses_since_anchor)
        )

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


def _summarize_month_data(data: MonthResponse, today: date | None = None) -> MonthSummaryOut:
    current_date = today or date.today()
    start, end, _ = _month_bounds(data.year, data.month)

    if end < current_date:
        current_balance = data.closing_balance
        future_net = Decimal("0.00")
    elif start > current_date:
        current_balance = data.opening_balance
        future_net = data.total_income - data.total_expenses
    else:
        current_index = min(current_date.day, len(data.days)) - 1
        current_balance = data.days[current_index].balance if data.days else data.opening_balance
        future_net = sum(
            (day.income - day.expenses for day in data.days[current_index + 1 :]),
            Decimal("0.00"),
        )

    return MonthSummaryOut(
        year=data.year,
        month=data.month,
        total_expenses=data.total_expenses,
        total_income=data.total_income,
        difference=data.total_expenses - data.total_income,
        current_balance=current_balance,
        projected_closing=current_balance + future_net,
        future_net=future_net,
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
    return _summarize_month_data(data)


@router.get("/{year}/{month}/categories", response_model=CategoryBreakdownOut)
def get_category_breakdown(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start, end, _ = _month_bounds(year, month)
    totals: dict[int | None, Decimal] = {}
    expense_groups: dict[tuple[int, ...], Decimal] = {}
    expense_group_details: dict[tuple[int, ...], list[dict]] = {}
    income_totals: dict[int | None, Decimal] = {}
    categories = {
        category.id: category
        for category in db.query(Category).filter(Category.user_id == current_user.id).all()
    }

    def selected_category_ids(item) -> list[int]:
        selected_ids = list(dict.fromkeys(category.id for category in getattr(item, "categories", [])))
        if not selected_ids and getattr(item, "category_id", None) is not None:
            selected_ids = [item.category_id]
        return selected_ids

    def add_expense_amount(item, amount: Decimal, detail: dict) -> None:
        selected_ids = selected_category_ids(item)
        if not selected_ids:
            totals[None] = totals.get(None, Decimal("0.00")) + amount
            expense_groups[()] = expense_groups.get((), Decimal("0.00")) + amount
            expense_group_details.setdefault((), []).append(detail)
            return
        for category_id in selected_ids:
            totals[category_id] = totals.get(category_id, Decimal("0.00")) + amount
        group_key = tuple(sorted(selected_ids))
        expense_groups[group_key] = expense_groups.get(group_key, Decimal("0.00")) + amount
        expense_group_details.setdefault(group_key, []).append(detail)

    def add_categorized_amount(target: dict[int | None, Decimal], item, amount: Decimal) -> None:
        selected_ids = selected_category_ids(item)
        if not selected_ids:
            target[None] = target.get(None, Decimal("0.00")) + amount
            return
        share = amount / Decimal(len(selected_ids))
        for category_id in selected_ids:
            target[category_id] = target.get(category_id, Decimal("0.00")) + share

    direct_transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == "expense",
            Transaction.invoice_id.is_(None),
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .all()
    )
    for transaction in direct_transactions:
        add_expense_amount(
            transaction,
            transaction.amount,
            {
                "source_type": "transaction",
                "source_id": transaction.id,
                "description": transaction.description or "Gasto sem descrição",
                "amount": transaction.amount,
                "date": transaction.date,
            },
        )

    income_transactions = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == "income",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .all()
    )
    for transaction in income_transactions:
        add_categorized_amount(income_totals, transaction, transaction.amount)

    invoice_ids = [
        row.id
        for row in db.query(Invoice.id).filter(
            Invoice.user_id == current_user.id,
            Invoice.due_date >= start,
            Invoice.due_date <= end,
        ).all()
    ]
    if invoice_ids:
        invoice_items = db.query(InvoiceItem).filter(InvoiceItem.invoice_id.in_(invoice_ids)).all()
        for item in invoice_items:
            add_expense_amount(
                item,
                item.amount,
                {
                    "source_type": "invoice_item",
                    "source_id": item.id,
                    "description": item.description,
                    "amount": item.amount,
                    "date": item.invoice.due_date,
                    "invoice_name": item.invoice.name,
                },
            )

        installment_items = (
            db.query(InstallmentItem)
            .filter(
                InstallmentItem.invoice_id.in_(invoice_ids),
                InstallmentItem.status != "canceled",
            )
            .all()
        )
        for item in installment_items:
            add_expense_amount(
                item.purchase if item.purchase else item,
                item.amount,
                {
                    "source_type": "installment_item",
                    "source_id": item.id,
                    "description": item.purchase_description or item.description,
                    "amount": item.amount,
                    "date": item.invoice.due_date,
                    "invoice_name": item.invoice.name,
                    "installment_number": item.installment_number,
                    "installment_count": item.installment_count,
                },
            )

    def build_items(source: dict[int | None, Decimal], total_override: Decimal | None = None):
        source_total = sum(source.values(), Decimal("0.00"))
        percentage_base = total_override if total_override is not None else source_total
        if percentage_base <= 0:
            percentage_base = Decimal("0.00")
        result = []
        for category_id, amount in source.items():
            if amount == 0:
                continue
            category = categories.get(category_id)
            percentage = (amount / percentage_base * Decimal("100")) if percentage_base else Decimal("0.00")
            result.append(
                CategoryExpenseOut(
                    category_id=category_id,
                    category_ids=[category_id] if category_id is not None else [],
                    name=category.name if category else "Sem categoria",
                    color=category.color if category else "#94A3B8",
                    amount=amount,
                    percentage=percentage.quantize(Decimal("0.01")),
                )
            )
        result.sort(key=lambda item: item.amount, reverse=True)
        return source_total, result

    def build_expense_groups():
        source_total = sum(expense_groups.values(), Decimal("0.00"))
        percentage_base = source_total if source_total > 0 else Decimal("0.00")
        result = []
        for category_ids, amount in expense_groups.items():
            if amount == 0:
                continue
            group_categories = sorted(
                (categories[category_id] for category_id in category_ids if category_id in categories),
                key=lambda category: category.name.lower(),
            )
            percentage = (amount / percentage_base * Decimal("100")) if percentage_base else Decimal("0.00")
            result.append(
                CategoryExpenseOut(
                    category_id=category_ids[0] if len(category_ids) == 1 else None,
                    category_ids=[category.id for category in group_categories],
                    name=" + ".join(category.name for category in group_categories) if group_categories else "Sem categoria",
                    color=group_categories[0].color if group_categories else "#94A3B8",
                    amount=amount,
                    percentage=percentage.quantize(Decimal("0.01")),
                    details=sorted(
                        expense_group_details.get(category_ids, []),
                        key=lambda detail: (detail["date"], detail["source_id"]),
                        reverse=True,
                    ),
                )
            )
        result.sort(key=lambda item: item.amount, reverse=True)
        return source_total, result

    categorized_total, chart_result = build_expense_groups()
    _, result = build_items(totals, categorized_total)
    income_categorized_total, income_result = build_items(income_totals)

    month_data = _build_month_data(db, year, month, current_user.id)
    return CategoryBreakdownOut(
        total_expenses=month_data.total_expenses,
        categorized_total=categorized_total,
        items=result,
        chart_items=chart_result,
        total_income=month_data.total_income,
        income_categorized_total=income_categorized_total,
        income_items=income_result,
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
                transaction_count=sum(len(day.transactions) for day in data.days),
            )
        )

    return summaries


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
