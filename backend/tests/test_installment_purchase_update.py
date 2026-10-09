import unittest
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import InstallmentItem, InstallmentPurchase, User
from app.routers.installments import update_installment_purchase
from app.schemas.installments import InstallmentPurchaseUpdate


class InstallmentPurchaseUpdateTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="rename@example.com", password_hash="hash")
        self.db.add(self.user)
        self.db.flush()
        self.purchase = InstallmentPurchase(
            user_id=self.user.id,
            description="Nome antigo",
            total_amount=Decimal("250.00"),
            installment_count=2,
            installment_value=Decimal("125.00"),
        )
        self.db.add(self.purchase)
        self.db.flush()
        self.db.add_all([
            InstallmentItem(
                purchase_id=self.purchase.id,
                installment_number=1,
                amount=Decimal("125.00"),
                description="Nome antigo (1/2)",
                status="pending",
            ),
            InstallmentItem(
                purchase_id=self.purchase.id,
                installment_number=2,
                amount=Decimal("125.00"),
                description="Nome antigo (2/2)",
                status="pending",
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_updates_purchase_and_installment_descriptions(self):
        result = update_installment_purchase(
            self.purchase.id,
            InstallmentPurchaseUpdate(description="  Nome novo  "),
            self.db,
            self.user,
        )

        self.assertEqual(result.description, "Nome novo")
        self.assertEqual(
            [item.description for item in result.items],
            ["Nome novo (1/2)", "Nome novo (2/2)"],
        )

    def test_rejects_a_blank_name(self):
        with self.assertRaises(HTTPException) as context:
            update_installment_purchase(
                self.purchase.id,
                InstallmentPurchaseUpdate(description="   "),
                self.db,
                self.user,
            )

        self.assertEqual(context.exception.status_code, 400)
        self.db.refresh(self.purchase)
        self.assertEqual(self.purchase.description, "Nome antigo")


if __name__ == "__main__":
    unittest.main()
