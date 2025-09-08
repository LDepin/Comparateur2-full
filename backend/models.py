from typing import List, Literal, Optional, Dict
from pydantic import BaseModel, Field
from datetime import datetime

Mode = Literal["flight", "train", "bus"]

class PassengerProfile(BaseModel):
    id: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[str] = None  # YYYY-MM-DD
    um: bool = False           # Unaccompanied Minor
    pet: bool = False
    reduced_mobility: bool = False
    # Catégories déduites côté front si dob connu
    kind: Literal["adult", "child", "infant"] = "adult"

class Leg(BaseModel):
    mode: Mode
    origin: str
    destination: str
    depart_iso: str
    arrive_iso: str
    company: Optional[str] = None
    number: Optional[str] = None
    duration_min: int

class Option(BaseModel):
    mode: Mode
    price: float
    currency: str = "EUR"
    total_duration_min: int
    transfers: int = 0
    legs: List[Leg]
    deeplink: Optional[str] = None
    meta: Dict = Field(default_factory=dict)

class SearchRequest(BaseModel):
    origin: str
    destination: str
    date: str  # YYYY-MM-DD
    selected_passengers: List[PassengerProfile] = Field(default_factory=list)
    sort: Literal["price","duration"] = "price"
    direct: bool = False
    view: Literal["month","week","day"] = "month"