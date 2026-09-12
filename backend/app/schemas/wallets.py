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
    is_primary: bool = False
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


class WalletConsolidationCreate(APIModel):
    source_wallet_id: int
    destination_wallet_id: int
    adjust_tracking_start: bool = True


class WalletConsolidationPreview(APIModel):
    source_wallet_id: int
    destination_wallet_id: int
    transaction_count: int
    expense_count: int
    expense_total: Decimal
    realized_expense_total: Decimal
    income_count: int
    income_total: Decimal
    realized_income_total: Decimal
    recurrence_count: int
    expense_recurrence_count: int
    income_recurrence_count: int
    adjustment_count: int
    initial_balance: Decimal
    direct_transfer_count: int
    direct_transfer_total: Decimal
    redirected_transfer_count: int
    earliest_date: Optional[date] = None
    latest_date: Optional[date] = None
    source_balance_before: Decimal
    source_balance_after: Decimal
    destination_balance_before: Decimal
    destination_balance_after: Decimal
    total_balance_before: Decimal
    total_balance_after: Decimal
    tracking_start_before: date
    tracking_start_after: date
    tracking_start_changes: bool
    destination_becomes_primary: bool


class WalletConsolidationResult(APIModel):
    moved_transaction_count: int
    moved_recurrence_count: int
    moved_adjustment_count: int
    removed_transfer_count: int
    redirected_transfer_count: int
    source_wallet: WalletOut
    destination_wallet: WalletOut


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


class WalletMovementPageOut(APIModel):
    items: list[WalletMovementOut] = Field(default_factory=list)
    page: int
    page_size: int
    total: int
    total_pages: int
    year: int
    month: int
