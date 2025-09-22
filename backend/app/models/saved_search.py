from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.types import JSON
from ..core.db import Base
import uuid

class SavedSearch(Base):
    __tablename__ = "saved_searches"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    profile_id = Column(String, ForeignKey("traveler_profiles.id", ondelete="SET NULL"))
    query = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())