import calendar
from bisect import bisect_left
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Category, InstallmentItem, InstallmentPurchase, Invoice, InvoiceItem, InvoiceTemplate, MonthlyBalance, Transaction, User
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
    anchor = (
        db.query(MonthlyBalance)
        .filter(
            MonthlyBalance.user_id == user_id,
            or_(
                MonthlyBalance.year < start.year,
                (MonthlyBalance.year == start.year) & (MonthlyBalance.month <= start.month),
            ),
        )
        .order_by(MonthlyBalance.year.desc(), MonthlyBalance.month.desc())
        .first()
    )
    if anchor and anchor.year == start.year and anchor.month == start.month:
        return _to_decimal(anchor.opening_balance)

    signed_amount = case(
        (Transaction.type == "income", Transaction.amount),
        (Transaction.type == "expense", -Transaction.amount),
        else_=0,
    )
    net_query = db.query(func.coalesce(func.sum(signed_amount), 0)).filter(
        Transaction.user_id == user_id,
        Transaction.date < start,
    )
    if anchor:
        net_query = net_query.filter(Transaction.date >= date(anchor.year, anchor.month, 1))
    net_since_anchor = _to_decimal(net_query.scalar())
    return (_to_decimal(anchor.opening_balance) if anchor else Decimal("0.00")) + net_since_anchor


def _build_month_data(db: Session, year: int, month: int, user_id: int) -> MonthResponse:
    start, end, last_day = _month_bounds(year, month)
    transactions = (
        db.query(Transaction)
        .options(
            selectinload(Transaction.category),
            selectinload(Transaction.categories),
            selectinload(Transaction.linked_expense_transaction).selectinload(Transaction.categories),
            selectinload(Transaction.linked_expense_invoice_item).selectinload(InvoiceItem.categories),
            selectinload(Transaction.linked_expense_invoice_item).selectinload(InvoiceItem.invoice).selectinload(Invoice.template),
            selectinload(Transaction.linked_expense_installment_item).selectinload(InstallmentItem.purchase).selectinload(InstallmentPurchase.categories),
            selectinload(Transaction.linked_expense_installment_item).selectinload(InstallmentItem.invoice).selectinload(Invoice.template),
        )
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


def _build_month_summary(
    db: Session,
    year: int,
    month: int,
    user_id: int,
    today: date | None = None,
) -> MonthSummaryOut:
    start, end, _ = _month_bounds(year, month)
    current_date = today or date.today()
    opening_balance = _opening_balance(db, start, user_id)
    transaction_rows = (
        db.query(Transaction.date, Transaction.type, Transaction.amount)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .all()
    )

    total_income = sum((row.amount for row in transaction_rows if row.type == "income"), Decimal("0.00"))
    total_expenses = sum((row.amount for row in transaction_rows if row.type == "expense"), Decimal("0.00"))
    total_net = total_income - total_expenses

    if end < current_date:
        current_balance = opening_balance + total_net
        future_net = Decimal("0.00")
    elif start > current_date:
        current_balance = opening_balance
        future_net = total_net
    else:
        current_net = sum(
            (
                row.amount if row.type == "income" else -row.amount
                for row in transaction_rows
                if row.date <= current_date
            ),
            Decimal("0.00"),
        )
        future_net = total_net - current_net
        current_balance = opening_balance + current_net

    return MonthSummaryOut(
        year=year,
        month=month,
        total_expenses=total_expenses,
        total_income=total_income,
        difference=total_expenses - total_income,
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
    return _build_month_summary(db, year, month, current_user.id)


@router.get("/{year}/{month}/categories", response_model=CategoryBreakdownOut)
def get_category_breakdown(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    include_details: bool = False,
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

    def add_expense_amount(item, amount: Decimal, detail: dict | None = None) -> None:
        selected_ids = selected_category_ids(item)
        if not selected_ids:
            totals[None] = totals.get(None, Decimal("0.00")) + amount
            expense_groups[()] = expense_groups.get((), Decimal("0.00")) + amount
            if detail is not None:
                expense_group_details.setdefault((), []).append(detail)
            return
        for category_id in selected_ids:
            totals[category_id] = totals.get(category_id, Decimal("0.00")) + amount
        group_key = tuple(sorted(selected_ids))
        expense_groups[group_key] = expense_groups.get(group_key, Decimal("0.00")) + amount
        if detail is not None:
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
        .options(selectinload(Transaction.categories))
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
            } if include_details else None,
        )

    income_transactions = (
        db.query(Transaction)
        .options(selectinload(Transaction.categories))
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

    invoice_rows = (
        db.query(Invoice.id, Invoice.due_date, InvoiceTemplate.name.label("invoice_name"))
        .join(InvoiceTemplate, Invoice.template_id == InvoiceTemplate.id)
        .filter(
            Invoice.user_id == current_user.id,
            Invoice.due_date >= start,
            Invoice.due_date <= end,
        )
        .all()
    )
    invoices_by_id = {row.id: row for row in invoice_rows}
    invoice_ids = list(invoices_by_id)
    if invoice_ids:
        invoice_items = (
            db.query(InvoiceItem)
            .options(selectinload(InvoiceItem.categories))
            .filter(InvoiceItem.invoice_id.in_(invoice_ids))
            .all()
        )
        for item in invoice_items:
            add_expense_amount(
                item,
                item.amount,
                {
                    "source_type": "invoice_item",
                    "source_id": item.id,
                    "description": item.description,
                    "amount": item.amount,
                    "date": invoices_by_id[item.invoice_id].due_date,
                    "invoice_name": invoices_by_id[item.invoice_id].invoice_name,
                } if include_details else None,
            )

        installment_items = (
            db.query(InstallmentItem)
            .options(
                selectinload(InstallmentItem.purchase).selectinload(InstallmentPurchase.categories),
            )
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
                    "date": invoices_by_id[item.invoice_id].due_date,
                    "invoice_name": invoices_by_id[item.invoice_id].invoice_name,
                    "installment_number": item.installment_number,
                    "installment_count": item.installment_count,
                } if include_details else None,
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
                    details=(
                        sorted(
                            expense_group_details.get(category_ids, []),
                            key=lambda detail: (detail["date"], detail["source_id"]),
                            reverse=True,
                        )
                        if include_details
                        else []
                    ),
                )
            )
        result.sort(key=lambda item: item.amount, reverse=True)
        return source_total, result

    categorized_total, chart_result = build_expense_groups()
    _, result = build_items(totals, categorized_total)
    income_categorized_total, income_result = build_items(income_totals)

    return CategoryBreakdownOut(
        total_expenses=categorized_total,
        categorized_total=categorized_total,
        items=result,
        chart_items=chart_result,
        total_income=income_categorized_total,
        income_categorized_total=income_categorized_total,
        income_items=income_result,
    )


