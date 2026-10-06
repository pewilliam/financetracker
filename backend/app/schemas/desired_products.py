import base64
import binascii
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from urllib.parse import urlsplit

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.base import APIModel, NonNegativeMoney, PositiveMoney, serialize_datetime


Priority = Literal["low", "medium", "high"]
ProductStatus = Literal["want", "planning", "ready", "bought", "abandoned"]
PaymentMethod = Literal["cash", "pix", "credit", "boleto", "other"]
MAX_IMAGE_BYTES = 1024 * 1024


def _clean_text(value: str | None) -> str | None:
    cleaned = value.strip() if value else ""
    return cleaned or None


def _check_cents(value: Decimal | None) -> Decimal | None:
    if value is not None and value != value.quantize(Decimal("0.01")):
        raise ValueError("Use no máximo duas casas decimais")
    return value


def _validate_image(value: str | None) -> str | None:
    if value is None:
        return None
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})", value)
    if not match or len(match[2]) > 4 * ((MAX_IMAGE_BYTES + 2) // 3):
        raise ValueError("Envie uma imagem PNG, JPEG ou WebP de até 1 MB")
    try:
        data = base64.b64decode(match[2], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Imagem inválida") from exc
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Envie uma imagem de até 1 MB")
    signatures = {
        "png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "jpeg": data.startswith(b"\xff\xd8\xff"),
        "webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP",
    }
    if not signatures[match[1]]:
        raise ValueError("O conteúdo não corresponde ao formato da imagem")
    return value


def _validate_url(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned:
        parts = urlsplit(cleaned)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
            raise ValueError("Informe um link HTTP ou HTTPS válido")
    return cleaned


class PlanningModel(APIModel):
    # Preserve decimal amounts on the wire as well as in database calculations.
    model_config = ConfigDict(extra="forbid", json_encoders={Decimal: str, datetime: serialize_datetime})


class ProductCreate(PlanningModel):
    name: str = Field(min_length=1, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    image_data: str | None = None
    priority: Priority = "medium"
    target_price: NonNegativeMoney | None = None
    planned_purchase_date: date | None = None
    status: Literal["want", "planning", "ready", "abandoned"] = "want"

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        cleaned = _clean_text(value)
        if not cleaned:
            raise ValueError("O nome é obrigatório")
        return cleaned

    @field_validator("category", "description")
    @classmethod
    def clean_optional(cls, value):
        return _clean_text(value)

    @field_validator("image_data")
    @classmethod
    def valid_image(cls, value):
        return _validate_image(value)

    @field_validator("target_price")
    @classmethod
    def valid_money(cls, value):
        return _check_cents(value)


class ProductUpdate(PlanningModel):
    name: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    image_data: str | None = None
    priority: Priority | None = None
    target_price: NonNegativeMoney | None = None
    planned_purchase_date: date | None = None
    status: Literal["want", "planning", "ready", "abandoned"] | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        cleaned = _clean_text(value)
        if not cleaned:
            raise ValueError("O nome é obrigatório")
        return cleaned

    @field_validator("category", "description")
    @classmethod
    def clean_optional(cls, value):
        return _clean_text(value)

    @field_validator("image_data")
    @classmethod
    def valid_image(cls, value):
        return _validate_image(value)

    @field_validator("target_price")
    @classmethod
    def valid_money(cls, value):
        return _check_cents(value)


    @model_validator(mode="after")
    def require_nonnullable_fields(self):
        for field in ("name", "priority", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} não pode ser nulo")
        return self


class OfferPayload(PlanningModel):
    store: str = Field(min_length=1, max_length=150)
    url: str | None = Field(default=None, max_length=2048)
    price: PositiveMoney
    shipping: NonNegativeMoney | None = None
    payment_method: PaymentMethod = "cash"
    installment_count: int | None = Field(default=None, ge=1, le=60)
    installment_amount: PositiveMoney | None = None
    notes: str | None = Field(default=None, max_length=2000)
    recorded_at: date = Field(default_factory=date.today)

    @field_validator("store")
    @classmethod
    def clean_store(cls, value):
        cleaned = _clean_text(value)
        if not cleaned:
            raise ValueError("A loja é obrigatória")
        return cleaned

    @field_validator("url")
    @classmethod
    def valid_url(cls, value):
        return _validate_url(value)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value):
        return _clean_text(value)

    @field_validator("price", "shipping", "installment_amount")
    @classmethod
    def valid_money(cls, value):
        return _check_cents(value)

    @model_validator(mode="after")
    def valid_installments(self):
        if self.payment_method == "credit" and self.installment_count is None:
            raise ValueError("Informe a quantidade de parcelas")
        if self.payment_method != "credit" and (self.installment_count is not None or self.installment_amount is not None):
            raise ValueError("Parcelas só são permitidas no cartão de crédito")
        return self


class PurchasePayload(PlanningModel):
    chosen_offer_id: int = Field(gt=0)
    paid_price: PositiveMoney
    purchase_date: date
    payment_method: PaymentMethod
    installment_count: int | None = Field(default=None, ge=1, le=60)
    installment_amount: PositiveMoney | None = None

    @field_validator("paid_price", "installment_amount")
    @classmethod
    def valid_money(cls, value):
        return _check_cents(value)

    @model_validator(mode="after")
    def valid_installments(self):
        if self.payment_method == "credit" and self.installment_count is None:
            raise ValueError("Informe a quantidade de parcelas")
        if self.payment_method != "credit" and (self.installment_count is not None or self.installment_amount is not None):
            raise ValueError("Parcelas só são permitidas no cartão de crédito")
        return self


class PriceHistoryOut(PlanningModel):
    id: int
    price: Decimal
    shipping: Decimal | None
    payment_method: str
    installment_count: int | None
    installment_amount: Decimal | None
    total_cost: Decimal
    recorded_at: date
    source: str
    created_at: datetime


class OfferOut(PlanningModel):
    id: int
    product_id: int
    store: str
    url: str | None
    price: Decimal
    shipping: Decimal | None
    payment_method: str
    installment_count: int | None
    installment_amount: Decimal | None
    notes: str | None
    recorded_at: date
    source: str
    total_cost: Decimal
    price_history: list[PriceHistoryOut]


class ProductOut(PlanningModel):
    id: int
    name: str
    category: str | None
    description: str | None
    image_data: str | None
    image_source: str
    priority: str
    target_price: Decimal | None
    planned_purchase_date: date | None
    status: ProductStatus
    chosen_offer_id: int | None
    purchase_offer_snapshot: dict | None
    purchase_store: str | None
    paid_price: Decimal | None
    purchase_date: date | None
    purchase_payment_method: str | None
    purchase_installment_count: int | None
    purchase_installment_amount: Decimal | None
    best_offer_id: int | None
    best_price: Decimal | None
    highest_price: Decimal | None
    savings: Decimal | None
    offer_count: int
    offers: list[OfferOut]
