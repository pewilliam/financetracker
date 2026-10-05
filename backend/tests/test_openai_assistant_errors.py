import io
import json
import unittest
from urllib.error import HTTPError
from unittest.mock import patch

from app.services.openai_assistant import AssistantUnavailable, answer_question


class OpenAIErrorTests(unittest.TestCase):
    def provider_error(self, code, kind="insufficient_quota"):
        body = json.dumps({"error": {"code": code, "type": kind,
                                     "message": "provider-only detail"}}).encode()
        return HTTPError("https://api.openai.com/v1/responses", 429, "Too Many Requests", {}, io.BytesIO(body))

    def answer_with_error(self, error):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}), \
             patch("app.services.openai_assistant.urlopen", side_effect=error):
            with self.assertRaises(AssistantUnavailable) as caught:
                answer_question("Como estão meus gastos?", [], {})
        self.assertNotIn("provider-only detail", str(caught.exception))
        return str(caught.exception)

    def test_exhausted_credit_is_not_reported_as_temporary_outage(self):
        self.assertIn("sem créditos", self.answer_with_error(self.provider_error("credit_balance_exhausted")))
        self.assertIn("sem créditos", self.answer_with_error(self.provider_error(None)))

    def test_spend_limit_has_actionable_message(self):
        message = self.answer_with_error(self.provider_error("project_spend_limit_exceeded"))
        self.assertIn("limites do projeto", message)

    def test_rate_limit_suggests_waiting(self):
        message = self.answer_with_error(self.provider_error("rate_limit_exceeded", "rate_limit_error"))
        self.assertIn("Aguarde", message)


if __name__ == "__main__":
    unittest.main()
