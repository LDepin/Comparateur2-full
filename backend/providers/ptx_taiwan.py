import os, httpx, hmac, hashlib, base64, time
from ..models import Option, Leg

PTX_ID = os.getenv("PTX_ID")
PTX_KEY = os.getenv("PTX_KEY")

def _auth_headers():
    if not (PTX_ID and PTX_KEY):
        return {}
    xdate = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
    signature = base64.b64encode(hmac.new(PTX_KEY.encode(), ("x-date: " + xdate).encode(), hashlib.sha1).digest()).decode()
    return {
        "x-date": xdate,
        "Authorization": f'hmac username="{PTX_ID}", algorithm="hmac-sha1", headers="x-date", signature="{signature}"',
    }

async def search_ptx(origin:str, destination:str, date:str):
    if not (PTX_ID and PTX_KEY):
        return [Option(
            mode="train", price=28.0, total_duration_min=120, transfers=0,
            legs=[Leg(mode="train", origin=origin, destination=destination,
                      depart_iso=f"{date}T09:00:00+08:00", arrive_iso=f"{date}T11:00:00+08:00",
                      company="THSR", number="8xx", duration_min=120)],
            meta={"provider":"ptx","fallback":True}
        )]
    # Ex: THSR timetable minimal (démo). À affiner par agency/route.
    url = "https://ptx.transportdata.tw/MOTC/v2/Rail/THSR/DailyTimetable/TrainDate/"+date+"?$top=5&$format=JSON"
    async with httpx.AsyncClient(timeout=20.0, headers=_auth_headers()) as c:
        r = await c.get(url)
        r.raise_for_status()
        data = r.json()
    opts=[]
    for item in data[:3]:
        legs=[Leg(mode="train", origin=origin, destination=destination,
                  depart_iso=f"{date}T09:00:00+08:00", arrive_iso=f"{date}T11:00:00+08:00",
                  company="THSR", number=item.get("DailyTrainInfo",{}).get("TrainNo",""),
                  duration_min=120)]
        opts.append(Option(mode="train", price=30.0, total_duration_min=120, transfers=0, legs=legs, meta={"provider":"ptx"}))
    return opts