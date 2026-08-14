import unittest
from decimal import Decimal
from types import SimpleNamespace

from app.services.simulations import RealMonth, calculate_planning


def item(
    *,
    item_type="expense",
    mode="cash",
    amount="0",
    start_month="2026-09",
    installments=1,
    recurrences=1,
    value_mode="equal",
    custom_values=None,
):
    return SimpleNamespace(
        description="Item de teste",
        type=item_type,
        mode=mode,
        total_amount=Decimal(amount),
        installment_count=installments,
        recurrence_count=recurrences,
        value_mode=value_mode,
        start_month=start_month,
        custom_values=custom_values or [],
    )


def calculate(*, income="1850", expenses="400", mode="percentage", reserve="50", items=None):
    return calculate_planning(
        current_balance=Decimal("1000"),
        include_real=True,
        real_months=[
            RealMonth(
                month="2026-09",
                total_income=Decimal(income),
                total_expenses=Decimal(expenses),
                projected_closing=Decimal("2450"),
            )
        ],
        items=items or [],
        reserve_mode=mode,
        reserve_value=Decimal(reserve),
    )


class SimulationPlanningTests(unittest.TestCase):
    def test_percentage_reserve(self):
        row = calculate()["rows"][0]
        self.assertEqual(row["planned_reserve"], Decimal("925.00"))

    def test_free_money(self):
        row = calculate()["rows"][0]
        self.assertEqual(row["free_money"], Decimal("525.00"))

    def test_fixed_reserve(self):
        row = calculate(mode="fixed", reserve="500")["rows"][0]
        self.assertEqual(row["planned_reserve"], Decimal("500.00"))
        self.assertEqual(row["free_money"], Decimal("950.00"))

    def test_negative_free_money_does_not_reduce_projected_balance(self):
        result = calculate(expenses="1000")
        row = result["rows"][0]
        self.assertEqual(row["free_money"], Decimal("-75.00"))
        self.assertTrue(row["reserve_unsustainable"])
        self.assertEqual(row["final_balance"], Decimal("2450.00"))

    def test_registered_transactions_are_included(self):
        row = calculate(income="2000", expenses="650", mode="fixed", reserve="300")["rows"][0]
        self.assertEqual(row["income"], Decimal("2000.00"))
        self.assertEqual(row["expenses"], Decimal("650.00"))
        self.assertEqual(row["free_money"], Decimal("1050.00"))

    def test_simulated_expense_changes_free_money_and_balance(self):
        row = calculate(items=[item(amount="230")])["rows"][0]
        self.assertEqual(row["simulated_expenses"], Decimal("230.00"))
        self.assertEqual(row["free_money"], Decimal("295.00"))
        self.assertEqual(row["final_balance"], Decimal("2220.00"))

    def test_installment_is_distributed_across_months(self):
        result = calculate_planning(
            current_balance=0,
            include_real=False,
            real_months=[
                RealMonth(month=f"2026-{month:02d}", total_income=0, total_expenses=0, projected_closing=0)
                for month in range(9, 13)
            ],
            items=[item(mode="installment", amount="373", installments=4)],
            reserve_mode="fixed",
            reserve_value=0,
        )
        self.assertEqual(
            [row["simulated_expenses"] for row in result["rows"]],
            [Decimal("93.25")] * 4,
        )
        self.assertEqual(result["rows"][-1]["final_balance"], Decimal("-373.00"))

    def test_reserve_starts_in_selected_month(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[
                RealMonth(month="2026-09", total_income=1850, total_expenses=400, projected_closing=1450),
                RealMonth(month="2026-10", total_income=1850, total_expenses=400, projected_closing=2900),
            ],
            items=[],
            reserve_mode="percentage",
            reserve_value=50,
            reserve_start_month="2026-10",
        )
        september, october = result["rows"]
        self.assertFalse(september["reserve_active"])
        self.assertEqual(september["planned_reserve"], Decimal("0.00"))
        self.assertEqual(september["free_money"], Decimal("1450.00"))
        self.assertTrue(october["reserve_active"])
        self.assertEqual(october["planned_reserve"], Decimal("925.00"))
        self.assertEqual(october["free_money"], Decimal("525.00"))
        self.assertEqual(result["summary"]["total_planned_reserve"], Decimal("925.00"))

    def test_percentage_reserve_can_use_one_simulated_income(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[
                RealMonth(month="2026-09", total_income=2000, total_expenses=400, projected_closing=1600),
            ],
            items=[
                item(item_type="income", mode="recurring", amount="1000", recurrences=1),
                item(item_type="income", mode="recurring", amount="500", recurrences=1),
            ],
            reserve_mode="percentage",
            reserve_value=50,
            reserve_source_item_position=0,
        )
        row = result["rows"][0]
        self.assertEqual(row["income"], Decimal("3500.00"))
        self.assertEqual(row["reserve_base_income"], Decimal("1000.00"))
        self.assertEqual(row["planned_reserve"], Decimal("500.00"))
        self.assertEqual(result["summary"]["average_reserve_rate"], Decimal("50.00"))

    def test_fixed_reserve_uses_only_months_with_selected_income(self):
        result = calculate_planning(
            current_balance=0,
            include_real=False,
            real_months=[
                RealMonth(month="2026-09", total_income=0, total_expenses=0, projected_closing=0),
                RealMonth(month="2026-10", total_income=0, total_expenses=0, projected_closing=0),
            ],
            items=[item(item_type="income", mode="cash", amount="1000")],
            reserve_mode="fixed",
            reserve_value=300,
            reserve_source_item_position=0,
        )
        self.assertEqual(
            [row["planned_reserve"] for row in result["rows"]],
            [Decimal("300.00"), Decimal("0.00")],
        )


if __name__ == "__main__":
    unittest.main()
