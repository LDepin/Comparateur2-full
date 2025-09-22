# backend/app/routers/profiles.py

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core.security import get_current_user_email
from ..core.db import get_db
from ..models.user import User
from ..models.traveler_profile import TravelerProfile

router = APIRouter(prefix="/api", tags=["profiles"])


# ---------- Schémas Pydantic (entrée/sortie) ----------

class PetIn(BaseModel):
    # correspond aux colonnes pet_type / pet_in_cabin
    type: Optional[str] = Field(default=None)   # "dog" | "cat" | "other"
    cabin: Optional[bool] = Field(default=None) # True = en cabine


class ProfileIn(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    birthdate: Optional[str] = None

    is_unaccompanied_minor: Optional[bool] = None
    has_disability: Optional[bool] = None
    assistance_needs: Optional[str] = None

    pet: Optional[PetIn] = None

    loyalty_programs: Optional[List[Dict[str, Any]]] = None
    discount_cards: Optional[List[Dict[str, Any]]] = None

    student: Optional[bool] = None
    youth: Optional[bool] = None
    senior: Optional[bool] = None

    baggage: Optional[Dict[str, Optional[int]]] = None  # { "cabin": int?, "checked": int? }
    seating_prefs: Optional[Dict[str, Any]] = None

    default_for_search: Optional[bool] = False


class ProfileOut(BaseModel):
    id: str
    label: str
    default_for_search: bool

    class Config:
        orm_mode = True


# ---------- Helpers ----------

def _ensure_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # création "à la volée" si le user n'existe pas encore
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _apply_payload_to_instance(p: TravelerProfile, payload: ProfileIn) -> None:
    """Mappe proprement le payload Pydantic vers l'instance SQLAlchemy."""
    p.label = payload.label
    p.birthdate = payload.birthdate

    p.is_unaccompanied_minor = payload.is_unaccompanied_minor
    p.has_disability = payload.has_disability
    p.assistance_needs = payload.assistance_needs

    # map "pet"
    if payload.pet is not None:
        p.pet_type = payload.pet.type
        p.pet_in_cabin = payload.pet.cabin

    p.loyalty_programs = payload.loyalty_programs
    p.discount_cards = payload.discount_cards

    p.student = payload.student
    p.youth = payload.youth
    p.senior = payload.senior

    p.baggage = payload.baggage
    p.seating_prefs = payload.seating_prefs

    # booléen
    if payload.default_for_search is not None:
        p.default_for_search = bool(payload.default_for_search)


# ---------- Endpoints ----------

@router.get("/profiles", response_model=List[ProfileOut])
def list_profiles(
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    user = _ensure_user(db, email)
    profs = (
        db.query(TravelerProfile)
        .filter(TravelerProfile.user_id == user.id)
        .order_by(TravelerProfile.created_at.asc())
        .all()
    )
    return profs


@router.post("/profiles", response_model=ProfileOut)
def create_profile(
    payload: ProfileIn,
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    user = _ensure_user(db, email)

    prof = TravelerProfile(user_id=user.id, label=payload.label)
    _apply_payload_to_instance(prof, payload)

    # Si on le crée par défaut → mettre les autres à False
    if bool(payload.default_for_search):
        db.query(TravelerProfile).filter(
            TravelerProfile.user_id == user.id
        ).update({TravelerProfile.default_for_search: False})

        prof.default_for_search = True

    db.add(prof)
    db.commit()
    db.refresh(prof)
    return prof


@router.put("/profiles/{profile_id}", response_model=ProfileOut)
def update_profile(
    profile_id: str,
    payload: ProfileIn,
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    user = _ensure_user(db, email)

    prof = (
        db.query(TravelerProfile)
        .filter(TravelerProfile.id == profile_id, TravelerProfile.user_id == user.id)
        .first()
    )
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found")

    previous_default = prof.default_for_search

    _apply_payload_to_instance(prof, payload)

    # Gestion du "par défaut"
    if payload.default_for_search is True:
        db.query(TravelerProfile).filter(
            TravelerProfile.user_id == user.id
        ).update({TravelerProfile.default_for_search: False})
        prof.default_for_search = True
    elif payload.default_for_search is False and previous_default:
        # empêcher de se retrouver sans aucun profil par défaut :
        prof.default_for_search = False
        # S'il n'en reste aucun, on remet celui-ci par défaut
        remains = db.query(TravelerProfile).filter(
            TravelerProfile.user_id == user.id,
            TravelerProfile.default_for_search == True,  # noqa: E712
        ).count()
        if remains == 0:
            prof.default_for_search = True

    db.commit()
    db.refresh(prof)
    return prof


@router.delete("/profiles/{profile_id}", response_model=Dict[str, bool])
def delete_profile(
    profile_id: str,
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    user = _ensure_user(db, email)

    prof = (
        db.query(TravelerProfile)
        .filter(TravelerProfile.id == profile_id, TravelerProfile.user_id == user.id)
        .first()
    )
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found")

    was_default = bool(prof.default_for_search)

    db.delete(prof)
    db.commit()

    # Si on a supprimé le profil par défaut, on tente d’en mettre un autre
    if was_default:
        other = (
            db.query(TravelerProfile)
            .filter(TravelerProfile.user_id == user.id)
            .order_by(TravelerProfile.created_at.asc())
            .first()
        )
        if other:
            other.default_for_search = True
            db.commit()

    return {"ok": True}


@router.patch("/profiles/{profile_id}/default", response_model=ProfileOut)
def set_default_profile(
    profile_id: str,
    email: str = Depends(get_current_user_email),
    db: Session = Depends(get_db),
):
    user = _ensure_user(db, email)

    # d'abord désactiver tous les autres
    db.query(TravelerProfile).filter(
        TravelerProfile.user_id == user.id
    ).update({TravelerProfile.default_for_search: False})

    prof = (
        db.query(TravelerProfile)
        .filter(TravelerProfile.id == profile_id, TravelerProfile.user_id == user.id)
        .first()
    )
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found")

    prof.default_for_search = True
    db.commit()
    db.refresh(prof)
    return prof