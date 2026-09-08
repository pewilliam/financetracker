from datetime import datetime
from typing import Optional
from pydantic import EmailStr, Field, field_validator, model_validator
from app.schemas.base import APIModel
from app.validation import validate_password_strength


class UserCreate(APIModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters long")
        return cleaned

    @model_validator(mode="after")
    def strong_password(self):
        validate_password_strength(self.password, name=self.name, email=str(self.email))
        return self


class UserUpdate(APIModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr = Field(max_length=254)
    current_password: Optional[str] = Field(default=None, max_length=128)
    allow_overdue_invoice_edits: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters long")
        return cleaned


class PasswordUpdate(APIModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return validate_password_strength(value)


class LoginPayload(APIModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)


class UserOut(APIModel):
    id: int
    name: str
    email: EmailStr
    allow_overdue_invoice_edits: bool = False
    created_at: Optional[datetime] = None


class TokenOut(APIModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
