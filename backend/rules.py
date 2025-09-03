# backend/rules.py

RULES = {
    # Legacy / majors
    "AF": {"um_ok": True,  "animal_ok": True},   # Air France
    "KL": {"um_ok": True,  "animal_ok": True},   # KLM
    "LH": {"um_ok": True,  "animal_ok": True},   # Lufthansa
    "IB": {"um_ok": False, "animal_ok": True},   # Iberia (exemple)
    "BA": {"um_ok": True,  "animal_ok": True},   # British Airways
    # Low-cost fréquents Europe
    "VY": {"um_ok": True,  "animal_ok": False},  # Vueling (exemple)
    "U2": {"um_ok": True,  "animal_ok": True},   # easyJet (exemple)
    "HV": {"um_ok": True,  "animal_ok": False},  # Transavia
    "FR": {"um_ok": False, "animal_ok": False},  # Ryanair
    "TO": {"um_ok": True,  "animal_ok": False},  # Transavia France
}

def get_rules(airline_code: str):
    # Valeur par défaut conservatrice
    return RULES.get(airline_code, {"um_ok": False, "animal_ok": False})