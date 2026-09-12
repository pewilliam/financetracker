from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas.auth import LoginPayload, PasswordUpdate, TokenOut, TutorialProgressUpdate, UserCreate, UserOut, UserUpdate
from app.security import create_access_token, get_current_user, hash_password, verify_password
from app.validation import validate_password_strength

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    exists = db.query(User).filter(User.email == email).first()
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from exc
    db.refresh(user)
    return {"access_token": create_access_token(user), "user": user}


@router.post("/login", response_model=TokenOut)
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == str(payload.email).strip().lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {"access_token": create_access_token(user), "user": user}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    email = str(payload.email).strip().lower()
    email_changed = email != current_user.email
    if email_changed and not payload.current_password:
        raise HTTPException(status_code=400, detail="Current password is required to change email")
    if email_changed and not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    exists = (
        db.query(User)
        .filter(User.email == email, User.id != current_user.id)
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")

    current_user.name = payload.name
    current_user.email = email
    if payload.allow_overdue_invoice_edits is not None:
        current_user.allow_overdue_invoice_edits = payload.allow_overdue_invoice_edits
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered") from exc
    db.refresh(current_user)
    return current_user


@router.put("/password")
def update_password(
    payload: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if verify_password(payload.new_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    try:
        validate_password_strength(payload.new_password, name=current_user.name, email=current_user.email)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    current_user.password_hash = hash_password(payload.new_password)
    current_user.auth_version = int(current_user.auth_version or 0) + 1
    db.commit()
    return {"status": "updated", "sessions_revoked": True}


@router.patch("/me/tutorials/{tutorial_name}", response_model=UserOut)
def update_tutorial_progress(
    tutorial_name: str,
    payload: TutorialProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fields = {
        "simulation": "simulation_tutorial_version",
        "months": "months_tutorial_version",
    }
    field = fields.get(tutorial_name)
    if field is None:
        raise HTTPException(status_code=404, detail="Tutorial not found")

    current_version = int(getattr(current_user, field) or 0)
    if payload.version > current_version:
        setattr(current_user, field, payload.version)
        db.commit()
        db.refresh(current_user)
    return current_user
