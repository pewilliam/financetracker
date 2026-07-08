from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.database import Base


class Simulation(Base):
    __tablename__ = "simulations"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_simulations_user_name"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    include_real = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="simulations")
    items = relationship(
        "SimulationItem",
        back_populates="simulation",
        cascade="all, delete-orphan",
        order_by="SimulationItem.position",
    )
