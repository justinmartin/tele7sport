"""
Golf (les 4 majeurs) et UFC (les galas numérotés et ceux en France), API publique d'ESPN.
"""
import logging
import re
from datetime import date, datetime
from functools import lru_cache
from typing import List
from zoneinfo import ZoneInfo

import requests

from src.config import TIMEZONE

logger = logging.getLogger("tele7sport")

BASE = "https://site.api.espn.com/apis/site/v2/sports"
PARIS = ZoneInfo(TIMEZONE)
ET = ZoneInfo("America/New_York")
MAJORS = {"Masters Tournament": "Masters d'Augusta", "PGA Championship": "PGA Championship",
          "U.S. Open": "US Open de golf", "The Open": "The Open (British Open)"}


def _utc(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%MZ").replace(tzinfo=ZoneInfo("UTC"))


@lru_cache(maxsize=8)
def _season(path: str, year: int) -> tuple:
    try:
        r = requests.get(f"{BASE}/{path}/scoreboard", params={"dates": year}, timeout=20)
        r.raise_for_status()
        return tuple(r.json().get("events", []))
    except Exception as e:
        logger.warning("ESPN %s %d indisponible : %s", path, year, e)
        return ()


def get_golf_majors(start: date, end: date) -> List[dict]:
    out = []
    for year in sorted({start.year, end.year}):
        for ev in _season("golf/pga", year):
            name = MAJORS.get(ev.get("name", ""))
            if not name:
                continue
            s, e = _utc(ev["date"]).astimezone(ET).date(), _utc(ev["endDate"]).astimezone(ET).date()
            if e < start or s > end:
                continue
            details = "Majeur"
            if ((ev.get("status") or {}).get("type") or {}).get("completed"):
                c = (ev.get("competitions") or [{}])[0]
                w = next((x for x in c.get("competitors") or [] if x.get("order") == 1), None)
                if w:
                    details = f"Vainqueur : {w['athlete']['displayName']}"
            out.append({"name": name, "start": s, "end": e, "time": "", "location": "", "details": details})
    return out


def get_ufc_events(start: date, end: date) -> List[dict]:
    """Galas numérotés (« UFC 334 ») et galas en France ; l'heure est celle de la carte principale."""
    out = []
    for year in sorted({start.year, end.year}):
        for ev in _season("mma/ufc", year):
            comps = ev.get("competitions") or []
            venue = ((ev.get("venues") or [{}])[0]) or {}
            country = (venue.get("address") or {}).get("country", "")
            numbered = re.match(r"UFC \d+", ev.get("name", ""))
            if not comps or not (numbered or country == "France"):
                continue
            # Combat principal : celui dont les deux noms figurent dans le titre (« Gane vs. Hokit »)
            last = lambda c: [x["athlete"]["displayName"].split()[-1] for x in c.get("competitors") or []]
            found = next((c for c in comps if last(c) and all(n in ev["name"] for n in last(c))), None)
            main = found or max(comps, key=lambda c: c["date"])
            when = _utc(main["date"]).astimezone(PARIS)
            if not start <= when.date() <= end:
                continue
            fighters = [x["athlete"]["displayName"] for x in main.get("competitors") or []]
            winner = next((x["athlete"]["displayName"] for x in main.get("competitors") or [] if x.get("winner")), "") if found else ""
            title = re.sub(r"\s*vs\.\s*", " – ", ev["name"]).replace(":", " :")
            city = (venue.get("address") or {}).get("city", "")
            out.append({"name": title, "start": when.date(), "end": when.date(), "time": when.strftime("%H:%M"),
                        "location": ", ".join(x for x in (venue.get("fullName"), city) if x),
                        "details": f"Vainqueur du combat principal : {winner}" if winner
                        else "Carte principale · " + " – ".join(fighters) if found else "Carte principale"})
    return out
