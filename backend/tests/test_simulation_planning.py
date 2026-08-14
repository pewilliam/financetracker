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


if __name__ == "__main__":
    unittest.main()
