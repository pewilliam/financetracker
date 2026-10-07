"""Read-only financial projection for a desired-product offer."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Callable

from app.services.desired_products import _total_cost
from app.services.simulations import RealMonth, calculate_planning, month_from_index, month_index


CENT = Decimal("0.01")


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PurchaseProjectionItem:
    description: str
    type: str
    mode: str
    total_amount: Decimal
    installment_count: int
    recurrence_count: int
    value_mode: str
    start_month: str
    custom_values: list
    category_id: None = None


def analyze_offer_purchase(
    product,
    offer,
    first_payment_date: date,
    month_summary: Callable[[int, int], object],
    budget_plan: Callable[[int, int], object],
    category_breakdown: Callable[[int, int], object],
) -> dict:
    """Project one saved offer over its payment months using the shared simulation engine."""
    installment_count = int(offer.installment_count or 1) if offer.payment_method == "credit" else 1
    start_month = first_payment_date.strftime("%Y-%m")
    start_index = month_index(start_month)
    real_months = []
    budget_plans = {}
    category_expenses = {}
    for offset in range(installment_count):
        month_value = month_from_index(start_index + offset)
        year, month = (int(part) for part in month_value.split("-"))
        summary = month_summary(year, month)
        budget_plans[month_value] = budget_plan(year, month)
        category_expenses[month_value] = _money(category_breakdown(year, month).total_expenses)
        real_months.append(
            RealMonth(
                month=month_value,
                total_income=_money(summary.total_income),
                total_expenses=_money(summary.total_expenses),
                projected_closing=_money(summary.projected_closing),
            )
        )

    total_cost = _total_cost(offer)
    item = PurchaseProjectionItem(
        description=product.name,
        type="expense",
        mode="installment" if installment_count > 1 else "cash",
        total_amount=total_cost,
        installment_count=installment_count,
        recurrence_count=1,
        value_mode="equal",
        start_month=start_month,
        custom_values=[],
    )
    planning = calculate_planning(
        current_balance=real_months[0].projected_closing if real_months else Decimal("0.00"),
        include_real=True,
        real_months=real_months,
        items=[item],
        reserve_mode="fixed",
        reserve_value=Decimal("0.00"),
    )

    rows = []
    for position, row in enumerate(planning["rows"], start=1):
        monthly_impact = _money(row["simulated_expenses"])
        real_income = _money(row["real_income"])
        month_budget = budget_plans[row["month"]]
        budget_configured = bool(month_budget.is_configured)
        planning_income = _money(month_budget.planning_income) if budget_configured else real_income
        planned_reserve = _money(month_budget.reserve_amount) if budget_configured else Decimal("0.00")
        available_budget = _money(month_budget.available_budget) if budget_configured else planning_income
        registered_expenses = category_expenses[row["month"]]
        free_before = _money(available_budget - registered_expenses)
        free_after = _money(free_before - monthly_impact)
        commitment = (
            (monthly_impact / planning_income * Decimal("100")).quantize(CENT, rounding=ROUND_HALF_UP)
            if planning_income > 0
            else None
        )
        rows.append({
            "month": row["month"],
            "installment_number": position,
            "installment_count": installment_count,
            "amount": monthly_impact,
            "registered_income": real_income,
            "registered_expenses": registered_expenses,
            "budget_configured": budget_configured,
            "planning_income": planning_income,
            "planned_reserve": planned_reserve,
            "available_budget": available_budget,
            "free_before": free_before,
            "free_after": free_after,
            "baseline_projected_closing": _money(row["without_simulation"]),
            "projected_closing": _money(row["final_balance"]),
            "cumulative_impact": _money(row["difference"]),
            "income_commitment_percent": commitment,
            "negative_balance": row["final_balance"] < 0,
            "negative_free_money": free_after < 0,
        })

    negative_balance_months = [row["month"] for row in rows if row["negative_balance"]]
    negative_free_months = [row["month"] for row in rows if row["negative_free_money"]]
    status = "critical" if negative_balance_months else "attention" if negative_free_months else "safe"
    worst = min(rows, key=lambda row: row["projected_closing"], default=None)
    last = rows[-1] if rows else None
    return {
        "offer_id": offer.id,
        "store": offer.store,
        "payment_method": offer.payment_method,
        "first_payment_date": first_payment_date,
        "first_payment_month": start_month,
        "last_payment_month": rows[-1]["month"] if rows else start_month,
        "installment_count": installment_count,
        "total_cost": total_cost,
        "average_installment": _money(total_cost / installment_count),
        "status": status,
        "baseline_final_balance": last["baseline_projected_closing"] if last else Decimal("0.00"),
        "projected_final_balance": last["projected_closing"] if last else Decimal("0.00"),
        "minimum_projected_balance": worst["projected_closing"] if worst else Decimal("0.00"),
        "worst_month": worst["month"] if worst else None,
        "negative_balance_months": negative_balance_months,
        "negative_free_months": negative_free_months,
        "rows": rows,
    }
