"""Manual offer pricing and append-only snapshots, reusable by future importers."""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException

from app.models import OfferPriceHistory, ProductOffer
from app.schemas.base import MAX_MONEY_AMOUNT
from app.schemas.desired_products import OfferPayload

CENT = Decimal("0.01")
OFFER_VALIDITY_DAYS = 30


def offer_is_expired(offer: ProductOffer, reference_date: date | None = None) -> bool:
    """Prices older than the comparison window remain visible but are not ranked."""
    cutoff = (reference_date or date.today()) - timedelta(days=OFFER_VALIDITY_DAYS)
    return offer.recorded_at < cutoff


def _total_cost(offer) -> Decimal:
    total = (offer.price + (offer.shipping or Decimal("0.00"))).quantize(CENT)
    if total > MAX_MONEY_AMOUNT:
        raise HTTPException(status_code=422, detail="Custo total excede o limite permitido")
    return total


def _fill_offer(offer: ProductOffer, payload: OfferPayload) -> None:
    for key in ("store", "url", "price", "shipping", "payment_method", "notes", "recorded_at"):
        setattr(offer, key, getattr(payload, key))
    offer.installment_count = payload.installment_count if payload.payment_method == "credit" else None
    offer.installment_amount = (
        payload.installment_amount or (payload.price / payload.installment_count).quantize(CENT, rounding=ROUND_HALF_UP)
        if payload.payment_method == "credit" else None
    )
    if offer.payment_method == "credit" and offer.installment_amount == 0:
        raise HTTPException(status_code=422, detail="O valor da parcela deve ser maior que zero")
    _total_cost(offer)


def _snapshot(offer: ProductOffer) -> None:
    offer.price_history.append(OfferPriceHistory(
        price=offer.price,
        shipping=offer.shipping,
        payment_method=offer.payment_method,
        installment_count=offer.installment_count,
        installment_amount=offer.installment_amount,
        total_cost=_total_cost(offer),
        recorded_at=offer.recorded_at,
        source=offer.source,
    ))
