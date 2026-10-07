from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, func
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import relationship

from app.database import Base


class DesiredProduct(Base):
    __tablename__ = "desired_products"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)  # Legacy label for older clients/rows.
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    ean = Column(String(14), nullable=True)
    source_url = Column(String(2048), nullable=True)
    description = Column(Text, nullable=True)
    image_data = Column(Text().with_variant(LONGTEXT(), "mysql"), nullable=True)
    media_url = Column(String(2048), nullable=True)
    media_type = Column(String(10), nullable=False, default="image")
    media_frame = Column(JSON, nullable=True)
    image_source = Column(String(20), nullable=False, default="manual")
    priority = Column(String(10), nullable=False, default="medium")
    target_price = Column(Numeric(10, 2), nullable=True)
    planned_purchase_date = Column(Date, nullable=True)
    analysis_offer_id = Column(Integer, nullable=True)
    analysis_first_payment_date = Column(Date, nullable=True)
    status = Column(String(30), nullable=False, default="want")
    chosen_offer_id = Column(Integer, nullable=True)
    purchase_offer_snapshot = Column(JSON, nullable=True)
    purchase_store = Column(String(150), nullable=True)
    paid_price = Column(Numeric(10, 2), nullable=True)
    purchase_date = Column(Date, nullable=True)
    purchase_payment_method = Column(String(20), nullable=True)
    purchase_installment_count = Column(Integer, nullable=True)
    purchase_installment_amount = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="desired_products")
    selected_category = relationship("Category")
    offers = relationship("ProductOffer", back_populates="product", cascade="all, delete-orphan", order_by="ProductOffer.id")


class ProductOffer(Base):
    __tablename__ = "product_offers"

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("desired_products.id", ondelete="CASCADE"), nullable=False, index=True)
    store = Column(String(150), nullable=False)
    url = Column(String(2048), nullable=True)
    price = Column(Numeric(10, 2), nullable=False)
    shipping = Column(Numeric(10, 2), nullable=True)
    payment_method = Column(String(20), nullable=False, default="cash")
    installment_count = Column(Integer, nullable=True)
    installment_amount = Column(Numeric(10, 2), nullable=True)
    notes = Column(Text, nullable=True)
    recorded_at = Column(Date, nullable=False)
    source = Column(String(20), nullable=False, default="manual")
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    product = relationship("DesiredProduct", back_populates="offers")
    price_history = relationship("OfferPriceHistory", back_populates="offer", cascade="all, delete-orphan", order_by="OfferPriceHistory.id")


class OfferPriceHistory(Base):
    __tablename__ = "offer_price_history"

    id = Column(Integer, primary_key=True)
    offer_id = Column(Integer, ForeignKey("product_offers.id", ondelete="CASCADE"), nullable=False, index=True)
    price = Column(Numeric(10, 2), nullable=False)
    shipping = Column(Numeric(10, 2), nullable=True)
    payment_method = Column(String(20), nullable=False)
    installment_count = Column(Integer, nullable=True)
    installment_amount = Column(Numeric(10, 2), nullable=True)
    total_cost = Column(Numeric(10, 2), nullable=False)
    recorded_at = Column(Date, nullable=False)
    source = Column(String(20), nullable=False, default="manual")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    offer = relationship("ProductOffer", back_populates="price_history")
