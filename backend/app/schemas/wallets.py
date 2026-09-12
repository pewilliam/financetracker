from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import Field, field_validator

from app.schemas.base import APIModel, MoneyValue, PositiveMoney


WalletType = Literal["checking", "digital", "cash", "reserve", "investment", "other"]


class WalletCreate(APIModel):
    name: str = Field(min_length=1, max_length=100)
    institution: Optional[str] = Field(default=None, max_length=100)
    type: WalletType = "other"
    initial_balance: MoneyValue = Decimal("0.00")
    tracking_started_on: date
    color: str = "#14A078"
    icon: Optional[str] = Field(default=None, max_length=40)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Wallet name is required")
        return cleaned

    @field_validator("institution")
    @classmethod
    def clean_institution(cls, value: Optional[str]) -> Optional[str]:
        cleaned = " ".join((value or "").split())
        return cleaned or None

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str) -> str:
        import re
        return value.upper() if re.fullmatch(r"#[0-9A-Fa-f]{6}", value or "") else "#14A078"


class WalletUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    institution: Optional[str] = Field(default=None, max_length=100)
    type: Optional[WalletType] = None
    tracking_started_on: Optional[date] = None
    color: Optional[str] = None
    icon: Optional[str] = Field(default=None, max_length=40)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Wallet name is required")
        return cleaned

    @field_validator("institution")
    @classmethod
    def clean_institution(cls, value: Optional[str]) -> Optional[str]:
        cleaned = " ".join((value or "").split())
        return cleaned or None

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: Optional[str]) -> Optional[str]:
        import re
        if value is None:
            return None
        return value.upper() if re.fullmatch(r"#[0-9A-Fa-f]{6}", value) else "#14A078"


class WalletOut(APIModel):
    id: int
    name: str
    institution: Optional[str] = None
    type: str
    initial_balance: Decimal
    tracking_started_on: date
    color: str
    icon: Optional[str] = None
    active: bool
    current_balance: Decimal = Decimal("0.00")
    total_income: Decimal = Decimal("0.00")
    total_expenses: Decimal = Decimal("0.00")
    transaction_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WalletSummaryOut(APIModel):
    total_balance: Decimal
    active_count: int
    wallets: list[WalletOut]
    needs_organization: bool = False


class WalletAdjustmentCreate(APIModel):
    actual_balance: MoneyValue
    date: date
    description: Optional[str] = Field(default=None, max_length=255)


class WalletTransferCreate(APIModel):
    source_wallet_id: int
    destination_wallet_id: int
    amount: PositiveMoney
    date: date
    description: Optional[str] = Field(default=None, max_length=255)


class WalletMovementOut(APIModel):
    id: int
    kind: Literal["income", "expense", "adjustment", "transfer_in", "transfer_out", "initial_balance"]
    date: date
    amount: Decimal
    description: Optional[str] = None
    wallet_id: int
    counterpart_wallet_id: Optional[int] = None
    counterpart_wallet_name: Optional[str] = None
    created_at: Optional[datetime] = None


class WalletDetailOut(WalletOut):
    movements: list[WalletMovementOut] = []
