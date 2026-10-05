import io
import json
import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Category, Transaction, User, Wallet
from app.routers.assistant import AssistantQuestion, ask_assistant
from app.services.financial_assistant import financial_snapshot


class FinancialAssistantTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = User(name="Pedro", email="owner@example.com", password_hash="hash")
        self.other = User(name="Outro", email="other@example.com", password_hash="hash")
        self.db.add_all([self.owner, self.other])
        self.db.flush()
        self.wallet = Wallet(user_id=self.owner.id, name="Principal", type="checking", initial_balance=500,
                             tracking_started_on=date(2026, 1, 1), active=True)
        archived = Wallet(user_id=self.owner.id, name="Arquivada", type="checking", initial_balance=0,
                          tracking_started_on=date(2026, 1, 1), active=False)
        groceries = Category(user_id=self.owner.id, name="Mercado")
        self.db.add_all([self.wallet, archived, groceries])
        self.db.flush()
        self.db.add_all([
            Transaction(user_id=self.owner.id, wallet_id=self.wallet.id, date=date(2026, 10, 2),
                        type="income", amount=Decimal("3000"), description="Salário", is_future=False),
            Transaction(user_id=self.owner.id, wallet_id=self.wallet.id, date=date(2026, 10, 3),
                        type="expense", amount=Decimal("900"), description="Supermercado", category_id=groceries.id, is_future=False),
            Transaction(user_id=self.owner.id, wallet_id=self.wallet.id, date=date(2026, 9, 3),
                        type="expense", amount=Decimal("600"), description="Compra anterior", is_future=False),
            Transaction(user_id=self.owner.id, wallet_id=self.wallet.id, date=date(2026, 10, 7),
                        type="expense", amount=Decimal("700"), description="Previsto", is_future=True),
            Transaction(user_id=self.owner.id, wallet_id=archived.id, date=date(2026, 10, 4),
                        type="expense", amount=Decimal("800"), description="Arquivado", is_future=False),
            Transaction(user_id=self.other.id, date=date(2026, 10, 3),
                        type="expense", amount=Decimal("99999"), description="SEGREDO DE OUTRA CONTA", is_future=False),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_snapshot_filters_user_future_and_archived_wallet(self):
        facts = financial_snapshot(self.db, self.owner.id, date(2026, 10, 5))
        current = facts["monthly"][-1]
        self.assertEqual((current["income"], current["expenses"], current["transactions"]),
                         ("3000.00", "900.00", 2))
        self.assertEqual(facts["month_to_date_comparison"]["previous"]["expenses"], "600.00")
        self.assertEqual(facts["current_month_direct_expense_categories"],
                         [{"category": "Mercado", "amount": "900.00"}])
        self.assertEqual(facts["active_wallet_total_balance"], "2000.00")
        self.assertNotIn("SEGREDO", json.dumps(facts, ensure_ascii=False))
        self.assertNotIn("Previsto", json.dumps(facts, ensure_ascii=False))

    def test_endpoint_passes_scoped_facts_and_does_not_store_provider_response(self):
        response = io.BytesIO(json.dumps({"output": [{"type": "message", "content": [
            {"type": "output_text", "text": "Os gastos de mercado subiram."}
        ]}]}).encode())
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}), \
             patch("app.routers.assistant.app_today", return_value=date(2026, 10, 5)), \
             patch("app.services.openai_assistant.urlopen", return_value=response) as send:
            result = ask_assistant(AssistantQuestion(question="Por que sobrou menos dinheiro?"), self.db, self.owner)

        self.assertEqual(result.answer, "Os gastos de mercado subiram.")
        sent = json.loads(send.call_args.args[0].data)
        self.assertEqual(sent["store"], False)
        self.assertEqual(sent["model"], "gpt-5.4-mini")
        facts = json.loads(sent["input"][0]["content"])["financial_data"]
        self.assertEqual(facts["monthly"][-1]["expenses"], "900.00")
        self.assertNotIn("SEGREDO", json.dumps(sent, ensure_ascii=False))
        self.assertNotIn("owner@example.com", json.dumps(sent))

    def test_missing_key_is_reported_without_fabricated_answer(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": ""}), \
             patch("app.routers.assistant.app_today", return_value=date(2026, 10, 5)):
            with self.assertRaises(HTTPException) as context:
                ask_assistant(AssistantQuestion(question="Quais gastos mudaram?"), self.db, self.owner)
        self.assertEqual(context.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
