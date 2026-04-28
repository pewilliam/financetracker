from datetime import date
from decimal import Decimal
from calendar import monthrange
import random
from app.database import Base, SessionLocal, engine
from app.models import Invoice, InvoiceItem, Recurrence, Transaction


def add_months(base: date, offset: int) -> tuple[int, int]:
    total = base.year * 12 + base.month - 1 + offset
    year = total // 12
    month = total % 12 + 1
    return year, month


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.query(InvoiceItem).delete()
        db.query(Invoice).delete()
        db.query(Transaction).delete()
        db.query(Recurrence).delete()
        db.commit()

        salary = Recurrence(
            description="Salario",
            type="income",
            amount=Decimal("5200.00"),
            day_of_month=5,
            active=True,
        )
        rent = Recurrence(
            description="Aluguel",
            type="expense",
            amount=Decimal("1800.00"),
            day_of_month=10,
            active=True,
        )
        db.add_all([salary, rent])
        db.commit()
        db.refresh(salary)
        db.refresh(rent)

        random.seed(42)
        today = date.today()
        history_offsets = [-2, -1, 0]

        for offset in history_offsets:
            year, month = add_months(today, offset)
            last_day = monthrange(year, month)[1]

            for recurrence in (salary, rent):
                day = min(recurrence.day_of_month, last_day)
                tx_date = date(year, month, day)
                db.add(
                    Transaction(
                        date=tx_date,
                        type=recurrence.type,
                        amount=recurrence.amount,
                        description=recurrence.description,
                        is_future=tx_date > today,
                        recurrence_id=recurrence.id,
                    )
                )

            for _ in range(6):
                day = random.randint(1, last_day)
                tx_date = date(year, month, day)
                db.add(
                    Transaction(
                        date=tx_date,
                        type="expense",
                        amount=Decimal(str(random.randint(25, 380))) + Decimal("0.90"),
                        description=random.choice(
                            [
                                "Mercado",
                                "Transporte",
                                "Restaurante",
                                "Academia",
                                "Streaming",
                            ]
                        ),
                        is_future=tx_date > today,
                    )
                )

            for _ in range(2):
                day = random.randint(1, last_day)
                tx_date = date(year, month, day)
                db.add(
                    Transaction(
                        date=tx_date,
                        type="income",
                        amount=Decimal(str(random.randint(200, 750))) + Decimal("0.00"),
                        description="Extra",
                        is_future=tx_date > today,
                    )
                )

        future_year, future_month = add_months(today, 1)
        future_day = min(15, monthrange(future_year, future_month)[1])
        due_date = date(future_year, future_month, future_day)

        invoice = Invoice(
            name=f"Nubank {future_month}/{future_year}",
            due_date=due_date,
            total_amount=Decimal("0.00"),
        )
        db.add(invoice)
        db.flush()

        items = [
            ("Compra X", Decimal("45.00")),
            ("Compra Y", Decimal("120.00")),
            ("Mercado Z", Decimal("210.50")),
        ]
        total = Decimal("0.00")
        for description, amount in items:
            db.add(
                InvoiceItem(
                    invoice_id=invoice.id,
                    description=description,
                    amount=amount,
                )
            )
            total += amount

        invoice.total_amount = total
        linked_tx = Transaction(
            date=due_date,
            type="expense",
            amount=invoice.total_amount,
            description=f"Invoice: {invoice.name}",
            is_future=True,
            invoice_id=invoice.id,
        )
        db.add(linked_tx)
        db.flush()
        invoice.linked_transaction_id = linked_tx.id

        db.add(
            Transaction(
                date=date(future_year, future_month, min(25, monthrange(future_year, future_month)[1])),
                type="expense",
                amount=Decimal("320.00"),
                description="Associacao",
                is_future=True,
            )
        )

        db.commit()
        print("Seed data created")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
