"""Server-side shopping search providers used to prefill desired-product offers."""
from __future__ import annotations

import hashlib
import json
import os
import re
import socket
import time
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen

from app.schemas.base import MAX_MONEY_AMOUNT


CENT = Decimal("0.01")
SERPAPI_ENDPOINT = "https://serpapi.com/search.json"
_cache: dict[tuple[str, int], tuple[float, list[dict]]] = {}
_resolve_cache: dict[str, tuple[float, str]] = {}
_cache_lock = Lock()


class OfferSearchProviderError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _positive_number(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        return default
    return min(max(value, minimum), maximum)


def _safe_url(value) -> str | None:
    candidate = str(value or "").strip()
    if not candidate or len(candidate) > 2048:
        return None
    parts = urlsplit(candidate)
    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
        return None
    return candidate


def _is_provider_url(value: str) -> bool:
    hostname = (urlsplit(value).hostname or "").casefold().removeprefix("www.")
    return hostname == "serpapi.com" or hostname.endswith(".serpapi.com") or hostname == "google.com" or hostname.endswith(".google.com") or hostname.startswith("google.") or ".google." in hostname


def _merchant_url(*values) -> str | None:
    for value in values:
        candidate = _safe_url(value)
        if not candidate:
            continue
        if not _is_provider_url(candidate):
            return candidate
        query = parse_qs(urlsplit(candidate).query)
        for key in ("url", "q", "adurl"):
            nested = _safe_url(query.get(key, [None])[0])
            if nested and not _is_provider_url(nested):
                return nested
    return None


def _money(value) -> Decimal | None:
    try:
        amount = Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return None
    if amount <= 0 or amount > MAX_MONEY_AMOUNT:
        return None
    return amount


def _free_shipping(label: str | None) -> Decimal | None:
    normalized = (label or "").casefold()
    return Decimal("0.00") if any(term in normalized for term in ("frete grátis", "frete gratis", "grátis", "gratis", "free shipping")) else None


def _normalized_store(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().casefold()
    return re.sub(r"[^a-z0-9]+", "", ascii_value)


def _request_serpapi(parameters: dict) -> dict:
    api_key = os.getenv("SERPAPI_API_KEY", "").strip()
    if not api_key:
        raise OfferSearchProviderError("A busca automática de ofertas ainda não foi configurada.", 503)
    params = urlencode({**parameters, "api_key": api_key, "output": "json"})
    request = Request(f"{SERPAPI_ENDPOINT}?{params}", headers={"Accept": "application/json", "User-Agent": "Kashy/1.0"})
    timeout = _positive_number("SERPAPI_TIMEOUT_SECONDS", 12, 3, 30)
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code in {401, 403}:
            raise OfferSearchProviderError("A credencial da busca automática é inválida.", 503) from error
        if error.code == 429:
            raise OfferSearchProviderError("O limite de buscas automáticas foi atingido. Tente novamente mais tarde.", 503) from error
        raise OfferSearchProviderError("O provedor de ofertas não respondeu corretamente.") from error
    except (URLError, socket.timeout, TimeoutError) as error:
        raise OfferSearchProviderError("O provedor de ofertas demorou para responder. Tente novamente.", 504) from error
    except (UnicodeDecodeError, json.JSONDecodeError, OSError) as error:
        raise OfferSearchProviderError("Não foi possível interpretar a resposta do provedor de ofertas.") from error
    if not isinstance(payload, dict):
        raise OfferSearchProviderError("O provedor de ofertas retornou uma resposta inválida.")
    if payload.get("error"):
        raise OfferSearchProviderError(str(payload["error"])[:300], 502)
    return payload


def _parse_result(row: dict, position: int) -> dict | None:
    title = str(row.get("title") or "").strip()
    price = _money(row.get("extracted_price"))
    direct_url = _merchant_url(row.get("direct_link"), row.get("link"))
    resolution_token = str(row.get("immersive_product_page_token") or "").strip() or None
    url = direct_url or _safe_url(row.get("product_link"))
    if not direct_url and not resolution_token:
        return None
    if not title or price is None or url is None:
        return None
    store = str(row.get("source") or "Loja não informada").strip()[:150] or "Loja não informada"
    delivery = row.get("delivery") or row.get("shipping")
    if isinstance(delivery, list):
        delivery = " · ".join(str(item) for item in delivery if item)
    delivery = str(delivery).strip()[:180] if delivery else None
    installment = row.get("installment") if isinstance(row.get("installment"), dict) else {}
    installment_count = installment.get("period")
    try:
        installment_count = int(installment_count)
    except (TypeError, ValueError):
        installment_count = None
    if installment_count is not None and not 1 <= installment_count <= 60:
        installment_count = None
    installment_amount = _money(installment.get("extracted_price")) if installment_count else None
    raw_id = str(row.get("product_id") or "").strip()
    if not raw_id:
        raw_id = hashlib.sha256(f"{title}|{store}|{url}|{price}|{position}".encode()).hexdigest()[:24]
    rating = row.get("rating")
    try:
        rating = float(rating) if rating is not None else None
    except (TypeError, ValueError):
        rating = None
    if rating is not None and not 0 <= rating <= 5:
        rating = None
    reviews = row.get("reviews")
    try:
        reviews = max(0, int(reviews)) if reviews is not None else None
    except (TypeError, ValueError):
        reviews = None
    return {
        "external_id": raw_id[:128],
        "title": title[:500],
        "store": store,
        "price": price,
        "shipping": _free_shipping(delivery),
        "shipping_label": delivery,
        "url": url,
        "image_url": _safe_url(row.get("thumbnail")),
        "rating": rating,
        "reviews": reviews,
        "installment_count": installment_count,
        "installment_amount": installment_amount,
        "resolution_token": None if direct_url else resolution_token,
        "source": "serpapi",
    }


def search_serpapi_offers(query: str, limit: int = 10) -> list[dict]:
    normalized_query = " ".join(query.split())
    if len(normalized_query) < 2:
        raise OfferSearchProviderError("Informe ao menos 2 caracteres para pesquisar.", 422)
    cache_key = (normalized_query.casefold(), limit)
    cache_seconds = _positive_number("SERPAPI_CACHE_SECONDS", 600, 0, 3600)
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and cached[0] > now:
            return [dict(item) for item in cached[1]]

    payload = _request_serpapi({
        "engine": "google_shopping",
        "q": normalized_query,
        "gl": "br",
        "hl": "pt-br",
        "google_domain": "google.com.br",
        "direct_link": "true",
    })
    rows = payload.get("shopping_results") or payload.get("inline_shopping_results") or []
    results = []
    for position, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            continue
        parsed = _parse_result(row, position)
        if parsed:
            results.append(parsed)
        if len(results) >= limit:
            break
    if cache_seconds > 0:
        with _cache_lock:
            _cache[cache_key] = (now + cache_seconds, [dict(item) for item in results])
            if len(_cache) > 200:
                expired = [key for key, value in _cache.items() if value[0] <= now]
                for key in expired:
                    _cache.pop(key, None)
                while len(_cache) > 200:
                    oldest = min(_cache, key=lambda key: _cache[key][0])
                    _cache.pop(oldest, None)
    return results


def resolve_serpapi_offer(resolution_token: str, store: str, price: Decimal) -> str:
    token = resolution_token.strip()
    expected_store = _normalized_store(store)
    expected_price = _money(price)
    if len(token) < 20 or not expected_store or expected_price is None:
        raise OfferSearchProviderError("Não foi possível identificar essa oferta.", 422)
    cache_key = hashlib.sha256(f"{token}|{expected_store}|{expected_price}".encode()).hexdigest()
    now = time.monotonic()
    with _cache_lock:
        cached = _resolve_cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

    payload = _request_serpapi({"engine": "google_immersive_product", "page_token": token})
    product = payload.get("product_results") if isinstance(payload.get("product_results"), dict) else {}
    stores = product.get("stores") if isinstance(product.get("stores"), list) else []
    candidates = []
    for position, row in enumerate(stores):
        if not isinstance(row, dict):
            continue
        url = _merchant_url(row.get("direct_link"), row.get("link"))
        if not url:
            continue
        candidate_store = _normalized_store(str(row.get("name") or ""))
        candidate_price = _money(row.get("extracted_total") or row.get("extracted_price"))
        store_score = 4 if candidate_store == expected_store else 3 if candidate_store and (candidate_store in expected_store or expected_store in candidate_store) else 0
        price_score = 2 if candidate_price == expected_price else 0
        candidates.append((store_score + price_score, store_score, -position, url))
    if not candidates:
        raise OfferSearchProviderError("A loja não disponibilizou um link direto para essa oferta.", 404)
    score, store_score, _, url = max(candidates)
    if store_score == 0 and not (score >= 2 and len([item for item in candidates if item[0] == score]) == 1):
        raise OfferSearchProviderError("Não foi possível confirmar o link da loja dessa oferta.", 404)
    cache_seconds = _positive_number("SERPAPI_CACHE_SECONDS", 600, 0, 3600)
    if cache_seconds > 0:
        with _cache_lock:
            _resolve_cache[cache_key] = (now + cache_seconds, url)
    return url
