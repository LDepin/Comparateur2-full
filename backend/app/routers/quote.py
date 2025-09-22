# backend/app/routers/quote.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..core.security import get_current_user_email
from ..core.db import get_db
from ..models.user import User
from ..models.traveler_profile import TravelerProfile
import json

router = APIRouter(prefix="/api", tags=["quote"])

# ====== I/O models ======

class QuoteIn(BaseModel):
    origin: str = Field(..., min_length=3, max_length=3, description="IATA ex: PAR")
    destination: str = Field(..., min_length=3, max_length=3, description="IATA ex: BCN")
    date: str = Field(..., description="YYYY-MM-DD")

class QuoteOut(BaseModel):
    total: int
    currency: str = "EUR"
    breakdown: dict

# ====== helpers ======

def _as_dict(v):
    """Normalize db JSON fields that might come back as str/None."""
    if v is None:
        return {}
    if isinstance(v, dict):
        return v
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return {}
    return {}

# ====== route ======

@router.post("/quote", response_model=QuoteOut)
def get_quote(
    payload: QuoteIn,
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    # Auto-provision user if needed
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)

    # Default profile (first created or explicit default)
    prof = (
        db.query(TravelerProfile)
        .filter(TravelerProfile.user_id == user.id)
        .filter(TravelerProfile.default_for_search == True)  # noqa: E712
        .order_by(TravelerProfile.created_at.asc())
        .first()
    )

    # --- toy pricing logic (deterministic but looks “real”) ---
    base = 79
    breakdown = {"base": base}

    # simple zone adjust: different first letter of IATA => +10
    if payload.origin[0] != payload.destination[0]:
        breakdown["zone_adjust"] = 10

    if prof:
        student = bool(getattr(prof, "student", False))
        youth = bool(getattr(prof, "youth", False))
        senior = bool(getattr(prof, "senior", False))
        has_disability = bool(getattr(prof, "has_disability", False))

        baggage = _as_dict(getattr(prof, "baggage", None))
        pet = _as_dict(getattr(prof, "pet", None))
        discount_cards = getattr(prof, "discount_cards", None) or []

        if senior:
            breakdown["senior_discount"] = -8
        if student or youth:
            breakdown["youth_discount"] = -5
        if (baggage.get("checked") or 0) > 0:
            breakdown["checked_bag"] = 25
        if (baggage.get("cabin") or 0) > 0:
            breakdown["cabin_bag"] = 10
        if pet.get("type"):
            breakdown["pet_fee"] = 35
        if has_disability:
            breakdown["assistance"] = 0
        if discount_cards:
            breakdown["cards_rebate"] = -7

    total = int(sum(breakdown.values()))
    return QuoteOut(total=total, currency="EUR", breakdown=breakdown)