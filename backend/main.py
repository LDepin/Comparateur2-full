from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
import calendar as cal
import asyncio, hashlib, os, random
from typing import Dict, Any, List
from providers.base import ProviderBase, FlightResult

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

PROVIDERS: List[ProviderBase] = []
def _try_import(flag: str, module_path: str, attr: str="provider"):
    if os.getenv(flag, "0") != "1": return
    try:
        mod = __import__(module_path, fromlist=[attr])
        PROVIDERS.append(getattr(mod, attr))
    except Exception:
        pass

_try_import("USE_ENTUR", "providers.entur")
_try_import("USE_NAVITIA", "providers.navitia")
_try_import("USE_RESROBOT", "providers.resrobot")
_try_import("USE_PTX_TAIWAN", "providers.ptx_taiwan")

def _rng(*parts: str) -> random.Random:
    h = hashlib.sha1("|".join(parts).encode()).hexdigest()
    return random.Random(int(h[:12], 16))

def _synthetic_calendar(origin: str, destination: str, month: str)->Dict[str, Dict[str, Any]]:
    y, m = [int(x) for x in month.split("-")]
    days = cal.monthrange(y, m)[1]
    r = _rng("CAL", origin, destination, month)
    out={}
    for d in range(1, days+1):
        dt=f"{y:04d}-{m:02d}-{d:02d}"
        dispo = r.random()>0.05
        out[dt]={"prix": int(r.uniform(32,120)) if dispo else None, "disponible": dispo}
    return out

def _synthetic_search(origin: str, destination: str, date_str: str)->List[Dict[str, Any]]:
    y,m,d=[int(x) for x in date_str.split("-")]
    base=datetime(y,m,d,6,30); r=_rng("SEA",origin,destination,date_str)
    carriers=["AF","U2","VY","IB","KL"]; res=[]
    for _ in range(6):
        dep=base+timedelta(minutes=int(r.uniform(0,14*60)))
        dur=int(r.uniform(90,220)); arr=dep+timedelta(minutes=dur)
        price=int(r.uniform(35,180)); esc=0 if r.random()<0.82 else 1; comp=r.choice(carriers)
        res.append({"compagnie":comp,"prix":price,"depart":origin,"arrivee":destination,
                    "heure_depart":dep.isoformat(timespec="minutes"),
                    "heure_arrivee":arr.isoformat(timespec="minutes"),
                    "duree":f"PT{dur//60}H{dur%60}M","escales":esc,
                    "um_ok": comp in {"AF","IB","KL"}, "animal_ok": comp in {"AF","U2","VY"}})
    res.sort(key=lambda x: x["prix"]); return res

async def _providers_calendar(origin: str, destination: str, month: str):
    if not PROVIDERS: return _synthetic_calendar(origin,destination,month)
    tasks=[p.calendar(origin,destination,month) for p in PROVIDERS]
    merged={}
    for r in await asyncio.gather(*tasks, return_exceptions=True):
        if isinstance(r, dict):
            for day,info in r.items():
                cur=merged.setdefault(day, {"prix":None,"disponible":False})
                if info.get("disponible"):
                    cur["disponible"]=True
                    p=info.get("prix")
                    if isinstance(p,(int,float)):
                        cur["prix"]=p if cur["prix"] is None else min(cur["prix"],p)
    return merged or _synthetic_calendar(origin,destination,month)

async def _providers_search(origin: str, destination: str, date_str: str):
    if not PROVIDERS: return _synthetic_search(origin,destination,date_str)
    tasks=[p.search(origin,destination,date_str) for p in PROVIDERS]
    flat=[]
    for r in await asyncio.gather(*tasks, return_exceptions=True):
        if isinstance(r, list):
            for it in r:
                flat.append(it.to_dict() if hasattr(it,"to_dict") else it)
    return flat or _synthetic_search(origin,destination,date_str)

@app.get("/ping")
async def ping():
    return {"ok":True,"ts":int(datetime.utcnow().timestamp()*1000)}

@app.get("/calendar")
async def calendar_ep(origin: str, destination: str, month: str):
    return {"calendar": await _providers_calendar(origin, destination, month)}

@app.get("/search")
async def search_ep(origin: str, destination: str, date: str):
    return {"results": await _providers_search(origin, destination, date)}
