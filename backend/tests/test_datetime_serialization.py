import json
import unittest
from datetime import datetime, timedelta, timezone

from app.schemas.base import APIModel


class TimestampPayload(APIModel):
    created_at: datetime


class DateTimeSerializationTests(unittest.TestCase):
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
