from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable


CENT = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def month_index(month_value: str) -> int:
    year, month = (int(part) for part in month_value.split("-"))
    return year * 12 + month - 1


def month_from_index(index: int) -> str:
    year, zero_based_month = divmod(index, 12)
    return f"{year:04d}-{zero_based_month + 1:02d}"


def split_amount(total, count: int) -> list[Decimal]:
    total_cents = int(money(total) * 100)
    safe_count = max(1, int(count or 1))
    base_cents = total_cents // safe_count
    return [
        Decimal(
            total_cents - (base_cents * (safe_count - 1))
            if index == safe_count - 1
            else base_cents
        ) / 100
        for index in range(safe_count)
    ]


def item_values(item) -> list[Decimal]:
    count = 1
    if item.mode == "installment":
        count = max(1, int(item.installment_count or 1))
    elif item.mode == "recurring":
        count = max(1, int(item.recurrence_count or 1))

    if item.mode == "installment":
        equal_values = split_amount(item.total_amount, count)
    elif item.mode == "recurring":
        equal_values = [money(item.total_amount) for _ in range(count)]
    else:
        equal_values = [money(item.total_amount)]

    if item.mode == "cash" or item.value_mode != "different":
        return equal_values

    custom_values = list(item.custom_values or [])
    return [
        money(custom_values[index]) if index < len(custom_values) else equal_values[index]
        for index in range(count)
    ]


def build_item_impacts(
    items: Iterable,
    reserve_source_item_positions: Iterable[int] | None = None,
) -> dict[str, dict]:
    impacts: dict[str, dict] = {}
    source_positions = set(reserve_source_item_positions or [])
    for item_index, item in enumerate(items):
        values = item_values(item)
        description = (item.description or "").strip() or "Item simulado"
        for value_index, value in enumerate(values):
            amount = money(value)
            if not amount:
                continue
            month = month_from_index(month_index(item.start_month) + value_index)
            impact = impacts.setdefault(
                month,
                {
                    "income": money(0),
                    "expense": money(0),
                    "reserve_source_income": money(0),
                    "category_expenses": {},
                    "items": [],
                },
            )
            impact[item.type] += amount
            category_id = getattr(item, "category_id", None)
            if item.type == "expense" and category_id:
                impact["category_expenses"][category_id] = money(
                    impact["category_expenses"].get(category_id, money(0)) + amount
                )
            if item_index in source_positions and item.type == "income":
                impact["reserve_source_income"] += amount
            impact["items"].append(
                {
                    "id": f"{item_index}-{value_index}",
                    "description": description,
                    "type": item.type,
                    "amount": amount,
                    "installment_label": (
                        f"{value_index + 1}/{len(values)}" if item.mode != "cash" else None
                    ),
                    "period_type": "month" if item.mode == "recurring" else "installment",
                    "category_id": category_id,
                }
            )
    return impacts


@dataclass(frozen=True)
class RealMonth:
    month: str
    total_income: Decimal
    total_expenses: Decimal
    projected_closing: Decimal


