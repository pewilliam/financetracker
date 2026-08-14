import re
from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.models import Simulation, SimulationItem, User
from app.routers.months import _build_month_data, _summarize_month_data
from app.schemas.simulations import (
    SimulationCreate,
    SimulationItemPayload,
    SimulationOut,
    SimulationPreviewOut,
    SimulationPreviewPayload,
    SimulationUpdate,
)
from app.security import get_current_user
from app.services.simulations import RealMonth, calculate_planning, month_from_index, month_index

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


def _validate_month_value(value: str, detail: str) -> None:
    if not MONTH_RE.match(value or ""):
        raise HTTPException(status_code=400, detail=detail)
    if not 1 <= int(value[-2:]) <= 12:
        raise HTTPException(status_code=400, detail=detail)


def _validate_item(item: SimulationItemPayload) -> None:
    if item.type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid simulation item type")
    if item.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail="Invalid simulation item mode")
    if item.value_mode not in VALID_VALUE_MODES:
        raise HTTPException(status_code=400, detail="Invalid simulation item value mode")
    _validate_month_value(item.start_month, "Invalid simulation item month")
    if item.type == "income" and item.mode == "installment":
        raise HTTPException(status_code=400, detail="Income simulations should use cash or recurring mode")
    if item.type == "expense" and item.mode == "recurring":
        raise HTTPException(status_code=400, detail="Expense simulations should use cash or installment mode")


def _validate_reserve(mode: str, value: Decimal) -> None:
    if mode == "percentage" and value > Decimal("100"):
        raise HTTPException(status_code=400, detail="Reserve percentage cannot exceed 100")


def _validate_reserve_source(position: int | None, items) -> None:
    if position is None:
        return
    if position >= len(items) or items[position].type != "income":
        raise HTTPException(status_code=400, detail="Reserve source must be a simulated income item")


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


@router.post("/preview", response_model=SimulationPreviewOut)
def preview_simulation(
    payload: SimulationPreviewPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_month_value(payload.start_month, "Invalid simulation period")
    _validate_month_value(payload.end_month, "Invalid simulation period")
    if payload.reserve_start_month is not None:
        _validate_month_value(payload.reserve_start_month, "Invalid reserve start month")
    try:
        start_index = month_index(payload.start_month)
        end_index = month_index(payload.end_month)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid simulation period")
    if end_index < start_index or end_index - start_index >= 120:
        raise HTTPException(status_code=400, detail="Simulation period must contain between 1 and 120 months")
    _validate_reserve(payload.reserve_mode, payload.reserve_value)
    for item in payload.items:
        _validate_item(item)
    _validate_reserve_source(payload.reserve_source_item_position, payload.items)

    real_months = []
    current_balance = Decimal("0.00")
    for index in range(start_index, end_index + 1):
        month_value = month_from_index(index)
        year, month = (int(part) for part in month_value.split("-"))
        month_summary = _summarize_month_data(
            _build_month_data(db, year, month, current_user.id)
        )
        if index == start_index:
            current_balance = month_summary.current_balance
        real_months.append(
            RealMonth(
                month=month_value,
                total_income=month_summary.total_income,
                total_expenses=month_summary.total_expenses,
                projected_closing=month_summary.projected_closing,
            )
        )

    return calculate_planning(
        current_balance=current_balance,
        include_real=payload.include_real,
        real_months=real_months,
        items=payload.items,
        reserve_mode=payload.reserve_mode,
        reserve_value=payload.reserve_value,
        reserve_start_month=payload.reserve_start_month,
        reserve_source_item_position=payload.reserve_source_item_position,
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
    _validate_reserve(payload.reserve_mode, payload.reserve_value)
    if payload.reserve_start_month is not None:
        _validate_month_value(payload.reserve_start_month, "Invalid reserve start month")
    _validate_reserve_source(payload.reserve_source_item_position, payload.items)
    simulation = Simulation(
        user_id=current_user.id,
        name=_validate_name(payload.name),
        include_real=payload.include_real,
        reserve_mode=payload.reserve_mode,
        reserve_value=_money(payload.reserve_value),
        reserve_start_month=payload.reserve_start_month,
        reserve_source_item_position=payload.reserve_source_item_position,
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
    if payload.reserve_mode is not None:
        simulation.reserve_mode = payload.reserve_mode
    if payload.reserve_value is not None:
        simulation.reserve_value = _money(payload.reserve_value)
    if payload.reserve_start_month is not None:
        _validate_month_value(payload.reserve_start_month, "Invalid reserve start month")
        simulation.reserve_start_month = payload.reserve_start_month
    if "reserve_source_item_position" in payload.model_fields_set:
        simulation.reserve_source_item_position = payload.reserve_source_item_position
    _validate_reserve(simulation.reserve_mode, simulation.reserve_value)
    if payload.items is not None:
        _replace_items(simulation, payload.items)
    _validate_reserve_source(simulation.reserve_source_item_position, simulation.items)
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
