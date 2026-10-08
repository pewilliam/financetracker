import json
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.schemas.base import APIModel
from app.schemas.desired_products import PlanningModel


class TimestampPayload(APIModel):
    created_at: datetime


class MoneyPayload(APIModel):
    amount: Decimal


class PlanningPayload(PlanningModel):
    amount: Decimal
    created_at: datetime
    nested: MoneyPayload


class DateTimeSerializationTests(unittest.TestCase):
    def test_financial_amounts_remain_json_numbers(self):
        payload = MoneyPayload(amount=Decimal("1234.50"))
        self.assertEqual(json.loads(payload.model_dump_json()), {"amount": 1234.5})
        self.assertEqual(payload.model_dump()["amount"], Decimal("1234.50"))

    def test_planning_amounts_remain_strings_and_nested_models_keep_their_format(self):
        payload = PlanningPayload(amount=Decimal("1234.50"), created_at=datetime(2026, 9, 11), nested=MoneyPayload(amount=Decimal("12.34")))
        self.assertEqual(json.loads(payload.model_dump_json()), {"amount": "1234.50", "created_at": "2026-09-11T00:00:00Z", "nested": {"amount": 12.34}})
        self.assertEqual(payload.model_dump(mode="json", exclude={"nested"}), {"amount": "1234.50", "created_at": "2026-09-11T00:00:00Z"})
    def test_naive_database_datetime_is_serialized_as_utc(self):
        payload = TimestampPayload(created_at=datetime(2026, 9, 11, 1, 7))

        self.assertEqual(
            json.loads(payload.model_dump_json())["created_at"],
            "2026-09-11T01:07:00Z",
        )

    def test_explicit_datetime_offset_is_preserved(self):
        fortaleza = timezone(timedelta(hours=-3))
        payload = TimestampPayload(created_at=datetime(2026, 9, 10, 22, 7, tzinfo=fortaleza))

        self.assertEqual(
            json.loads(payload.model_dump_json())["created_at"],
            "2026-09-10T22:07:00-03:00",
        )
