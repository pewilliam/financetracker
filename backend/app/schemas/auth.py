from datetime import datetime
from typing import Optional
from pydantic import EmailStr
from app.schemas.base import APIModel


class UserCreate(APIModel):
    name: str
    email: EmailStr
    password: str


class UserUpdate(APIModel):
    name: str
    email: EmailStr
    allow_overdue_invoice_edits: Optional[bool] = None


class PasswordUpdate(APIModel):
    current_password: str
    new_password: str


class LoginPayload(APIModel):
    email: EmailStr
    password: str


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
