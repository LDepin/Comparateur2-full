from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime
from sqlalchemy.types import JSON
from ..core.db import Base
from datetime import datetime
import uuid

def gen_uuid() -> str:
    return str(uuid.uuid4())

class TravelerProfile(Base):
    __tablename__ = "traveler_profiles"
    id = Column(String, primary_key=True, default=gen_uuid, nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    label = Column(String, nullable=False)
    birthdate = Column(String, nullable=True)
    is_unaccompanied_minor = Column(Boolean, default=False, nullable=False)
    has_disability = Column(Boolean, default=False, nullable=False)
    assistance_needs = Column(String, nullable=True)

    pet_type = Column(String, nullable=True)
    pet_in_cabin = Column(Boolean, nullable=True)

    loyalty_programs = Column(JSON, nullable=True)
    discount_cards = Column(JSON, nullable=True)

    student = Column(Boolean, default=False, nullable=False)
    youth   = Column(Boolean, default=False, nullable=False)
    senior  = Column(Boolean, default=False, nullable=False)

    baggage = Column(JSON, nullable=True)
    seating_prefs = Column(JSON, nullable=True)

    default_for_search = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)