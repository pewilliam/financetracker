import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BudgetReserveRule, Category, MonthlyBudgetIncome, MonthlyBudgetPlan, Transaction, User
from app.schemas.budgets import (
    BudgetIncomeCandidateOut,
    BudgetReserveRuleOut,
    BudgetReserveRuleUpdate,
    MonthlyBudgetPlanOut,
    MonthlyBudgetPlanUpdate,
)
from app.security import get_current_user


router = APIRouter(prefix="/api/budget-plans", tags=["budget-plans"])
MONEY_STEP = Decimal("0.01")


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def _get_plan(db: Session, user_id: int, year: int, month: int) -> MonthlyBudgetPlan | None:
    return (
        db.query(MonthlyBudgetPlan)
        .filter(
            MonthlyBudgetPlan.user_id == user_id,
            MonthlyBudgetPlan.year == year,
            MonthlyBudgetPlan.month == month,
        )
        .first()
    )


def _get_or_create_plan(db: Session, user_id: int, year: int, month: int) -> MonthlyBudgetPlan:
    plan = _get_plan(db, user_id, year, month)
    if plan:
        return plan
    plan = MonthlyBudgetPlan(user_id=user_id, year=year, month=month, income_mode="transactions")
    db.add(plan)
    db.flush()
    return plan


def _income_candidates(db: Session, user_id: int, year: int, month: int) -> list[Transaction]:
    start, end = _month_bounds(year, month)
    return (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "income",
            Transaction.amount > 0,
            Transaction.date >= start,
            Transaction.date <= end,
            or_(
                Transaction.category.has(Category.include_in_income_planning.is_(True)),
                Transaction.categories.any(Category.include_in_income_planning.is_(True)),
            ),
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )


def _reserve_rule(db: Session, user_id: int, year: int, month: int) -> BudgetReserveRule | None:
    return (
        db.query(BudgetReserveRule)
        .filter(
            BudgetReserveRule.user_id == user_id,
            or_(
                BudgetReserveRule.effective_year < year,
                and_(BudgetReserveRule.effective_year == year, BudgetReserveRule.effective_month <= month),
            ),
        )
        .order_by(BudgetReserveRule.effective_year.desc(), BudgetReserveRule.effective_month.desc())
        .first()
    )


def _build_plan(db: Session, user_id: int, year: int, month: int) -> MonthlyBudgetPlanOut:
    _month_bounds(year, month)
    plan = _get_plan(db, user_id, year, month)
    candidates = _income_candidates(db, user_id, year, month)
    selected_ids = {
        row.transaction_id
        for row in (plan.selected_incomes if plan else [])
    }
    reserve_ids = {
        row.transaction_id
        for row in (plan.selected_incomes if plan else [])
        if row.include_in_reserve
    }
    candidate_output = [
        BudgetIncomeCandidateOut(
            transaction_id=transaction.id,
            description=transaction.description,
            date=transaction.date,
            amount=_money(transaction.amount),
            selected=transaction.id in selected_ids,
            included_in_reserve=transaction.id in reserve_ids,
            received=transaction.date <= date.today(),
        )
        for transaction in candidates
    ]
    selected_candidates = [item for item in candidate_output if item.selected]
    reserve_candidates = [item for item in selected_candidates if item.included_in_reserve]
    received_candidates = [item for item in selected_candidates if item.received]
    pending_candidates = [item for item in selected_candidates if not item.received]
    income_mode = plan.income_mode if plan else "transactions"
    manual_income = _money(plan.manual_income) if plan and plan.manual_income is not None else None
    expected_income = _money(plan.expected_income) if plan and plan.expected_income is not None else None
    selected_income_total = _money(sum((item.amount for item in selected_candidates), Decimal("0.00")))
    pending_income = _money(sum((item.amount for item in pending_candidates), Decimal("0.00")))
    received_income = _money(manual_income) if income_mode == "manual" else _money(sum((item.amount for item in received_candidates), Decimal("0.00")))
    has_actual_income = received_income > 0
    transaction_planning_income = selected_income_total
    active_income = received_income if income_mode == "manual" else transaction_planning_income
    planning_income = active_income if active_income > 0 else _money(expected_income)
    reserve_base_income = (
        planning_income
        if income_mode == "manual" or active_income <= 0
        else _money(sum((item.amount for item in reserve_candidates), Decimal("0.00")))
    )
    is_estimated = (
        (income_mode == "transactions" and pending_income > 0)
        or (active_income <= 0 and planning_income > 0)
    )

    rule = _reserve_rule(db, user_id, year, month)
    rule_type = rule.rule_type if rule else "percentage"
    rule_value = _money(rule.value) if rule else Decimal("0.00")
    if rule_type == "percentage":
        reserve_requested = _money(reserve_base_income * rule_value / Decimal("100"))
    else:
        reserve_requested = rule_value
    reserve_amount = min(reserve_requested, reserve_base_income) if reserve_base_income > 0 else Decimal("0.00")
    available_budget = max(planning_income - reserve_amount, Decimal("0.00"))

    return MonthlyBudgetPlanOut(
        year=year,
        month=month,
        income_mode=income_mode,
        manual_income=manual_income,
        expected_income=expected_income,
        income_candidates=candidate_output,
        selected_income_count=len(selected_candidates),
        received_income_count=len(received_candidates) if income_mode == "transactions" else (1 if has_actual_income else 0),
        received_income=received_income,
        pending_income=pending_income if income_mode == "transactions" else Decimal("0.00"),
        selected_income_total=selected_income_total,
        planning_income=planning_income,
        reserve_base_income=reserve_base_income,
        reserve_income_count=len(reserve_candidates) if income_mode == "transactions" and active_income > 0 else 0,
        has_actual_income=has_actual_income,
        is_estimated=is_estimated,
        reserve_rule=BudgetReserveRuleOut(
            rule_type=rule_type,
            value=rule_value,
            effective_year=rule.effective_year if rule else None,
            effective_month=rule.effective_month if rule else None,
        ),
        reserve_requested=reserve_requested,
        reserve_amount=_money(reserve_amount),
        reserve_capped=reserve_base_income > 0 and reserve_requested > reserve_base_income,
        available_budget=_money(available_budget),
    )


