"""
Formule 1 : calendrier, horaires, vainqueurs et classement des pilotes (API publique d'ESPN).
Par Grand Prix, à l'heure de Paris : les qualifications, le Sprint (certains week-ends) et la course.
"""
import logging
import re
from datetime import date, datetime
from functools import lru_cache
from typing import List, Optional
from zoneinfo import ZoneInfo

import requests

from src.config import TIMEZONE

logger = logging.getLogger("tele7sport")

SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard"
STANDINGS = "https://site.api.espn.com/apis/v2/sports/racing/f1/standings"
PARIS = ZoneInfo(TIMEZONE)

SESSIONS = {"Qual": "Qualifications", "SR": "Sprint", "Race": "Course"}
# « Australian Grand Prix » → « Grand Prix d'Australie »
GP_FR = {
    "Australian": "d'Australie", "Chinese": "de Chine", "Japanese": "du Japon", "Bahrain": "de Bahreïn",
    "Saudi Arabian": "d'Arabie saoudite", "Miami": "de Miami", "Canadian": "du Canada", "Monaco": "de Monaco",
    "Spanish": "d'Espagne", "Barcelona-Catalunya": "de Barcelone", "Austrian": "d'Autriche", "British": "de Grande-Bretagne",
    "Belgian": "de Belgique", "Hungarian": "de Hongrie", "Dutch": "des Pays-Bas", "Italian": "d'Italie",
    "Azerbaijan": "d'Azerbaïdjan", "Singapore": "de Singapour", "United States": "des États-Unis",
    "Mexico City": "de Mexico", "São Paulo": "de São Paulo", "Las Vegas": "de Las Vegas", "Qatar": "du Qatar",
    "Abu Dhabi": "d'Abou Dabi", "Emilia Romagna": "d'Émilie-Romagne", "Madrid": "de Madrid",
}


def _get(url: str, params: Optional[dict] = None):
    try:
        r = requests.get(url, params=params, timeout=20)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("F1 indisponible : %s", e)
        return None


@lru_cache(maxsize=4)
def _season(year: int) -> list:
    return (_get(SCOREBOARD, {"dates": year}) or {}).get("events", [])


def _gp_name(name: str) -> str:
    """Retire le sponsor (« MSC Cruises United States Grand Prix ») et traduit."""
    for en, fr in sorted(GP_FR.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(en)} Grand Prix", name):
            return f"Grand Prix {fr}"
    return name


def get_f1_sessions(week_start: date, week_end: date) -> List[dict]:
    """Qualifications, Sprints et courses entre deux dates (heure de Paris)."""
    out = []
    for year in sorted({week_start.year, week_end.year}):
        for ev in _season(year):
            gp = _gp_name(ev.get("name", ""))
            circuit = (ev.get("circuit") or {}).get("fullName", "")
            for c in ev.get("competitions") or []:
                kind = SESSIONS.get((c.get("type") or {}).get("abbreviation"))
                if not kind:
                    continue
                start = datetime.strptime(c["date"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=ZoneInfo("UTC")).astimezone(PARIS)
                if not week_start <= start.date() <= week_end:
                    continue
                details = ""
                if start.date() >= date.today() and (lead := f1_standings()) and lead["rows"]:
                    details = f"Leader : {lead['rows'][0]['name']} ({lead['rows'][0]['pts']} pts)"
                if ((c.get("status") or {}).get("type") or {}).get("completed"):
                    first = next((x for x in c.get("competitors") or [] if x.get("order") == 1), None)
                    if first:
                        details = f"{'Pole' if kind == 'Qualifications' else 'Vainqueur'} : {first['athlete']['displayName']}"
                out.append({"name": f"{gp} · {kind}", "date": start.date(), "time": start.strftime("%H:%M"),
                            "location": circuit, "details": details})
    logger.info("🏎️  F1 : %d séance(s) %s → %s", len(out), week_start, week_end)
    return sorted(out, key=lambda x: (x["date"], x["time"]))


@lru_cache(maxsize=1)
def f1_standings() -> Optional[dict]:
    """Classement des pilotes : {season, rows: [{rank, name, flag, pts}]}."""
    data = _get(STANDINGS) or {}
    for child in data.get("children") or []:
        st = child.get("standings") or {}
        if "Driver" not in (child.get("name") or ""):
            continue
        rows = []
        for e in st.get("entries") or []:
            stats = {s["name"]: s for s in e.get("stats") or []}
            rows.append({"rank": int(stats.get("rank", {}).get("value") or 0) or None, "name": e["athlete"]["displayName"],
                         "flag": ((e["athlete"].get("flag") or {}).get("href") or ""),
                         "pts": int(stats.get("championshipPts", {}).get("value") or 0)})
        rows.sort(key=lambda r: (r["rank"] is None, r["rank"] or 0))
        if rows:
            return {"season": st.get("season") or "", "title": "Pilotes", "rows": rows}
    return None
