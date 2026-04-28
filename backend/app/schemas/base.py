from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})
