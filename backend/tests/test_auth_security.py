import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import User
from app.rate_limit import RateLimitMiddleware, RateLimitPolicy
from app.routers.auth import register, update_me, update_password
from app.schemas.auth import PasswordUpdate, UserCreate, UserUpdate
from app.security import create_access_token, get_current_user, hash_password, verify_password


class AuthSecurityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_registration_normalizes_identity_data(self):
        result = register(
            UserCreate(name="  Maria   Silva  ", email="MARIA@example.com", password="Uma senha bem segura! 2026"),
            self.db,
        )

        self.assertEqual(result["user"].name, "Maria Silva")
        self.assertEqual(result["user"].email, "maria@example.com")
        self.assertTrue(verify_password("Uma senha bem segura! 2026", result["user"].password_hash))

    def test_registration_rejects_weak_and_personal_passwords(self):
        with self.assertRaises(ValidationError):
            UserCreate(name="Maria Silva", email="maria@example.com", password="senha123")

        with self.assertRaises(ValidationError):
            UserCreate(name="Maria Silva", email="maria@example.com", password="maria-uma-senha-longa")

    def test_email_change_requires_the_current_password(self):
        user = User(name="Maria Silva", email="maria@example.com", password_hash=hash_password("Senha original segura 2026"))
        self.db.add(user)
        self.db.commit()

        with self.assertRaises(HTTPException) as context:
            update_me(UserUpdate(name=user.name, email="nova@example.com"), self.db, user)

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(user.email, "maria@example.com")

    def test_password_change_rejects_reuse(self):
        current_password = "Senha original segura 2026"
        user = User(name="Maria Silva", email="maria@example.com", password_hash=hash_password(current_password))
        self.db.add(user)
        self.db.commit()

        with self.assertRaises(HTTPException) as context:
            update_password(
                PasswordUpdate(current_password=current_password, new_password=current_password),
                self.db,
                user,
            )

        self.assertEqual(context.exception.status_code, 400)

    def test_password_change_revokes_previously_issued_tokens(self):
        current_password = "Senha original segura 2026"
        user = User(name="Maria Silva", email="maria@example.com", password_hash=hash_password(current_password))
        self.db.add(user)
        self.db.commit()
        old_token = create_access_token(user)
        self.assertEqual(get_current_user(old_token, self.db).id, user.id)

        result = update_password(
            PasswordUpdate(current_password=current_password, new_password="Outra senha realmente segura 2026"),
            self.db,
            user,
        )

        self.assertTrue(result["sessions_revoked"])
        self.assertEqual(user.auth_version, 1)
        self.assertNotEqual(old_token, create_access_token(user))
        with self.assertRaises(HTTPException) as context:
            get_current_user(old_token, self.db)
        self.assertEqual(context.exception.status_code, 401)


class RateLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_auth_route_returns_429_and_retry_after_header(self):
        async def endpoint(scope, receive, send):
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        with patch.dict(
            os.environ,
            {
                "RATE_LIMIT_REQUESTS": "100",
                "REGISTER_RATE_LIMIT_REQUESTS": "2",
                "REGISTER_RATE_LIMIT_WINDOW_SECONDS": "60",
            },
        ):
            middleware = RateLimitMiddleware(endpoint)

        async def make_request():
            messages = []
            scope = {
                "type": "http",
                "method": "POST",
                "path": "/api/auth/register",
                "client": ("203.0.113.30", 1234),
                "headers": [],
            }

            async def receive():
                return {"type": "http.request", "body": b"", "more_body": False}

            async def send(message):
                messages.append(message)

            await middleware(scope, receive, send)
            return messages

        self.assertEqual((await make_request())[0]["status"], 204)
        self.assertEqual((await make_request())[0]["status"], 204)
        rejected = await make_request()
        response_headers = dict(rejected[0]["headers"])

        self.assertEqual(rejected[0]["status"], 429)
        self.assertIn(b"retry-after", response_headers)

    async def test_sliding_window_rejects_requests_above_the_limit(self):
        middleware = RateLimitMiddleware(None)
        policy = RateLimitPolicy("test", requests=2, window_seconds=60)
        middleware._policy_windows[policy.name] = policy.window_seconds

        self.assertTrue((await middleware._consume(policy, "203.0.113.10"))[0])
        self.assertTrue((await middleware._consume(policy, "203.0.113.10"))[0])
        allowed, remaining, retry_after = await middleware._consume(policy, "203.0.113.10")

        self.assertFalse(allowed)
        self.assertEqual(remaining, 0)
        self.assertGreaterEqual(retry_after, 1)

    async def test_forwarded_ip_is_only_used_for_a_trusted_proxy(self):
        with patch.dict(os.environ, {"TRUSTED_PROXY_IPS": "10.0.0.0/8"}):
            middleware = RateLimitMiddleware(None)

        trusted_scope = {
            "client": ("10.1.2.3", 1234),
            "headers": [(b"x-forwarded-for", b"203.0.113.20, 10.2.3.4")],
        }
        untrusted_scope = {
            "client": ("198.51.100.5", 1234),
            "headers": [(b"x-forwarded-for", b"203.0.113.20")],
        }

        self.assertEqual(middleware._client_ip(trusted_scope), "203.0.113.20")
        self.assertEqual(middleware._client_ip(untrusted_scope), "198.51.100.5")


if __name__ == "__main__":
    unittest.main()
