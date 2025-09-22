from sqlalchemy import Column, Boolean, Integer, DateTime, ForeignKey, func
from sqlalchemy.types import JSON
from ..core.db import Base
import uuid

class PriceAlert(Base):
    __tablename__ = "price_alerts"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    profile_id = Column(String, ForeignKey("traveler_profiles.id", ondelete="SET NULL"))
    query = Column(JSON, nullable=False)
    target_price_cents = Column(Integer, nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())