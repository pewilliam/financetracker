import asyncio
import ipaddress
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, TypeAlias

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

IPAddress: TypeAlias = ipaddress.IPv4Address | ipaddress.IPv6Address


@dataclass(frozen=True)
class RateLimitPolicy:
    name: str
    requests: int
    window_seconds: int


def _positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return max(1, value)


class RateLimitMiddleware:
    """Small in-process sliding-window limiter keyed by the verified client IP."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.enabled = os.getenv("RATE_LIMIT_ENABLED", "true").lower() not in {"0", "false", "no"}
        self.general = RateLimitPolicy(
            "general",
            _positive_int_env("RATE_LIMIT_REQUESTS", 300),
            _positive_int_env("RATE_LIMIT_WINDOW_SECONDS", 60),
        )
        self.register = RateLimitPolicy(
            "register",
            _positive_int_env("REGISTER_RATE_LIMIT_REQUESTS", 5),
            _positive_int_env("REGISTER_RATE_LIMIT_WINDOW_SECONDS", 900),
        )
        self.login = RateLimitPolicy(
            "login",
            _positive_int_env("LOGIN_RATE_LIMIT_REQUESTS", 10),
            _positive_int_env("LOGIN_RATE_LIMIT_WINDOW_SECONDS", 300),
        )
        self._buckets: dict[tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()
        self._trusted_proxies = self._load_trusted_proxies()
        self._policy_windows = {
            self.general.name: self.general.window_seconds,
            self.register.name: self.register.window_seconds,
            self.login.name: self.login.window_seconds,
        }
        self._last_cleanup = time.monotonic()

    @staticmethod
    def _load_trusted_proxies():
        networks = []
        for raw_value in os.getenv("TRUSTED_PROXY_IPS", "").split(","):
            value = raw_value.strip()
            if not value:
                continue
            try:
                networks.append(ipaddress.ip_network(value, strict=False))
            except ValueError:
                continue
        return networks

    def _is_trusted_proxy(self, address: IPAddress) -> bool:
        return any(address in network for network in self._trusted_proxies)

    def _client_ip(self, scope: Scope) -> str:
        peer_value = (scope.get("client") or ("unknown", 0))[0]
        try:
            peer = ipaddress.ip_address(peer_value)
        except ValueError:
            return peer_value

        if not self._is_trusted_proxy(peer):
            return peer.compressed

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        forwarded = headers.get(b"x-forwarded-for", b"").decode("latin-1")
        addresses = []
        for raw_value in forwarded.split(","):
            try:
                addresses.append(ipaddress.ip_address(raw_value.strip()))
            except ValueError:
                continue
        for address in reversed(addresses):
            if not self._is_trusted_proxy(address):
                return address.compressed
        return addresses[0].compressed if addresses else peer.compressed

    async def _consume(self, policy: RateLimitPolicy, client_ip: str):
        now = time.monotonic()
        key = (policy.name, client_ip)
        async with self._lock:
            if now - self._last_cleanup >= 60:
                for bucket_key, old_bucket in list(self._buckets.items()):
                    old_cutoff = now - self._policy_windows[bucket_key[0]]
                    while old_bucket and old_bucket[0] <= old_cutoff:
                        old_bucket.popleft()
                    if not old_bucket:
                        del self._buckets[bucket_key]
                self._last_cleanup = now

            bucket = self._buckets[key]
            cutoff = now - policy.window_seconds
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= policy.requests:
                retry_after = max(1, int(bucket[0] + policy.window_seconds - now) + 1)
                return False, 0, retry_after

            bucket.append(now)
            remaining = policy.requests - len(bucket)
            reset_after = max(1, int(bucket[0] + policy.window_seconds - now) + 1)
            return True, remaining, reset_after

    @staticmethod
    def _headers(policy: RateLimitPolicy, remaining: int, reset_after: int) -> dict[str, str]:
        return {
            "RateLimit-Limit": str(policy.requests),
            "RateLimit-Remaining": str(remaining),
            "RateLimit-Reset": str(reset_after),
        }

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self.enabled or scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        path = scope.get("path", "")
        if method == "OPTIONS" or path == "/api/health":
            await self.app(scope, receive, send)
            return

        client_ip = self._client_ip(scope)
        policies = [self.general]
        if method == "POST" and path == "/api/auth/register":
            policies.append(self.register)
        elif method == "POST" and path == "/api/auth/login":
            policies.append(self.login)

        selected_headers = None
        for policy in policies:
            allowed, remaining, reset_after = await self._consume(policy, client_ip)
            selected_headers = self._headers(policy, remaining, reset_after)
            if not allowed:
                selected_headers["Retry-After"] = str(reset_after)
                response = JSONResponse(
                    {"detail": "Too many requests. Try again later."},
                    status_code=429,
                    headers=selected_headers,
                )
                await response(scope, receive, send)
                return

        async def send_with_rate_limit_headers(message):
            if selected_headers and message["type"] == "http.response.start":
                mutable_headers = list(message.get("headers", []))
                mutable_headers.extend(
                    (key.lower().encode("latin-1"), value.encode("latin-1"))
                    for key, value in selected_headers.items()
                )
                message["headers"] = mutable_headers
            await send(message)

        await self.app(scope, receive, send_with_rate_limit_headers)
