"""
MotoGP : calendrier, horaires et résultats lus sur l'API publique du site officiel (motogp.com).
Deux rendez-vous par Grand Prix, à l'heure de Paris : le Sprint (samedi) et la course (dimanche).
- calendrier et horaires : api.pulselive.motogp.com/motogp/v1/events (fuseau du circuit inclus) ;
- vainqueurs et classement du championnat : api.motogp.pulselive.com/motogp/v1/results/…
"""
import logging
from datetime import date, datetime
from functools import lru_cache
from typing import List, Optional
from zoneinfo import ZoneInfo

import requests

from src.config import TIMEZONE

logger = logging.getLogger("tele7sport")

EVENTS_API = "https://api.pulselive.motogp.com/motogp/v1"
RESULTS_API = "https://api.motogp.pulselive.com/motogp/v1"
HEADERS = {"User-Agent": "tele7sport (github.com/justinmartin/tele7sport)"}
PARIS = ZoneInfo(TIMEZONE)

# « Grand Prix de Malaisie » : le pays du circuit, avec le bon article
GP_FR = {
    "Thailand": "de Thaïlande", "Brazil": "du Brésil", "United States": "des Amériques", "Argentina": "d'Argentine",
    "Qatar": "du Qatar", "Spain": "d'Espagne", "France": "de France", "Italy": "d'Italie", "Hungary": "de Hongrie",
    "Czech Republic": "de République tchèque", "Czechia": "de République tchèque", "Netherlands": "des Pays-Bas",
    "Germany": "d'Allemagne", "Great Britain": "de Grande-Bretagne", "United Kingdom": "de Grande-Bretagne",
    "Austria": "d'Autriche", "San Marino": "de Saint-Marin", "Japan": "du Japon", "Indonesia": "d'Indonésie",
    "Australia": "d'Australie", "Malaysia": "de Malaisie", "Portugal": "du Portugal", "India": "d'Inde",
    "Kazakhstan": "du Kazakhstan", "Turkey": "de Turquie",
}
# Les Grands Prix espagnols portent le nom de leur région
GP_BY_NAME = {"ARAGON": "d'Aragon", "CATALUNYA": "de Catalogne", "VALENCIA": "de Valence", "SAN MARINO": "de Saint-Marin"}


def _get(url: str, params: Optional[dict] = None):
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=20)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("MotoGP indisponible (%s) : %s", url.rsplit("/", 1)[-1], e)
        return None


@lru_cache(maxsize=4)
def _events(year: int) -> list:
    return [e for e in (_get(f"{EVENTS_API}/events", {"seasonYear": year}) or []) if e.get("kind") == "GP"]


@lru_cache(maxsize=4)
def _season(year: int) -> Optional[str]:
    return next((s["id"] for s in (_get(f"{RESULTS_API}/results/seasons") or []) if s.get("year") == year), None)


@lru_cache(maxsize=4)
def _result_events(year: int) -> dict:
    """{ code court (« AUS ») : id de l'épreuve côté résultats } — ids différents de ceux du calendrier."""
    season = _season(year)
    evs = _get(f"{RESULTS_API}/results/events", {"seasonUuid": season, "isFinished": "true"}) if season else None
    return {e["short_name"]: e["id"] for e in (evs or []) if not e.get("test")}


@lru_cache(maxsize=64)
def _winners(result_event_id: str) -> dict:
    """{ « SPR » / « RAC » : vainqueur ou « annulée » } pour la catégorie MotoGP."""
    cats = _get(f"{RESULTS_API}/results/categories", {"eventUuid": result_event_id}) or []
    cat = next((c["id"] for c in cats if c.get("legacy_id") == 3), None)
    out = {}
    for s in (_get(f"{RESULTS_API}/results/sessions", {"eventUuid": result_event_id, "categoryUuid": cat}) or []) if cat else []:
        if s.get("type") not in ("SPR", "RAC"):
            continue
        if s.get("status") == "CANCELLED":
            out[s["type"]] = "course annulée"
            continue
        cl = (_get(f"{RESULTS_API}/results/session/{s['id']}/classification", {"test": "false"}) or {}).get("classification") or []
        if cl:
            out[s["type"]] = f"vainqueur : {cl[0]['rider']['full_name']}"
    return out


