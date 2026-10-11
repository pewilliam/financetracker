import unittest
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Receivable, ReceivablePerson, User
from app.routers.receivables import update_receivable_person
from app.schemas.receivables import ReceivablePersonUpdate


class ReceivablePeopleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(name="Teste", email="people@example.com", password_hash="hash")
        self.other_user = User(name="Outro", email="other-people@example.com", password_hash="hash")
        self.person = ReceivablePerson(user=self.user, name="Ana")
        self.db.add_all([self.user, self.other_user, self.person])
        self.db.flush()
        self.receivable = Receivable(
            user_id=self.user.id,
            person_id=self.person.id,
            description="Empréstimo",
            total_amount=Decimal("100.00"),
            received_amount=Decimal("0.00"),
            due_date=date.today(),
            status="pending",
        )
        self.db.add(self.receivable)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_update_person_renames_existing_receivables(self):
        updated = update_receivable_person(
            self.person.id,
            ReceivablePersonUpdate(name="  Ana Souza  "),
            self.db,
            self.user,
        )

        self.db.refresh(self.receivable)
        self.assertEqual(updated.name, "Ana Souza")
        self.assertEqual(self.receivable.person_name, "Ana Souza")

    def test_update_person_rejects_name_used_by_another_person(self):
        self.db.add(ReceivablePerson(user_id=self.user.id, name="Bruno"))
        self.db.commit()

        with self.assertRaises(HTTPException) as raised:
            update_receivable_person(
                self.person.id,
                ReceivablePersonUpdate(name="Bruno"),
                self.db,
                self.user,
            )

        self.assertEqual(raised.exception.status_code, 409)

    def test_update_person_cannot_access_another_users_record(self):
        with self.assertRaises(HTTPException) as raised:
            update_receivable_person(
                self.person.id,
                ReceivablePersonUpdate(name="Nome inválido"),
                self.db,
                self.other_user,
            )

        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
