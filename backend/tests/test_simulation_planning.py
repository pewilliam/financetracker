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
    category_id=None,
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
        category_id=category_id,
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
    def test_fixed_categories_distribute_all_free_money(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[
                RealMonth(month="2026-09", total_income=900, total_expenses=400, projected_closing=500),
            ],
            items=[],
            reserve_mode="fixed",
            reserve_value=0,
            allocation_categories=[
                {"id": "games", "name": "Jogos", "mode": "fixed", "value": 200},
                {"id": "dates", "name": "Namorada", "mode": "fixed", "value": 300},
            ],
        )
        row = result["rows"][0]
        self.assertEqual(row["planned_reserve"], Decimal("0.00"))
        self.assertEqual(row["free_money"], Decimal("500.00"))
        self.assertEqual(
            [category["allocated"] for category in row["category_allocations"]],
            [Decimal("200.00"), Decimal("300.00")],
        )
        self.assertEqual(result["summary"]["total_free_money_before_allocations"], Decimal("500.00"))

    def test_percentage_categories_distribute_free_money(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[
                RealMonth(month="2026-09", total_income=900, total_expenses=400, projected_closing=500),
                RealMonth(month="2026-10", total_income=900, total_expenses=400, projected_closing=1000),
            ],
            items=[],
            reserve_mode="fixed",
            reserve_value=0,
            allocation_categories=[
                {"id": "games", "name": "Jogos", "mode": "percentage", "value": 40},
                {"id": "dates", "name": "Namorada", "mode": "percentage", "value": 60},
            ],
        )
        self.assertEqual([row["free_money"] for row in result["rows"]], [Decimal("500.00"), Decimal("500.00")])
        summaries = result["summary"]["category_summaries"]
        self.assertEqual(summaries[0]["current_month_allocated"], Decimal("200.00"))
        self.assertEqual(summaries[0]["total_allocated"], Decimal("400.00"))
        self.assertEqual(summaries[1]["current_month_allocated"], Decimal("300.00"))
        self.assertEqual(summaries[1]["total_allocated"], Decimal("600.00"))

    def test_categories_can_exist_without_a_reserve(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[RealMonth(month="2026-09", total_income=900, total_expenses=400, projected_closing=500)],
            items=[],
            reserve_mode="fixed",
            reserve_value=0,
            allocation_categories=[{"id": "games", "name": "Jogos", "mode": "fixed", "value": 200}],
        )
        self.assertEqual(result["rows"][0]["free_money"], Decimal("500.00"))
        self.assertEqual(result["rows"][0]["category_allocations"][0]["allocated"], Decimal("200.00"))
        self.assertEqual(result["summary"]["category_summaries"][0]["total_allocated"], Decimal("200.00"))

    def test_categories_do_not_reduce_free_money_twice(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[RealMonth(month="2026-09", total_income=1000, total_expenses=0, projected_closing=1000)],
            items=[],
            reserve_mode="fixed",
            reserve_value=200,
            allocation_categories=[{"id": "games", "name": "Jogos", "mode": "fixed", "value": 200}],
        )
        self.assertEqual(result["rows"][0]["planned_reserve"], Decimal("200.00"))
        self.assertEqual(result["rows"][0]["category_allocations"][0]["allocated"], Decimal("200.00"))
        self.assertEqual(result["rows"][0]["free_money"], Decimal("800.00"))
        self.assertEqual(result["rows"][0]["unplanned_free_money"], Decimal("600.00"))
        self.assertEqual(result["summary"]["total_unplanned_free_money"], Decimal("600.00"))

    def test_unplanned_free_money_is_the_remainder_after_categories(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[RealMonth(month="2026-09", total_income=900, total_expenses=400, projected_closing=500)],
            items=[],
            reserve_mode="fixed",
            reserve_value=0,
            allocation_categories=[
                {"id": "games", "name": "Jogos", "mode": "fixed", "value": 200},
                {"id": "leisure", "name": "Lazer", "mode": "fixed", "value": 150},
            ],
        )
        row = result["rows"][0]
        self.assertEqual(row["free_money"], Decimal("500.00"))
        self.assertEqual(row["unplanned_free_money"], Decimal("150.00"))
        self.assertEqual(result["summary"]["current_unplanned_free_money"], Decimal("150.00"))

    def test_categorized_expense_is_deducted_from_selected_category(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[RealMonth(month="2026-09", total_income=1000, total_expenses=0, projected_closing=1000)],
            items=[item(amount="150.76", category_id="dates")],
            reserve_mode="fixed",
            reserve_value=0,
            allocation_categories=[
                {"id": "games", "name": "Jogos", "mode": "fixed", "value": 200},
                {"id": "dates", "name": "Saída com Namorada", "mode": "fixed", "value": 300},
            ],
        )
        row = result["rows"][0]
        self.assertEqual(row["free_money"], Decimal("849.24"))
        self.assertEqual(
            [category["allocated"] for category in row["category_allocations"]],
            [Decimal("200.00"), Decimal("149.24")],
        )
        self.assertEqual(row["unplanned_free_money"], Decimal("500.00"))

    def test_percentage_category_uses_balance_before_its_expense(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[RealMonth(month="2026-09", total_income=1000, total_expenses=0, projected_closing=1000)],
            items=[item(amount="100", category_id="games")],
            reserve_mode="fixed",
            reserve_value=0,
            allocation_categories=[
                {"id": "games", "name": "Jogos", "mode": "percentage", "value": 40},
                {"id": "dates", "name": "Saída com Namorada", "mode": "percentage", "value": 60},
            ],
        )
        row = result["rows"][0]
        self.assertEqual(
            [category["allocated"] for category in row["category_allocations"]],
            [Decimal("300.00"), Decimal("600.00")],
        )
        self.assertEqual(row["unplanned_free_money"], Decimal("0.00"))

    def test_category_can_show_overspending_without_reducing_unplanned_money(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[RealMonth(month="2026-09", total_income=1000, total_expenses=0, projected_closing=1000)],
            items=[item(amount="350", category_id="dates")],
            reserve_mode="fixed",
            reserve_value=0,
            allocation_categories=[{"id": "dates", "name": "Saída com Namorada", "mode": "fixed", "value": 300}],
        )
        row = result["rows"][0]
        self.assertEqual(row["category_allocations"][0]["allocated"], Decimal("-50.00"))
        self.assertEqual(row["unplanned_free_money"], Decimal("700.00"))

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

    def test_simulated_expense_keeps_its_category_in_month_details(self):
        row = calculate(items=[item(amount="230", category_id="games")])["rows"][0]
        self.assertEqual(row["simulated_items"][0]["category_id"], "games")

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
            reserve_source_item_positions=[0],
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
            reserve_source_item_positions=[0],
        )
        self.assertEqual(
            [row["planned_reserve"] for row in result["rows"]],
            [Decimal("300.00"), Decimal("0.00")],
        )

    def test_percentage_reserve_can_sum_multiple_simulated_incomes(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[
                RealMonth(month="2026-09", total_income=2000, total_expenses=400, projected_closing=1600),
            ],
            items=[
                item(item_type="income", mode="cash", amount="1000"),
                item(item_type="income", mode="cash", amount="500"),
            ],
            reserve_mode="percentage",
            reserve_value=50,
            reserve_source_item_positions=[0, 1],
        )
        row = result["rows"][0]
        self.assertEqual(row["reserve_base_income"], Decimal("1500.00"))
        self.assertEqual(row["planned_reserve"], Decimal("750.00"))
        self.assertEqual(result["summary"]["average_reserve_rate"], Decimal("50.00"))

    def test_reserve_stops_after_selected_end_month(self):
        result = calculate_planning(
            current_balance=0,
            include_real=True,
            real_months=[
                RealMonth(month=f"2026-{month:02d}", total_income=1850, total_expenses=400, projected_closing=1450)
                for month in range(9, 12)
            ],
            items=[],
            reserve_mode="percentage",
            reserve_value=50,
            reserve_start_month="2026-09",
            reserve_end_month="2026-10",
        )
        self.assertEqual(
            [row["planned_reserve"] for row in result["rows"]],
            [Decimal("925.00"), Decimal("925.00"), Decimal("0.00")],
        )
        self.assertFalse(result["rows"][2]["reserve_active"])
        self.assertEqual(result["summary"]["total_planned_reserve"], Decimal("1850.00"))


if __name__ == "__main__":
    unittest.main()