@router.get("/summary", response_model=list[MonthCardSummaryOut])
def list_month_summaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transaction_rows = (
        db.query(Transaction.date, Transaction.type, Transaction.amount)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
    if not transaction_rows:
        return []

    balance_rows = (
        db.query(MonthlyBalance.year, MonthlyBalance.month, MonthlyBalance.opening_balance)
        .filter(MonthlyBalance.user_id == current_user.id)
        .order_by(MonthlyBalance.year, MonthlyBalance.month)
        .all()
    )

    month_totals: dict[tuple[int, int], dict[str, Decimal | int]] = {}
    for row in transaction_rows:
        period = (row.date.year, row.date.month)
        totals = month_totals.setdefault(
            period,
            {"income": Decimal("0.00"), "expenses": Decimal("0.00"), "count": 0},
        )
        totals["count"] += 1
        if row.type == "income":
            totals["income"] += row.amount
        elif row.type == "expense":
            totals["expenses"] += row.amount

    periods = sorted(month_totals)
    cumulative_net = [Decimal("0.00")]
    for period in periods:
        totals = month_totals[period]
        cumulative_net.append(cumulative_net[-1] + totals["income"] - totals["expenses"])

    def net_before(period: tuple[int, int]) -> Decimal:
        return cumulative_net[bisect_left(periods, period)]

    configured_balances = {
        (int(row.year), int(row.month)): _to_decimal(row.opening_balance)
        for row in balance_rows
    }
    balance_periods = sorted(configured_balances)

    summaries: list[MonthCardSummaryOut] = []
    for row_year, row_month in reversed(periods):
        period = (row_year, row_month)
        totals = month_totals[period]
        if period in configured_balances:
            opening = configured_balances[period]
        else:
            anchor_index = bisect_left(balance_periods, period) - 1
            if anchor_index >= 0:
                anchor_period = balance_periods[anchor_index]
                opening = configured_balances[anchor_period] + net_before(period) - net_before(anchor_period)
            else:
                opening = net_before(period)

        closing = opening + totals["income"] - totals["expenses"]
        difference_pct = Decimal("0.00")
        if opening:
            difference_pct = ((closing - opening) / abs(opening)) * Decimal("100")

        summaries.append(
            MonthCardSummaryOut(
                year=row_year,
                month=row_month,
                label=f"{MONTH_NAMES[row_month]} de {row_year}",
                opening_balance=opening,
                total_expenses=totals["expenses"],
                total_income=totals["income"],
                closing_balance=closing,
                difference_pct=difference_pct,
                transaction_count=totals["count"],
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
