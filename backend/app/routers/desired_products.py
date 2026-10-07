from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import DesiredProduct, ProductOffer, User
from app.schemas.desired_products import OfferPayload, OfferSearchResolved, OfferSearchResolvePayload, OfferSearchResult, ProductCreate, ProductOut, ProductUpdate, PurchaseAnalysisOut, PurchaseAnalysisPayload, PurchasePayload
from app.security import get_current_user
from app.services.categories import get_user_category
from app.services.desired_products import _fill_offer, _snapshot, _total_cost, offer_is_expired
from app.services.offer_search import OfferSearchProviderError, resolve_serpapi_offer, search_serpapi_offers
from app.services.purchase_analysis import analyze_offer_purchase


router = APIRouter(prefix="/api/desired-products", tags=["desired-products"])
CENT = Decimal("0.01")


def _load_product(db: Session, user_id: int, product_id: int) -> DesiredProduct:
    product = (
        db.query(DesiredProduct)
        .options(selectinload(DesiredProduct.offers).selectinload(ProductOffer.price_history), selectinload(DesiredProduct.selected_category))
        .filter(DesiredProduct.id == product_id, DesiredProduct.user_id == user_id)
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return product


def _load_offer(product: DesiredProduct, offer_id: int) -> ProductOffer:
    offer = next((item for item in product.offers if item.id == offer_id and item.deleted_at is None), None)
    if offer is None:
        raise HTTPException(status_code=404, detail="Oferta não encontrada")
    return offer


def _store_key(store: str) -> str:
    return " ".join(store.split()).casefold()


def _serialize(product: DesiredProduct) -> dict:
    store_price_history: dict[str, list] = {}
    for product_offer in product.offers:
        store_price_history.setdefault(_store_key(product_offer.store), []).extend(product_offer.price_history)
    for history in store_price_history.values():
        history.sort(key=lambda row: (row.recorded_at, row.created_at, row.id))

    offers = [
        {
            "id": offer.id,
            "product_id": offer.product_id,
            "store": offer.store,
            "url": offer.url,
            "price": offer.price,
            "shipping": offer.shipping,
            "payment_method": offer.payment_method,
            "installment_count": offer.installment_count,
            "installment_amount": offer.installment_amount,
            "notes": offer.notes,
            "recorded_at": offer.recorded_at,
            "source": offer.source,
            "is_expired": offer_is_expired(offer),
            "total_cost": _total_cost(offer),
            "price_history": offer.price_history,
            "store_price_history": store_price_history.get(_store_key(offer.store), []),
        }
        for offer in product.offers if offer.deleted_at is None
    ]
    comparable_offers = [offer for offer in offers if not offer["is_expired"]]
    ordered = sorted(comparable_offers, key=lambda offer: (offer["total_cost"], offer["id"]))
    return {
        "id": product.id,
        "name": product.name,
        "category": product.selected_category.name if product.selected_category else product.category,
        "category_id": product.category_id,
        "ean": product.ean,
        "source_url": product.source_url,
        "description": product.description,
        "image_data": product.image_data,
        "image_source": product.image_source,
        "media_url": product.media_url,
        "media_type": product.media_type,
        "media_frame": product.media_frame or {},
        "priority": product.priority,
        "target_price": product.target_price,
        "planned_purchase_date": product.planned_purchase_date,
        "analysis_offer_id": product.analysis_offer_id,
        "analysis_first_payment_date": product.analysis_first_payment_date,
        "status": product.status,
        "chosen_offer_id": product.chosen_offer_id,
        "purchase_store": product.purchase_store,
        "purchase_offer_snapshot": product.purchase_offer_snapshot,
        "paid_price": product.paid_price,
        "purchase_date": product.purchase_date,
        "purchase_payment_method": product.purchase_payment_method,
        "purchase_installment_count": product.purchase_installment_count,
        "purchase_installment_amount": product.purchase_installment_amount,
        "best_offer_id": ordered[0]["id"] if ordered else None,
        "best_price": ordered[0]["total_cost"] if ordered else None,
        "highest_price": ordered[-1]["total_cost"] if ordered else None,
        "savings": ordered[-1]["total_cost"] - ordered[0]["total_cost"] if len(ordered) > 1 else None,
        "offer_count": len(offers),
        "offers": offers,
    }


def _media_data(data: dict, product: DesiredProduct | None = None) -> dict:
    if data.get("media_url") and data.get("image_data"):
        raise HTTPException(status_code=422, detail="Escolha upload ou URL para a mídia")
    if data.get("image_data") and data.get("media_type") == "video":
        raise HTTPException(status_code=422, detail="Vídeos devem ser adicionados por URL")
    if data.get("media_url"):
        data["image_data"] = None
    elif data.get("image_data"):
        data["media_url"] = None
        data["media_type"] = "image"
    media_url = data.get("media_url", product.media_url if product else None)
    media_type = data.get("media_type", product.media_type if product else "image")
    if media_type == "video" and not media_url:
        if product and data.get("media_url", "unchanged") is None and "media_type" not in data:
            data["media_type"] = "image"
        else:
            raise HTTPException(status_code=422, detail="Vídeos devem ser adicionados por URL")
    data["image_source"] = "url" if media_url else "manual"
    return data


@router.get("", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    products = (
        db.query(DesiredProduct)
        .options(selectinload(DesiredProduct.offers).selectinload(ProductOffer.price_history), selectinload(DesiredProduct.selected_category))
        .filter(DesiredProduct.user_id == user.id)
        .order_by(DesiredProduct.updated_at.desc(), DesiredProduct.id.desc())
        .all()
    )
    return [_serialize(product) for product in products]


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    data = _media_data(payload.model_dump())
    if payload.category_id is not None:
        get_user_category(db, user.id, payload.category_id)
        data["category"] = None
    product = DesiredProduct(user_id=user.id, **data)
    db.add(product)
    db.commit()
    return _serialize(_load_product(db, user.id, product.id))


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _serialize(_load_product(db, user.id, product_id))


@router.get("/{product_id}/offer-search", response_model=list[OfferSearchResult])
def search_product_offers(
    product_id: int,
    q: str = Query(min_length=2, max_length=160),
    limit: int = Query(default=10, ge=1, le=20),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _load_product(db, user.id, product_id)
    query = " ".join(q.split())
    if len(query) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe ao menos 2 caracteres para pesquisar.")
    try:
        return search_serpapi_offers(query, limit)
    except OfferSearchProviderError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error


@router.post("/{product_id}/offer-search/resolve", response_model=OfferSearchResolved)
def resolve_product_offer(
    product_id: int,
    payload: OfferSearchResolvePayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _load_product(db, user.id, product_id)
    try:
        return {"url": resolve_serpapi_offer(payload.resolution_token, payload.store, payload.price)}
    except OfferSearchProviderError as error:
        raise HTTPException(status_code=error.status_code, detail=str(error)) from error


@router.post("/{product_id}/financial-analysis", response_model=PurchaseAnalysisOut)
def analyze_product_purchase(
    product_id: int,
    payload: PurchaseAnalysisPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    product = _load_product(db, user.id, product_id)
    offer = next((item for item in product.offers if item.id == payload.offer_id and item.deleted_at is None), None)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    from app.routers.budgets import _build_plan
    from app.routers.months import _build_month_summary, get_category_breakdown
    return analyze_offer_purchase(
        product,
        offer,
        payload.first_payment_date,
        lambda year, month: _build_month_summary(db, year, month, user.id),
        lambda year, month: _build_plan(db, user.id, year, month),
        lambda year, month: get_category_breakdown(
            year,
            month,
            db=db,
            current_user=user,
            include_details=False,
        ),
    )


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = _load_product(db, user.id, product_id)
    data = _media_data(payload.model_dump(exclude_unset=True), product)
    if "category_id" in data:
        get_user_category(db, user.id, data["category_id"])
        data["category"] = None
    if data.get("analysis_offer_id") is not None:
        _load_offer(product, data["analysis_offer_id"])
    if product.status == "bought" and "status" in data:
        for field in ("chosen_offer_id", "purchase_store", "purchase_offer_snapshot", "paid_price", "purchase_date", "purchase_payment_method", "purchase_installment_count", "purchase_installment_amount"):
            setattr(product, field, None)
    for key, value in data.items():
        setattr(product, key, value)
    db.commit()
    return _serialize(_load_product(db, user.id, product_id))


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.delete(_load_product(db, user.id, product_id))
    db.commit()


@router.post("/{product_id}/offers", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_offer(product_id: int, payload: OfferPayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = _load_product(db, user.id, product_id)
    offer = ProductOffer(product=product, source=payload.source)
    _fill_offer(offer, payload)
    _snapshot(offer)
    db.add(offer)
    db.commit()
    return _serialize(_load_product(db, user.id, product_id))


@router.put("/{product_id}/offers/{offer_id}", response_model=ProductOut)
def update_offer(product_id: int, offer_id: int, payload: OfferPayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = _load_product(db, user.id, product_id)
    offer = _load_offer(product, offer_id)
    previous = (offer.price, offer.shipping, offer.payment_method, offer.installment_count, offer.installment_amount)
    previous_recorded_at = offer.recorded_at
    _fill_offer(offer, payload)
    if previous != (offer.price, offer.shipping, offer.payment_method, offer.installment_count, offer.installment_amount):
        _snapshot(offer)
    elif previous_recorded_at != offer.recorded_at:
        if offer.price_history:
            offer.price_history[-1].recorded_at = offer.recorded_at
        else:
            _snapshot(offer)
    db.commit()
    return _serialize(_load_product(db, user.id, product_id))


@router.delete("/{product_id}/offers/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_offer(product_id: int, offer_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = _load_product(db, user.id, product_id)
    offer = _load_offer(product, offer_id)
    # Retain price history and the chosen-offer reference for completed purchases.
    offer.deleted_at = datetime.now(timezone.utc)
    if product.analysis_offer_id == offer.id:
        product.analysis_offer_id = None
    db.commit()


@router.post("/{product_id}/purchase", response_model=ProductOut)
def record_purchase(product_id: int, payload: PurchasePayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = _load_product(db, user.id, product_id)
    offer = _load_offer(product, payload.chosen_offer_id)
    product.status = "bought"
    product.chosen_offer_id = offer.id
    product.purchase_store = offer.store
    product.purchase_offer_snapshot = {
        "id": offer.id, "store": offer.store, "url": offer.url,
        "price": str(offer.price), "shipping": str(offer.shipping) if offer.shipping is not None else None,
        "total_cost": str(_total_cost(offer)), "source": offer.source,
        "payment_method": offer.payment_method, "installment_count": offer.installment_count,
        "installment_amount": str(offer.installment_amount) if offer.installment_amount is not None else None,
        "recorded_at": offer.recorded_at.isoformat(),
    }
    product.paid_price = payload.paid_price
    product.purchase_date = payload.purchase_date
    product.purchase_payment_method = payload.payment_method
    product.purchase_installment_count = payload.installment_count if payload.payment_method == "credit" else None
    product.purchase_installment_amount = (
        payload.installment_amount or (payload.paid_price / payload.installment_count).quantize(CENT, rounding=ROUND_HALF_UP)
        if payload.payment_method == "credit" else None
    )
    if product.purchase_installment_amount is not None and product.purchase_installment_amount <= 0:
        raise HTTPException(status_code=422, detail="O valor da parcela deve ser maior que zero")
    db.commit()
    return _serialize(_load_product(db, user.id, product_id))