def calculate_planning(
    *,
    current_balance,
    include_real: bool,
    real_months: Iterable[RealMonth],
    items: Iterable,
    reserve_mode: str,
    reserve_value,
    reserve_start_month: str | None = None,
    reserve_end_month: str | None = None,
    reserve_source_item_positions: Iterable[int] | None = None,
    allocation_categories: Iterable | None = None,
) -> dict:
    """Calculate balances and category allocations, consuming the selected category first."""
    starting_balance = money(current_balance)
    reserve_setting = money(reserve_value)
    source_positions = set(reserve_source_item_positions or [])
    categories = []
    for position, category in enumerate(allocation_categories or []):
        raw = category if isinstance(category, dict) else category.model_dump()
        categories.append(
            {
                "id": str(raw.get("id") or f"category-{position + 1}"),
                "name": str(raw.get("name") or "Categoria").strip() or "Categoria",
                "mode": "percentage" if raw.get("mode") == "percentage" else "fixed",
                "value": money(raw.get("value")),
            }
        )
    uses_categories = bool(categories)
    impacts = build_item_impacts(items, source_positions)
    rows = []
    simulated_carry = money(0)
    reserve_accumulated = money(0)
    category_accumulated = {category["id"]: money(0) for category in categories}

    for real_month in real_months:
        impact = impacts.get(
            real_month.month,
            {
                "income": money(0),
                "expense": money(0),
                "reserve_source_income": money(0),
                "category_expenses": {},
                "items": [],
            },
        )
        real_income = money(real_month.total_income) if include_real else money(0)
        real_expenses = money(real_month.total_expenses) if include_real else money(0)
        simulated_income = money(impact["income"])
        simulated_expenses = money(impact["expense"])
        income = money(real_income + simulated_income)
        expenses = money(real_expenses + simulated_expenses)

        reserve_is_active = (
            (reserve_start_month is None or month_index(real_month.month) >= month_index(reserve_start_month))
            and (reserve_end_month is None or month_index(real_month.month) <= month_index(reserve_end_month))
        )
        reserve_base_income = (
            income
            if not source_positions
            else money(impact["reserve_source_income"])
        )
        if not reserve_is_active:
            planned_reserve = money(0)
        elif reserve_mode == "percentage":
            planned_reserve = money(reserve_base_income * reserve_setting / Decimal("100"))
        elif source_positions and reserve_base_income <= 0:
            planned_reserve = money(0)
        else:
            planned_reserve = reserve_setting

        baseline_reserve = money(0)
        if reserve_is_active and not source_positions:
            baseline_reserve = (
                money(real_income * reserve_setting / Decimal("100"))
                if reserve_mode == "percentage"
                else reserve_setting
            )
        free_before_allocations = money(income - expenses)
        free_before_simulation = money(real_income - real_expenses - baseline_reserve)
        free_money = money(free_before_allocations - planned_reserve)
        reserve_accumulated = money(reserve_accumulated + planned_reserve)

        category_allocations = []
        category_expenses = impact.get("category_expenses", {})
        total_category_expenses = money(sum(category_expenses.values(), Decimal("0")))
        free_money_before_category_expenses = money(free_money + total_category_expenses)
        remaining_free_money = max(free_money_before_category_expenses, money(0))
        for category in categories:
            requested = (
                money(max(free_money_before_category_expenses, money(0)) * category["value"] / Decimal("100"))
                if category["mode"] == "percentage"
                else category["value"]
            )
            planned_allocation = money(min(max(requested, money(0)), remaining_free_money))
            remaining_free_money = money(remaining_free_money - planned_allocation)
            allocated = money(planned_allocation - category_expenses.get(category["id"], money(0)))
            category_accumulated[category["id"]] = money(category_accumulated[category["id"]] + allocated)
            category_allocations.append(
                {
                    **category,
                    "allocated": allocated,
                    "accumulated": category_accumulated[category["id"]],
                }
            )

        without_simulation = (
            money(real_month.projected_closing) if include_real else starting_balance
        )
        initial_balance = money(without_simulation + simulated_carry)
        simulated_carry = money(simulated_carry + simulated_income - simulated_expenses)
        final_balance = money(without_simulation + simulated_carry)
        monthly_rate = (
            (planned_reserve / reserve_base_income * Decimal("100")).quantize(CENT, rounding=ROUND_HALF_UP)
            if reserve_base_income > 0
            else money(0)
        )

        rows.append(
            {
                "month": real_month.month,
                "initial_balance": initial_balance,
                "real_income": real_income,
                "real_expenses": real_expenses,
                "simulated_income": simulated_income,
                "simulated_expenses": simulated_expenses,
                "income": income,
                "expenses": expenses,
                "planned_reserve": planned_reserve,
                "reserve_accumulated": reserve_accumulated,
                "free_money": free_money,
                "reserve_rate": monthly_rate,
                "reserve_active": reserve_is_active,
                "reserve_base_income": reserve_base_income,
                "without_simulation": without_simulation,
                "final_balance": final_balance,
                "difference": money(final_balance - without_simulation),
                "reserve_unsustainable": free_money < 0,
                "simulation_caused_negative": free_money < 0 <= free_before_simulation,
                "category_allocations": category_allocations,
                "unplanned_free_money": money(free_money - sum((entry["allocated"] for entry in category_allocations), Decimal("0"))),
                "simulated_items": impact["items"],
            }
        )

    total_reserve = money(sum((row["planned_reserve"] for row in rows), Decimal("0")))
    total_free = money(sum((row["free_money"] for row in rows), Decimal("0")))
    total_free_before_allocations = money(
        sum((row["income"] - row["expenses"] for row in rows), Decimal("0"))
    )
    total_categorized_free_money = money(sum(category_accumulated.values(), Decimal("0")))
    total_reserve_base_income = money(
        sum((row["reserve_base_income"] for row in rows if row["reserve_active"]), Decimal("0"))
    )
    average_free = money(total_free / len(rows)) if rows else money(0)
    average_rate = (
        (total_reserve / total_reserve_base_income * Decimal("100")).quantize(CENT, rounding=ROUND_HALF_UP)
        if total_reserve_base_income > 0
        else money(0)
    )
    worst_free_row = min(rows, key=lambda row: row["free_money"], default=None)
    best_free_row = max(rows, key=lambda row: row["free_money"], default=None)
    worst_balance_row = min(rows, key=lambda row: row["final_balance"], default=None)
    final_row = rows[-1] if rows else None
    category_summaries = []
    if uses_categories:
        first_allocations = {
            allocation["id"]: allocation for allocation in (rows[0]["category_allocations"] if rows else [])
        }
        for category in categories:
            category_summaries.append(
                {
                    **category,
                    "current_month_allocated": first_allocations.get(category["id"], {}).get("allocated", money(0)),
                    "total_allocated": category_accumulated[category["id"]],
                }
            )
    current_categorized_free_money = money(
        sum((allocation["allocated"] for allocation in (rows[0]["category_allocations"] if rows else [])), Decimal("0"))
    )

    return {
        "rows": rows,
        "summary": {
            "current_balance": starting_balance,
            "projected_balance": final_row["final_balance"] if final_row else starting_balance,
            "baseline_projected_balance": final_row["without_simulation"] if final_row else starting_balance,
            "simulated_impact": final_row["difference"] if final_row else money(0),
            "total_planned_reserve": total_reserve,
            "total_free_money": total_free,
            "total_free_money_before_allocations": total_free_before_allocations,
            "current_unplanned_free_money": money((rows[0]["free_money"] if rows else money(0)) - current_categorized_free_money),
            "total_unplanned_free_money": money(total_free - total_categorized_free_money),
            "total_reserve_base_income": total_reserve_base_income,
            "average_free_money": average_free,
            "average_reserve_rate": average_rate,
            "maximum_free_money": best_free_row["free_money"] if best_free_row else money(0),
            "minimum_free_money": worst_free_row["free_money"] if worst_free_row else money(0),
            "best_free_month": best_free_row["month"] if best_free_row else None,
            "worst_free_month": worst_free_row["month"] if worst_free_row else None,
            "worst_balance_month": worst_balance_row["month"] if worst_balance_row else None,
            "minimum_balance": worst_balance_row["final_balance"] if worst_balance_row else starting_balance,
            "negative_free_months": [row["month"] for row in rows if row["free_money"] < 0],
            "simulation_negative_months": [row["month"] for row in rows if row["simulation_caused_negative"]],
            "category_summaries": category_summaries,
        },
    }
