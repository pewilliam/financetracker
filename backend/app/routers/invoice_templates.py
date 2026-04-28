from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Invoice, InvoiceTemplate, User
from app.schemas.invoice_templates import InvoiceTemplateCreate, InvoiceTemplateOut, InvoiceTemplateUpdate
from app.security import get_current_user
from app.services.invoices import normalize_invoice_color

router = APIRouter(prefix="/api/invoice-templates", tags=["invoice-templates"])


def _template_counts(db: Session, user_id: int) -> dict[int, tuple[int, int]]:
    rows = (
        db.query(
            Invoice.template_id,
            func.count(Invoice.id),
            func.coalesce(func.sum(case((Invoice.paid.is_(False), 1), else_=0)), 0),
        )
        .filter(Invoice.user_id == user_id)
        .group_by(Invoice.template_id)
        .all()
    )
    return {template_id: (int(total or 0), int(pending or 0)) for template_id, total, pending in rows}


def _out(template: InvoiceTemplate, counts: dict[int, tuple[int, int]]) -> InvoiceTemplateOut:
    total, pending = counts.get(template.id, (0, 0))
    return InvoiceTemplateOut(
        id=template.id,
        name=template.name,
        color=template.color,
        default_due_day=template.default_due_day,
        active=template.active,
        created_at=template.created_at,
        total_invoices=total,
        pending_invoices=pending,
    )


@router.get("", response_model=list[InvoiceTemplateOut])
def list_invoice_templates(
    active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(InvoiceTemplate).filter(InvoiceTemplate.user_id == current_user.id)
    if active is not None:
        query = query.filter(InvoiceTemplate.active.is_(active))
    templates = query.order_by(InvoiceTemplate.active.desc(), InvoiceTemplate.name).all()
    counts = _template_counts(db, current_user.id)
    return [_out(template, counts) for template in templates]


@router.post("", response_model=InvoiceTemplateOut)
def create_invoice_template(
    payload: InvoiceTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = InvoiceTemplate(
        user_id=current_user.id,
        name=payload.name.strip(),
        color=normalize_invoice_color(payload.color),
        default_due_day=payload.default_due_day,
        active=True,
    )
    if not template.name:
        raise HTTPException(status_code=400, detail="Name is required")
    db.add(template)
    db.commit()
    db.refresh(template)
    return _out(template, {})


@router.put("/{template_id}", response_model=InvoiceTemplateOut)
def update_invoice_template(
    template_id: int,
    payload: InvoiceTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = (
        db.query(InvoiceTemplate)
        .filter(InvoiceTemplate.id == template_id, InvoiceTemplate.user_id == current_user.id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Invoice template not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        template.name = name
    if payload.color is not None:
        template.color = normalize_invoice_color(payload.color)
    if payload.default_due_day is not None:
        template.default_due_day = payload.default_due_day
    db.commit()
    db.refresh(template)
    return _out(template, _template_counts(db, current_user.id))


@router.patch("/{template_id}/toggle", response_model=InvoiceTemplateOut)
def toggle_invoice_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = (
        db.query(InvoiceTemplate)
        .filter(InvoiceTemplate.id == template_id, InvoiceTemplate.user_id == current_user.id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Invoice template not found")
    template.active = not template.active
    db.commit()
    db.refresh(template)
    return _out(template, _template_counts(db, current_user.id))


@router.delete("/{template_id}", status_code=204)
def delete_invoice_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = (
        db.query(InvoiceTemplate)
        .filter(InvoiceTemplate.id == template_id, InvoiceTemplate.user_id == current_user.id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Invoice template not found")
    pending = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.user_id == current_user.id, Invoice.template_id == template.id, Invoice.paid.is_(False))
        .scalar()
    )
    if pending:
        raise HTTPException(
            status_code=409,
            detail=f"Existem {pending} faturas pendentes vinculadas a este modelo. Quite-as ou desative o modelo.",
        )
    total = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.user_id == current_user.id, Invoice.template_id == template.id)
        .scalar()
    )
    if total:
        raise HTTPException(status_code=409, detail="Este modelo ainda possui faturas históricas vinculadas.")
    db.delete(template)
    db.commit()
    return None