@router.get("/{year}/{month}", response_model=MonthlyBudgetPlanOut)
def get_monthly_budget_plan(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _build_plan(db, current_user.id, year, month)


@router.put("/{year}/{month}", response_model=MonthlyBudgetPlanOut)
def update_monthly_budget_plan(
    year: int,
    month: int,
    payload: MonthlyBudgetPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _month_bounds(year, month)
    plan = _get_or_create_plan(db, current_user.id, year, month)
    data = payload.model_dump(exclude_unset=True)

    if "income_mode" in data:
        plan.income_mode = data["income_mode"]
    if "manual_income" in data:
        plan.manual_income = data["manual_income"]
    if "expected_income" in data:
        plan.expected_income = data["expected_income"]
    if "transaction_ids" in data:
        requested_ids = set(data["transaction_ids"] or [])
        candidate_ids = {transaction.id for transaction in _income_candidates(db, current_user.id, year, month)}
        invalid_ids = requested_ids - candidate_ids
        if invalid_ids:
            raise HTTPException(status_code=422, detail="Only income transactions from configured income categories in the selected month can be selected")
        previous_ids = {row.transaction_id for row in plan.selected_incomes}
        previous_reserve_ids = {row.transaction_id for row in plan.selected_incomes if row.include_in_reserve}
        if "reserve_transaction_ids" in data:
            reserve_ids = set(data["reserve_transaction_ids"] or [])
        else:
            reserve_ids = (previous_reserve_ids & requested_ids) | (requested_ids - previous_ids)
        if not reserve_ids.issubset(requested_ids):
            raise HTTPException(status_code=422, detail="Reserve income transactions must also be selected for the monthly budget")
        db.query(MonthlyBudgetIncome).filter(MonthlyBudgetIncome.plan_id == plan.id).delete(synchronize_session=False)
        db.add_all([
            MonthlyBudgetIncome(
                plan_id=plan.id,
                transaction_id=transaction_id,
                include_in_reserve=transaction_id in reserve_ids,
            )
            for transaction_id in sorted(requested_ids)
        ])
    elif "reserve_transaction_ids" in data:
        reserve_ids = set(data["reserve_transaction_ids"] or [])
        selected_rows = list(plan.selected_incomes)
        selected_ids = {row.transaction_id for row in selected_rows}
        if not reserve_ids.issubset(selected_ids):
            raise HTTPException(status_code=422, detail="Reserve income transactions must also be selected for the monthly budget")
        for row in selected_rows:
            row.include_in_reserve = row.transaction_id in reserve_ids

    db.commit()
    return _build_plan(db, current_user.id, year, month)


@router.put("/{year}/{month}/reserve-rule", response_model=MonthlyBudgetPlanOut)
def update_budget_reserve_rule(
    year: int,
    month: int,
    payload: BudgetReserveRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _month_bounds(year, month)
    if payload.rule_type == "percentage" and payload.value > 100:
        raise HTTPException(status_code=422, detail="Reserve percentage cannot exceed 100")
    rule = (
        db.query(BudgetReserveRule)
        .filter(
            BudgetReserveRule.user_id == current_user.id,
            BudgetReserveRule.effective_year == year,
            BudgetReserveRule.effective_month == month,
        )
        .first()
    )
    if not rule:
        rule = BudgetReserveRule(
            user_id=current_user.id,
            effective_year=year,
            effective_month=month,
        )
        db.add(rule)
    rule.rule_type = payload.rule_type
    rule.value = payload.value
    db.commit()
    return _build_plan(db, current_user.id, year, month)