@lru_cache(maxsize=4)
def _leader(year: int) -> str:
    season = _season(year)
    if not season:
        return ""
    cats = _get(f"{RESULTS_API}/results/categories", {"seasonUuid": season}) or []
    cat = next((c["id"] for c in cats if c.get("legacy_id") == 3), None)
    st = _get(f"{RESULTS_API}/results/standings", {"seasonUuid": season, "categoryUuid": cat}) if cat else None
    top = (st or {}).get("classification") or []
    return f"leader : {top[0]['rider']['full_name']} ({top[0]['points']} pts)" if top else ""


def _gp_name(ev: dict) -> str:
    raw = ev.get("name", "").upper()
    region = next((v for k, v in GP_BY_NAME.items() if f"OF {k}" in raw or f"OF THE {k}" in raw), None)
    country = (ev.get("circuit") or {}).get("country", "")
    return f"Grand Prix {region or GP_FR.get(country, country)}".strip()


def get_motogp_sessions(week_start: date, week_end: date) -> List[dict]:
    """Sprints et courses MotoGP entre deux dates (heure de Paris)."""
    out = []
    for year in sorted({week_start.year, week_end.year}):
        for ev in _events(year):
            circuit = ev.get("circuit") or {}
            location = circuit.get("name") or ""
            for b in ev.get("broadcasts") or []:
                if (b.get("category") or {}).get("acronym") != "MGP" or b.get("shortname") not in ("SPR", "RAC"):
                    continue
                start = datetime.strptime(b["date_start"], "%Y-%m-%dT%H:%M:%S%z").astimezone(PARIS)
                if not week_start <= start.date() <= week_end:
                    continue
                kind = "Sprint" if b["shortname"] == "SPR" else "Course"
                if start.date() < date.today() or b.get("status") in ("FINISHED", "CANCELLED"):
                    rid = _result_events(year).get(ev.get("shortname", ""))
                    details = (_winners(rid).get(b["shortname"]) if rid else "") or ("course annulée" if b.get("status") == "CANCELLED" else "")
                else:
                    details = _leader(year)
                out.append({
                    "name": f"{_gp_name(ev)} · {kind}", "date": start.date(), "time": start.strftime("%H:%M"),
                    "location": location, "details": details[:1].upper() + details[1:] if details else "",
                })
    logger.info("🏍️  MotoGP : %d course(s) %s → %s", len(out), week_start, week_end)
    return sorted(out, key=lambda x: (x["date"], x["time"]))


def motogp_standings() -> Optional[dict]:
    """Classement des pilotes MotoGP : {season, rows: [{rank, name, flag, team, pts}]}."""
    year = date.today().year
    season = _season(year)
    if not season:
        return None
    cats = _get(f"{RESULTS_API}/results/categories", {"seasonUuid": season}) or []
    cat = next((c["id"] for c in cats if c.get("legacy_id") == 3), None)
    st = _get(f"{RESULTS_API}/results/standings", {"seasonUuid": season, "categoryUuid": cat}) if cat else None
    rows = []
    for r in (st or {}).get("classification") or []:
        iso = ((r.get("rider") or {}).get("country") or {}).get("iso", "")
        rows.append({"rank": r.get("position"), "name": r["rider"]["full_name"],
                     "flag": f"https://flagcdn.com/w40/{iso.lower()}.png" if iso else "",
                     "team": (r.get("team") or {}).get("name", ""), "pts": r.get("points")})
    return {"season": str(year), "title": "Pilotes", "rows": rows} if rows else None
