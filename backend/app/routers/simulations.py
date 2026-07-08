import re
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Simulation, SimulationItem, User
from app.schemas.simulations import SimulationCreate, SimulationItemPayload, SimulationOut, SimulationUpdate
from app.security import get_current_user

router = APIRouter(prefix="/api/simulations", tags=["simulations"])

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
VALID_TYPES = {"expense", "income"}
VALID_MODES = {"cash", "installment", "recurring"}
VALID_VALUE_MODES = {"equal", "different"}


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _validate_name(name: str) -> str:
    normalized = (name or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Simulation name is required")
    return normalized[:255]


def _validate_item(item: SimulationItemPayload) -> None:
    if item.type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid simulation item type")
    if item.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail="Invalid simulation item mode")
    if item.value_mode not in VALID_VALUE_MODES:
        raise HTTPException(status_code=400, detail="Invalid simulation item value mode")
    if not MONTH_RE.match(item.start_month or ""):
        raise HTTPException(status_code=400, detail="Invalid simulation item month")
    month = int(item.start_month[-2:])
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid simulation item month")
    if item.type == "income" and item.mode == "installment":
        raise HTTPException(status_code=400, detail="Income simulations should use cash or recurring mode")
    if item.type == "expense" and item.mode == "recurring":
        raise HTTPException(status_code=400, detail="Expense simulations should use cash or installment mode")


def _load_simulation(db: Session, simulation_id: int, user_id: int) -> Simulation:
    simulation = (
        db.query(Simulation)
        .options(selectinload(Simulation.items))
        .filter(Simulation.id == simulation_id, Simulation.user_id == user_id)
        .first()
    )
    if not simulation:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return simulation


def _replace_items(simulation: Simulation, items: list[SimulationItemPayload]) -> None:
    simulation.items = []
    for index, item in enumerate(items):
        _validate_item(item)
        simulation.items.append(
            SimulationItem(
                position=index,
                description=(item.description or "").strip()[:255],
                type=item.type,
                mode=item.mode,
                total_amount=_money(item.total_amount),
                installment_count=item.installment_count,
                recurrence_count=item.recurrence_count,
                value_mode=item.value_mode,
                start_month=item.start_month,
                custom_values=[float(_money(value)) for value in item.custom_values],
            )
        )


@router.get("", response_model=list[SimulationOut])
def list_simulations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Simulation)
        .options(selectinload(Simulation.items))
        .filter(Simulation.user_id == current_user.id)
        .order_by(Simulation.updated_at.desc(), Simulation.id.desc())
        .all()
    )


@router.get("/{simulation_id}", response_model=SimulationOut)
def get_simulation(
    simulation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _load_simulation(db, simulation_id, current_user.id)


@router.post("", response_model=SimulationOut)
def create_simulation(
    payload: SimulationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    simulation = Simulation(
        user_id=current_user.id,
        name=_validate_name(payload.name),
        include_real=payload.include_real,
    )
    db.add(simulation)
    _replace_items(simulation, payload.items)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Simulation name already exists")
    return _load_simulation(db, simulation.id, current_user.id)


@router.put("/{simulation_id}", response_model=SimulationOut)
def update_simulation(
    simulation_id: int,
    payload: SimulationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    simulation = _load_simulation(db, simulation_id, current_user.id)
    if payload.name is not None:
        simulation.name = _validate_name(payload.name)
    if payload.include_real is not None:
        simulation.include_real = payload.include_real
    if payload.items is not None:
        _replace_items(simulation, payload.items)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Simulation name already exists")
    return _load_simulation(db, simulation.id, current_user.id)


@router.delete("/{simulation_id}", status_code=204)
def delete_simulation(
    simulation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    simulation = _load_simulation(db, simulation_id, current_user.id)
    db.delete(simulation)
    db.commit()
    return None
