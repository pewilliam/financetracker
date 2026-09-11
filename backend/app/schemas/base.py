from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict
from pydantic import Field


# NUMERIC(10, 2) is the narrowest monetary column used by the application.
# Keeping request validation within the same range prevents database overflows
# even when a client bypasses the browser-side input restrictions.
MAX_MONEY_AMOUNT = Decimal("99999999.99")
MoneyValue = Annotated[Decimal, Field(ge=-MAX_MONEY_AMOUNT, le=MAX_MONEY_AMOUNT)]
NonNegativeMoney = Annotated[Decimal, Field(ge=0, le=MAX_MONEY_AMOUNT)]
PositiveMoney = Annotated[Decimal, Field(gt=0, le=MAX_MONEY_AMOUNT)]


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})
