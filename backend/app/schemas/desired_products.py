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
    if (match[1] == "png" and b"acTL" in data) or (match[1] == "webp" and b"ANIM" in data):
        raise ValueError("Envie uma imagem estática; use URL para mídia animada")
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


class MediaFrame(PlanningModel):
    fit: Literal["contain", "cover"] = "contain"
    x: float = Field(default=50, ge=0, le=100, allow_inf_nan=False)
    y: float = Field(default=50, ge=0, le=100, allow_inf_nan=False)
    zoom: float = Field(default=1, ge=1, le=3, allow_inf_nan=False)


class ProductCreate(PlanningModel):
    name: str = Field(min_length=1, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    category_id: int | None = Field(default=None, gt=0)
    ean: str | None = Field(default=None, max_length=14)
    source_url: str | None = Field(default=None, max_length=2048)
    image_source: Literal["manual", "url"] = "manual"
    description: str | None = Field(default=None, max_length=2000)
    image_data: str | None = None
    media_url: str | None = Field(default=None, max_length=2048)
    media_type: Literal["image", "video"] = "image"
    media_frame: MediaFrame = Field(default_factory=MediaFrame)
    priority: Priority = "medium"
    target_price: NonNegativeMoney | None = None
    planned_purchase_date: date | None = None
    status: Literal["want", "planning", "ready", "abandoned"] = "want"

    @field_validator("ean")
    @classmethod
    def valid_ean(cls, value):
        cleaned = _clean_text(value)
        if cleaned and not re.fullmatch(r"(?:\d{8}|\d{12}|\d{13}|\d{14})", cleaned):
            raise ValueError("Informe um EAN/GTIN com 8, 12, 13 ou 14 dígitos")
        return cleaned

    @field_validator("source_url", "media_url")
    @classmethod
    def valid_source_url(cls, value):
        return _validate_url(value)

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
    category_id: int | None = Field(default=None, gt=0)
    ean: str | None = Field(default=None, max_length=14)
    source_url: str | None = Field(default=None, max_length=2048)
    image_source: Literal["manual", "url"] = "manual"
    description: str | None = Field(default=None, max_length=2000)
    image_data: str | None = None
    media_url: str | None = Field(default=None, max_length=2048)
    media_type: Literal["image", "video"] = "image"
    media_frame: MediaFrame | None = None
    priority: Priority | None = None
    target_price: NonNegativeMoney | None = None
    planned_purchase_date: date | None = None
    analysis_offer_id: int | None = Field(default=None, gt=0)
    analysis_first_payment_date: date | None = None
    status: Literal["want", "planning", "ready", "abandoned"] | None = None

    @field_validator("ean")
    @classmethod
    def valid_ean(cls, value):
        cleaned = _clean_text(value)
        if cleaned and not re.fullmatch(r"(?:\d{8}|\d{12}|\d{13}|\d{14})", cleaned):
            raise ValueError("Informe um EAN/GTIN com 8, 12, 13 ou 14 dígitos")
        return cleaned

    @field_validator("source_url", "media_url")
    @classmethod
    def valid_source_url(cls, value):
        return _validate_url(value)

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

    @field_validator("analysis_first_payment_date")
    @classmethod
    def valid_analysis_date(cls, value):
        if value is not None and not 2000 <= value.year <= 2100:
            raise ValueError("A data do primeiro pagamento deve ficar entre 2000 e 2100")
        return value


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
    source: Literal["manual", "serpapi"] = "manual"

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


class OfferSearchResult(PlanningModel):
    external_id: str
    title: str
    store: str
    price: Decimal
    shipping: Decimal | None
    shipping_label: str | None
    url: str
    image_url: str | None
    rating: float | None
    reviews: int | None
    installment_count: int | None
    installment_amount: Decimal | None
    resolution_token: str | None = None
    source: Literal["serpapi"]


class OfferSearchResolvePayload(PlanningModel):
    resolution_token: str = Field(min_length=20, max_length=6000)
    store: str = Field(min_length=1, max_length=150)
    price: PositiveMoney

    @field_validator("resolution_token", "store")
    @classmethod
    def clean_search_fields(cls, value: str) -> str:
        return value.strip()


class OfferSearchResolved(PlanningModel):
    url: str


class PurchaseAnalysisPayload(PlanningModel):
    offer_id: int = Field(gt=0)
    first_payment_date: date

    @field_validator("first_payment_date")
    @classmethod
    def valid_analysis_date(cls, value: date) -> date:
        if not 2000 <= value.year <= 2100:
            raise ValueError("A data do primeiro pagamento deve ficar entre 2000 e 2100")
        return value


class PurchaseAnalysisMonthOut(PlanningModel):
    month: str
    installment_number: int
    installment_count: int
    amount: Decimal
    registered_income: Decimal
    registered_expenses: Decimal
    budget_configured: bool
    planning_income: Decimal
    planned_reserve: Decimal
    available_budget: Decimal
    free_before: Decimal
    free_after: Decimal
    baseline_projected_closing: Decimal
    projected_closing: Decimal
    cumulative_impact: Decimal
    income_commitment_percent: Decimal | None
    negative_balance: bool
    negative_free_money: bool


class PurchaseAnalysisOut(PlanningModel):
    offer_id: int
    store: str
    payment_method: PaymentMethod
    first_payment_date: date
    first_payment_month: str
    last_payment_month: str
    installment_count: int
    total_cost: Decimal
    average_installment: Decimal
    status: Literal["safe", "attention", "critical"]
    baseline_final_balance: Decimal
    projected_final_balance: Decimal
    minimum_projected_balance: Decimal
    worst_month: str | None
    negative_balance_months: list[str] = Field(default_factory=list)
    negative_free_months: list[str] = Field(default_factory=list)
    rows: list[PurchaseAnalysisMonthOut] = Field(default_factory=list)


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
    is_expired: bool
    total_cost: Decimal
    price_history: list[PriceHistoryOut]
    store_price_history: list[PriceHistoryOut]


class ProductOut(PlanningModel):
    id: int
    name: str
    category: str | None
    category_id: int | None
    ean: str | None
    source_url: str | None
    description: str | None
    image_data: str | None
    media_url: str | None
    media_type: Literal["image", "video"]
    media_frame: MediaFrame
    image_source: str
    priority: str
    target_price: Decimal | None
    planned_purchase_date: date | None
    analysis_offer_id: int | None
    analysis_first_payment_date: date | None
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
