import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Receivable, ReceivablePerson, Transaction, User
from app.routers.months import _build_month_data, _build_month_summary, _summarize_month_data


class MonthPlannedReceivablesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="receivables-month@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        self.person = ReceivablePerson(user_id=self.user.id, name="Ana")
        self.db.add(self.person)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_open_receivables_appear_on_due_date_and_affect_projection(self):
        self.db.add_all([
            Transaction(user_id=self.user.id, date=date(2026, 9, 5), type="income", amount=Decimal("1000.00"), description="Salário"),
            Transaction(user_id=self.user.id, date=date(2026, 9, 10), type="expense", amount=Decimal("200.00"), description="Mercado"),
            Transaction(user_id=self.user.id, date=date(2026, 9, 25), type="expense", amount=Decimal("50.00"), description="Futuro", is_future=True),
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Empréstimo",
                total_amount=Decimal("300.00"),
                received_amount=Decimal("0.00"),
                due_date=date(2026, 9, 20),
                status="pending",
            ),
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Já pago",
                total_amount=Decimal("100.00"),
                received_amount=Decimal("100.00"),
                due_date=date(2026, 9, 15),
                status="paid",
            ),
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Parcial",
                total_amount=Decimal("80.00"),
                received_amount=Decimal("30.00"),
                due_date=date(2026, 9, 18),
                status="partial",
            ),
        ])
        self.db.commit()

        data = _build_month_data(self.db, 2026, 9, self.user.id)
        day_20 = next(day for day in data.days if day.date.day == 20)
        day_18 = next(day for day in data.days if day.date.day == 18)
        day_15 = next(day for day in data.days if day.date.day == 15)

        self.assertEqual([(item.description, item.remaining_amount) for item in day_20.planned_receivables], [("Empréstimo", Decimal("300.00"))])
        self.assertEqual([(item.description, item.remaining_amount) for item in day_18.planned_receivables], [("Parcial", Decimal("50.00"))])
        self.assertEqual(day_15.planned_receivables, [])
        self.assertEqual(data.days[11].balance, Decimal("800.00"))
        self.assertEqual(data.days[11].projected_balance, Decimal("800.00"))
        self.assertEqual(day_18.balance, Decimal("800.00"))
        self.assertEqual(day_18.projected_balance, Decimal("850.00"))
        self.assertEqual(day_20.balance, Decimal("800.00"))
        self.assertEqual(day_20.projected_balance, Decimal("1150.00"))
        self.assertEqual(data.days[24].balance, Decimal("750.00"))
        self.assertEqual(data.days[24].projected_balance, Decimal("1100.00"))

        summary = _build_month_summary(self.db, 2026, 9, self.user.id, today=date(2026, 9, 12))
        self.assertEqual(summary, _summarize_month_data(data, today=date(2026, 9, 12)))
        self.assertEqual(summary.current_balance, Decimal("800.00"))
        self.assertEqual(summary.future_net, Decimal("-50.00"))
        self.assertEqual(summary.planned_receivables_total, Decimal("350.00"))
        self.assertEqual(summary.transactions_projected_closing, Decimal("750.00"))
        self.assertEqual(summary.projected_closing, Decimal("1100.00"))

    def test_past_months_keep_planned_rows_but_exclude_them_from_projection(self):
        self.db.add(
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Atrasado",
                total_amount=Decimal("120.00"),
                received_amount=Decimal("0.00"),
                due_date=date(2026, 8, 10),
                status="overdue",
            )
        )
        self.db.commit()

        data = _build_month_data(self.db, 2026, 8, self.user.id)
        day_10 = next(day for day in data.days if day.date.day == 10)
        self.assertEqual(len(day_10.planned_receivables), 1)
        self.assertEqual(data.days[0].projected_balance, data.days[0].balance)
        self.assertEqual(day_10.balance, Decimal("0.00"))
        self.assertEqual(day_10.projected_balance, Decimal("120.00"))

        summary = _build_month_summary(self.db, 2026, 8, self.user.id, today=date(2026, 9, 12))
        self.assertEqual(summary.planned_receivables_total, Decimal("0.00"))
        self.assertEqual(summary.projected_closing, summary.transactions_projected_closing)

    def test_next_month_opening_includes_unpaid_prior_receivables(self):
        self.db.add_all([
            Transaction(user_id=self.user.id, date=date(2026, 8, 5), type="income", amount=Decimal("1000.00"), description="Salário"),
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Empréstimo agosto",
                total_amount=Decimal("300.00"),
                received_amount=Decimal("50.00"),
                due_date=date(2026, 8, 20),
                status="partial",
            ),
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Atrasado julho",
                total_amount=Decimal("120.00"),
                received_amount=Decimal("0.00"),
                due_date=date(2026, 7, 10),
                status="overdue",
            ),
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Já pago",
                total_amount=Decimal("80.00"),
                received_amount=Decimal("80.00"),
                due_date=date(2026, 8, 12),
                status="paid",
            ),
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Setembro",
                total_amount=Decimal("80.00"),
                received_amount=Decimal("0.00"),
                due_date=date(2026, 9, 18),
                status="pending",
            ),
        ])
        self.db.commit()

        september = _build_month_data(self.db, 2026, 9, self.user.id)
        self.assertEqual(september.opening_balance, Decimal("1000.00"))
        self.assertEqual(september.prior_planned_receivables_total, Decimal("370.00"))
        self.assertEqual(september.opening_balance_projected, Decimal("1370.00"))
        self.assertEqual(september.days[0].balance, Decimal("1000.00"))
        self.assertEqual(september.days[0].projected_balance, Decimal("1370.00"))
        day_18 = next(day for day in september.days if day.date.day == 18)
        self.assertEqual(day_18.balance, Decimal("1000.00"))
        self.assertEqual(day_18.projected_balance, Decimal("1450.00"))

        summary = _build_month_summary(self.db, 2026, 9, self.user.id, today=date(2026, 9, 12))
        self.assertEqual(summary, _summarize_month_data(september, today=date(2026, 9, 12)))
        self.assertEqual(summary.prior_planned_receivables_total, Decimal("370.00"))
        self.assertEqual(summary.planned_receivables_total, Decimal("450.00"))
        self.assertEqual(summary.transactions_projected_closing, Decimal("1000.00"))
        self.assertEqual(summary.projected_closing, Decimal("1450.00"))

    def test_paid_prior_receivables_keep_a_single_opening_balance(self):
        self.db.add(
            Receivable(
                user_id=self.user.id,
                person_id=self.person.id,
                description="Quitado",
                total_amount=Decimal("200.00"),
                received_amount=Decimal("200.00"),
                due_date=date(2026, 8, 10),
                status="paid",
            )
        )
        self.db.commit()

        september = _build_month_data(self.db, 2026, 9, self.user.id)
        self.assertEqual(september.prior_planned_receivables_total, Decimal("0.00"))
        self.assertEqual(september.opening_balance_projected, september.opening_balance)


if __name__ == "__main__":
    unittest.main()
