from sqlalchemy import Column, ForeignKey, Integer, JSON, Numeric, String
from sqlalchemy.orm import relationship
from app.database import Base


class SimulationItem(Base):
    __tablename__ = "simulation_items"

    id = Column(Integer, primary_key=True)
    simulation_id = Column(Integer, ForeignKey("simulations.id"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)
    description = Column(String(255), nullable=False, default="")
    type = Column(String(20), nullable=False)
    mode = Column(String(20), nullable=False)
    total_amount = Column(Numeric(10, 2), nullable=False, default=0)
    installment_count = Column(Integer, nullable=False, default=1)
    recurrence_count = Column(Integer, nullable=False, default=1)
    value_mode = Column(String(20), nullable=False, default="equal")
    start_month = Column(String(7), nullable=False)
    custom_values = Column(JSON, nullable=True)

    simulation = relationship("Simulation", back_populates="items")
