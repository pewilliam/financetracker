from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import DesiredProduct, ProductOffer, User
from app.schemas.desired_products import OfferPayload, ProductCreate, ProductOut, ProductUpdate, PurchasePayload
from app.security import get_current_user
from app.services.categories import get_user_category
from app.services.desired_products import _fill_offer, _snapshot, _total_cost


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


def _serialize(product: DesiredProduct) -> dict:
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
            "total_cost": _total_cost(offer),
            "price_history": offer.price_history,
        }
        for offer in product.offers if offer.deleted_at is None
    ]
    ordered = sorted(offers, key=lambda offer: (offer["total_cost"], offer["id"]))
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


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = _load_product(db, user.id, product_id)
    data = _media_data(payload.model_dump(exclude_unset=True), product)
    if "category_id" in data:
        get_user_category(db, user.id, data["category_id"])
        data["category"] = None
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
    offer = ProductOffer(product=product, source="manual")
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
    _fill_offer(offer, payload)
    if previous != (offer.price, offer.shipping, offer.payment_method, offer.installment_count, offer.installment_amount):
        _snapshot(offer)
    db.commit()
    return _serialize(_load_product(db, user.id, product_id))


@router.delete("/{product_id}/offers/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_offer(product_id: int, offer_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = _load_product(db, user.id, product_id)
    offer = _load_offer(product, offer_id)
    # Retain price history and the chosen-offer reference for completed purchases.
    offer.deleted_at = datetime.now(timezone.utc)
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
