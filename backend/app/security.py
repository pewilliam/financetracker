import os
import warnings
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
IS_PRODUCTION = os.getenv("APP_ENV", "development").lower() in {"production", "prod"}
if IS_PRODUCTION and len(SECRET_KEY) < 32:
    raise RuntimeError("JWT_SECRET_KEY must contain at least 32 characters in production")
if not SECRET_KEY:
    SECRET_KEY = "development-only-change-this-jwt-secret"
    warnings.warn("JWT_SECRET_KEY is not configured; using an insecure development key", RuntimeWarning, stacklevel=2)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "7"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        # Existing passlib bcrypt hashes use the first 72 UTF-8 bytes.
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("ascii"))
    except (TypeError, ValueError, UnicodeError, AttributeError):
        return False


def create_access_token(user: User) -> str:
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user.id),
        "ver": int(user.auth_version or 0),
        "iat": issued_at,
        "exp": expires_at,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        token_version = int(payload.get("ver", 0))
        if user_id <= 0 or token_version < 0:
            raise credentials_exception
    except (InvalidTokenError, TypeError, ValueError) as exc:
        raise credentials_exception from exc

    user = db.get(User, user_id)
    if user is None or int(user.auth_version or 0) != token_version:
        raise credentials_exception
    return user
