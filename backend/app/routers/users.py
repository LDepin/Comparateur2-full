from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from ..core.db import get_db
from ..core.security import get_current_user_email
from ..models.user import User
from ..models.traveler_profile import TravelerProfile

router = APIRouter(prefix="/api/users", tags=["users"])

class MeResponse(BaseModel):
    email: EmailStr
    profiles: list[dict]

@router.get("/me", response_model=MeResponse)
def get_me(email: str = Depends(get_current_user_email), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user); db.commit(); db.refresh(user)
    profs = (
        db.query(TravelerProfile.id, TravelerProfile.label, TravelerProfile.default_for_search)
        .filter(TravelerProfile.user_id == user.id)
        .order_by(TravelerProfile.created_at.asc())
        .all()
    )
    return MeResponse(
        email=user.email,
        profiles=[{"id": pid, "label": label, "default_for_search": dfs} for (pid, label, dfs) in profs]
    )
