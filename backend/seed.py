from datetime import date
from decimal import Decimal
from calendar import monthrange
import random

from app.database import Base, SessionLocal, engine
from app.models import CreditCard, InvoiceItem, Recurrence, Transaction, User, Wallet
from app.security import hash_password
from app.services.credit_cards import get_or_create_invoice
from app.services.invoices import recalculate_invoice_total

DEMO_EMAIL = "demo@kashy365.local"
DEMO_PASSWORD = "demo-password-123"


def add_months(base: date, offset: int) -> tuple[int, int]:
    total = base.year * 12 + base.month - 1 + offset
    year = total // 12
    month = total % 12 + 1
    return year, month


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if user:
            print(f"Demo user {DEMO_EMAIL} already exists; seed skipped")
            return

        user = User(
            name="Demo",
            email=DEMO_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        db.flush()

        wallet = Wallet(
            user_id=user.id,
            name="Carteira principal",
            type="checking",
            initial_balance=Decimal("1500.00"),
            tracking_started_on=date.today().replace(day=1),
            color="#14A078",
            is_primary=True,
        )
        card = CreditCard(
            user_id=user.id,
            name="Nubank",
            institution="Nubank",
            color="#820AD1",
            closing_day=3,
            due_day=10,
            credit_limit=Decimal("5000.00"),
            default_wallet_id=None,
            active=True,
        )
        db.add_all([wallet, card])
        db.flush()
        card.default_wallet_id = wallet.id

        salary = Recurrence(
            user_id=user.id,
            wallet_id=wallet.id,
            description="Salario",
            type="income",
            amount=Decimal("5200.00"),
            day_of_month=5,
            active=True,
        )
        rent = Recurrence(
            user_id=user.id,
            wallet_id=wallet.id,
            description="Aluguel",
            type="expense",
            amount=Decimal("1800.00"),
            day_of_month=10,
            active=True,
        )
        db.add_all([salary, rent])
        db.flush()

        random.seed(42)
        today = date.today()
        for offset in (-2, -1, 0):
            year, month = add_months(today, offset)
            last_day = monthrange(year, month)[1]
            for recurrence in (salary, rent):
                tx_date = date(year, month, min(recurrence.day_of_month, last_day))
                db.add(Transaction(
                    user_id=user.id,
                    wallet_id=wallet.id,
                    date=tx_date,
                    type=recurrence.type,
                    amount=recurrence.amount,
                    description=recurrence.description,
                    is_future=tx_date > today,
                    recurrence_id=recurrence.id,
                ))
            for _ in range(4):
                tx_date = date(year, month, random.randint(1, last_day))
                db.add(Transaction(
                    user_id=user.id,
                    wallet_id=wallet.id,
                    date=tx_date,
                    type="expense",
                    amount=Decimal(str(random.randint(25, 280))) + Decimal("0.90"),
                    description=random.choice(["Mercado", "Transporte", "Restaurante", "Academia"]),
                    is_future=tx_date > today,
                ))

        purchases = [
            (today.replace(day=min(today.day, 28)), "Mercado", Decimal("210.50")),
            (today.replace(day=min(max(today.day - 3, 1), 28)), "Restaurante", Decimal("86.90")),
            (today.replace(day=min(today.day, 20)), "Streaming", Decimal("39.90")),
        ]
        touched = {}
        for purchase_date, description, amount in purchases:
            invoice = get_or_create_invoice(db, user.id, card, purchase_date, allow_overdue=True)
            db.add(InvoiceItem(
                invoice_id=invoice.id,
                description=description,
                amount=amount,
                purchase_date=purchase_date,
            ))
            touched[invoice.id] = invoice
        db.flush()
        for invoice in touched.values():
            recalculate_invoice_total(db, invoice)

        db.commit()
        print(f"Seed data created for {DEMO_EMAIL} / {DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
