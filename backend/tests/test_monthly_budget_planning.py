import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Category, Transaction, User
from app.routers.budgets import get_monthly_budget_plan, update_budget_reserve_rule, update_monthly_budget_plan
from app.schemas.budgets import BudgetReserveRuleUpdate, MonthlyBudgetPlanUpdate


def next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


class MonthlyBudgetPlanningTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Planejamento", email="planning@example.com", password_hash="hash")
        self.income_category = Category(user=self.user, name="Renda", color="#14A078")
        self.other_category = Category(user=self.user, name="Reembolsos", color="#3B82F6")
        self.db.add_all([self.user, self.income_category, self.other_category])
        self.db.flush()
        today = date.today()
        self.salary = Transaction(
            user_id=self.user.id,
            date=today,
            type="income",
            amount=Decimal("1782.40"),
            description="Salário",
            category_id=self.income_category.id,
        )
        self.extra = Transaction(
            user_id=self.user.id,
            date=today,
            type="income",
            amount=Decimal("120.00"),
            description="Renda extra",
            category_id=self.income_category.id,
        )
        self.refund = Transaction(
            user_id=self.user.id,
            date=today,
            type="income",
            amount=Decimal("85.00"),
            description="Reembolso",
            category_id=self.other_category.id,
        )
        self.db.add_all([self.salary, self.extra, self.refund])
        self.db.commit()
        self.year = today.year
        self.month = today.month

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_only_selected_received_income_transactions_compose_budget(self):
        initial = get_monthly_budget_plan(self.year, self.month, self.db, self.user)
        self.assertEqual([item.description for item in initial.income_candidates], ["Salário", "Renda extra"])
        self.assertEqual(initial.received_income, Decimal("0.00"))

        result = update_monthly_budget_plan(
            self.year,
            self.month,
            MonthlyBudgetPlanUpdate(transaction_ids=[self.salary.id, self.extra.id]),
            self.db,
            self.user,
        )

        self.assertEqual(result.received_income, Decimal("1902.40"))
        self.assertEqual(result.selected_income_count, 2)
        self.assertTrue(result.has_actual_income)
        self.assertFalse(result.is_estimated)

    def test_switching_manual_and_transaction_modes_preserves_both_sources(self):
        update_monthly_budget_plan(
            self.year,
            self.month,
            MonthlyBudgetPlanUpdate(transaction_ids=[self.salary.id]),
            self.db,
            self.user,
        )
        manual = update_monthly_budget_plan(
            self.year,
            self.month,
            MonthlyBudgetPlanUpdate(income_mode="manual", manual_income=Decimal("2000.00")),
            self.db,
            self.user,
        )
        self.assertEqual(manual.received_income, Decimal("2000.00"))

        transactions = update_monthly_budget_plan(
            self.year,
            self.month,
            MonthlyBudgetPlanUpdate(income_mode="transactions"),
            self.db,
            self.user,
        )
        self.assertEqual(transactions.received_income, Decimal("1782.40"))
        self.assertEqual(transactions.manual_income, Decimal("2000.00"))
        self.assertEqual(transactions.selected_income_count, 1)

    def test_expected_income_is_estimated_and_fixed_reserve_never_makes_budget_negative(self):
        estimated = update_monthly_budget_plan(
            self.year,
            self.month,
            MonthlyBudgetPlanUpdate(expected_income=Decimal("1750.00")),
            self.db,
            self.user,
        )
        self.assertTrue(estimated.is_estimated)
        self.assertFalse(estimated.has_actual_income)
        self.assertEqual(estimated.available_budget, Decimal("1750.00"))

        capped = update_budget_reserve_rule(
            self.year,
            self.month,
            BudgetReserveRuleUpdate(rule_type="fixed", value=Decimal("2000.00")),
            self.db,
            self.user,
        )
        self.assertEqual(capped.reserve_requested, Decimal("2000.00"))
        self.assertEqual(capped.reserve_amount, Decimal("1750.00"))
        self.assertEqual(capped.available_budget, Decimal("0.00"))
        self.assertTrue(capped.reserve_capped)

    def test_reserve_rule_repeats_forward_and_selected_income_stays_in_its_month(self):
        update_monthly_budget_plan(
            self.year,
            self.month,
            MonthlyBudgetPlanUpdate(transaction_ids=[self.salary.id]),
            self.db,
            self.user,
        )
        current = update_budget_reserve_rule(
            self.year,
            self.month,
            BudgetReserveRuleUpdate(rule_type="percentage", value=Decimal("20.00")),
            self.db,
            self.user,
        )
        self.assertEqual(current.reserve_amount, Decimal("356.48"))
        self.assertEqual(current.available_budget, Decimal("1425.92"))

        next_year, next_month_value = next_month(self.year, self.month)
        following = get_monthly_budget_plan(next_year, next_month_value, self.db, self.user)
        self.assertEqual(following.reserve_rule.rule_type, "percentage")
        self.assertEqual(following.reserve_rule.value, Decimal("20.00"))
        self.assertEqual(following.received_income, Decimal("0.00"))
        self.assertEqual(following.selected_income_count, 0)

    def test_category_change_removes_selected_transaction_from_calculation(self):
        update_monthly_budget_plan(
            self.year,
            self.month,
            MonthlyBudgetPlanUpdate(transaction_ids=[self.salary.id]),
            self.db,
            self.user,
        )
        self.salary.category_id = self.other_category.id
        self.db.commit()

        result = get_monthly_budget_plan(self.year, self.month, self.db, self.user)
        self.assertEqual(result.received_income, Decimal("0.00"))
        self.assertEqual(result.selected_income_count, 0)
        self.assertNotIn("Salário", [item.description for item in result.income_candidates])

    def test_selected_transaction_amount_changes_without_duplicating_income(self):
        update_monthly_budget_plan(
            self.year,
            self.month,
            MonthlyBudgetPlanUpdate(transaction_ids=[self.salary.id]),
            self.db,
            self.user,
        )
        self.salary.amount = Decimal("1850.00")
        self.db.commit()

        result = get_monthly_budget_plan(self.year, self.month, self.db, self.user)
        self.assertEqual(result.received_income, Decimal("1850.00"))
        self.assertEqual(result.selected_income_count, 1)

        self.db.delete(self.salary)
        self.db.commit()
        after_delete = get_monthly_budget_plan(self.year, self.month, self.db, self.user)
        self.assertEqual(after_delete.received_income, Decimal("0.00"))
        self.assertEqual(after_delete.selected_income_count, 0)

    def test_future_month_income_is_selectable_but_remains_estimated(self):
        next_year, next_month_value = next_month(self.year, self.month)
        future_salary = Transaction(
            user_id=self.user.id,
            date=date(next_year, next_month_value, 1),
            type="income",
            amount=Decimal("1900.00"),
            description="Próximo salário",
            category_id=self.income_category.id,
        )
        self.db.add(future_salary)
        self.db.commit()

        result = get_monthly_budget_plan(next_year, next_month_value, self.db, self.user)
        self.assertEqual(len(result.income_candidates), 1)
        self.assertFalse(result.income_candidates[0].received)
        self.assertFalse(result.income_candidates[0].selected)
        self.assertEqual(result.received_income, Decimal("0.00"))

        planned = update_monthly_budget_plan(
            next_year,
            next_month_value,
            MonthlyBudgetPlanUpdate(transaction_ids=[future_salary.id]),
            self.db,
            self.user,
        )
        self.assertTrue(planned.income_candidates[0].selected)
        self.assertFalse(planned.income_candidates[0].received)
        self.assertEqual(planned.received_income, Decimal("0.00"))
        self.assertEqual(planned.pending_income, Decimal("1900.00"))
        self.assertEqual(planned.planning_income, Decimal("1900.00"))
        self.assertTrue(planned.is_estimated)


if __name__ == "__main__":
    unittest.main()
