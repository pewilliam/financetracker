from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    InstallmentItem,
    InstallmentPurchase,
    Invoice,
    InvoiceItem,
    InvoiceTemplate,
    Transaction,
    User,
)
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


def _blocked_template_ids(db: Session, user_id: int) -> set[int]:
    """Templates with real financial history must never be deleted as cleanup."""
    rows = (
        db.query(Invoice.template_id)
        .outerjoin(InvoiceItem, InvoiceItem.invoice_id == Invoice.id)
        .outerjoin(InstallmentItem, InstallmentItem.invoice_id == Invoice.id)
        .outerjoin(InstallmentPurchase, InstallmentPurchase.first_invoice_id == Invoice.id)
        .filter(
            Invoice.user_id == user_id,
            or_(
                Invoice.total_amount != 0,
                InvoiceItem.id.isnot(None),
                InstallmentItem.id.isnot(None),
                InstallmentPurchase.id.isnot(None),
            ),
        )
        .distinct()
        .all()
    )
    return {template_id for (template_id,) in rows}


def _out(
    template: InvoiceTemplate,
    counts: dict[int, tuple[int, int]],
    blocked_template_ids: set[int] | None = None,
) -> InvoiceTemplateOut:
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
        can_delete=not template.active and template.id not in (blocked_template_ids or set()),
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
    blocked_template_ids = _blocked_template_ids(db, current_user.id)
    return [_out(template, counts, blocked_template_ids) for template in templates]


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
    return _out(template, _template_counts(db, current_user.id), _blocked_template_ids(db, current_user.id))


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
    return _out(template, _template_counts(db, current_user.id), _blocked_template_ids(db, current_user.id))


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
    if template.active:
        raise HTTPException(status_code=409, detail="Desative o modelo antes de excluí-lo.")
    if template.id in _blocked_template_ids(db, current_user.id):
        raise HTTPException(
            status_code=409,
            detail="Este modelo possui faturas com histórico financeiro e não pode ser excluído.",
        )

    # Empty invoices only contain the automatically generated zero-value
    # transaction. Remove both sides of that link before deleting the model.
    invoices = (
        db.query(Invoice)
        .filter(Invoice.user_id == current_user.id, Invoice.template_id == template.id)
        .all()
    )
    invoice_ids = [invoice.id for invoice in invoices]
    linked_transaction_ids = [invoice.linked_transaction_id for invoice in invoices if invoice.linked_transaction_id]
    for invoice in invoices:
        invoice.linked_transaction_id = None
    if invoices:
        db.flush()
        transaction_query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
        if linked_transaction_ids:
            transaction_query = transaction_query.filter(
                or_(Transaction.invoice_id.in_(invoice_ids), Transaction.id.in_(linked_transaction_ids))
            )
        else:
            transaction_query = transaction_query.filter(Transaction.invoice_id.in_(invoice_ids))
        transaction_query.delete(synchronize_session=False)
        for invoice in invoices:
            db.delete(invoice)
        db.flush()
    db.delete(template)
    db.commit()
    return None
