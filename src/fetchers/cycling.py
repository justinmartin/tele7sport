import logging
import re
import requests
from datetime import date, datetime
from dataclasses import dataclass, field
from typing import List, Optional

from bs4 import BeautifulSoup

from src.config import CYCLING_LEAGUES
from src.fetchers.motogp import get_motogp_sessions
from src.fetchers.wiki_calendars import SOURCES as WIKI_SOURCES, _page as wiki_page, get_calendar

logger = logging.getLogger("tele7sport")


# ── UCI Calendar for MTB events ─────────────────────────────
UCI_MTB_URL = "https://www.uci.org/api/calendar"


@dataclass
class CyclingEvent:
    league_id: str
    league_label: str
    emoji: str
    name: str
    location: str
    start_date: date
    end_date: date
    category: str  # "road", "mtb-dh", "mtb-enduro"
    channels_fr: List[str] = field(default_factory=list)
    url: str = ""
    details: str = ""
    start_time: str = "09:00"


# ── Major cycling calendar (static fallback) ────────────────
# Updated yearly — covers World Tour, Grand Tours, Monuments, UCI MTB World Cup
MAJOR_EVENTS_2025_2026 = [
    # Road — Grand Tours & Monuments
    {"name": "Milan-San Remo", "location": "Italie", "start": "2026-03-21", "end": "2026-03-21", "category": "road"},
    {"name": "Tour des Flandres", "location": "Belgique", "start": "2026-04-05", "end": "2026-04-05", "category": "road"},
    {"name": "Paris-Roubaix", "location": "France", "start": "2026-04-12", "end": "2026-04-12", "category": "road"},
    {"name": "Liège-Bastogne-Liège", "location": "Belgique", "start": "2026-04-26", "end": "2026-04-26", "category": "road"},
    {"name": "Giro d'Italia", "location": "Italie", "start": "2026-05-09", "end": "2026-05-31", "category": "road"},
    {
        "name": "Tour de France",
        "location": "France",
        "start": "2026-07-04",
        "end": "2026-07-26",
        "category": "road",
        "details": (
            "Grand Départ à Barcelone. 21 étapes: 7 plates, 4 accidentées, 8 de montagne, "
            "1 contre-la-montre par équipes, 1 contre-la-montre individuel et 2 jours de repos. "
            "Arrivées au sommet à Gavarnie-Gèdre, Plateau de Solaison, Orcières-Merlette et Alpe d’Huez (2 fois)."
        ),
    },
    {"name": "Vuelta a España", "location": "Espagne", "start": "2026-08-22", "end": "2026-09-13", "category": "road"},
    {"name": "Championnats du Monde Route UCI", "location": "TBD", "start": "2026-09-20", "end": "2026-09-27", "category": "road"},
    {"name": "Il Lombardia", "location": "Italie", "start": "2026-10-10", "end": "2026-10-10", "category": "road"},
    # Road — other notable
    {"name": "Paris-Nice", "location": "France", "start": "2026-03-08", "end": "2026-03-15", "category": "road"},
    {"name": "Tirreno-Adriatico", "location": "Italie", "start": "2026-03-11", "end": "2026-03-17", "category": "road"},
    {"name": "Critérium du Dauphiné", "location": "France", "start": "2026-06-07", "end": "2026-06-14", "category": "road"},
    {"name": "Tour de Suisse", "location": "Suisse", "start": "2026-06-14", "end": "2026-06-22", "category": "road"},
    {"name": "La Flèche Wallonne", "location": "Belgique", "start": "2026-04-22", "end": "2026-04-22", "category": "road"},
    {"name": "Amstel Gold Race", "location": "Pays-Bas", "start": "2026-04-19", "end": "2026-04-19", "category": "road"},
    {"name": "Strade Bianche", "location": "Italie", "start": "2026-03-07", "end": "2026-03-07", "category": "road"},
    # MTB DH — UCI World Cup rounds (dates approximate, updated when UCI publishes)
    {"name": "Coupe du Monde VTT DH — Manche 1", "location": "Fort William, Écosse", "start": "2026-05-16", "end": "2026-05-17", "category": "mtb-dh"},
    {"name": "Coupe du Monde VTT DH — Manche 2", "location": "Leogang, Autriche", "start": "2026-06-06", "end": "2026-06-07", "category": "mtb-dh"},
    {"name": "Coupe du Monde VTT DH — Manche 3", "location": "Val di Sole, Italie", "start": "2026-06-27", "end": "2026-06-28", "category": "mtb-dh"},
    {"name": "Coupe du Monde VTT DH — Manche 4", "location": "Les Gets, France", "start": "2026-07-11", "end": "2026-07-12", "category": "mtb-dh"},
    {"name": "Coupe du Monde VTT DH — Manche 5", "location": "Mont-Sainte-Anne, Canada", "start": "2026-08-01", "end": "2026-08-02", "category": "mtb-dh"},
    {"name": "Coupe du Monde VTT DH — Finale", "location": "TBD", "start": "2026-09-05", "end": "2026-09-06", "category": "mtb-dh"},
    {"name": "Championnats du Monde VTT DH", "location": "TBD", "start": "2026-08-22", "end": "2026-08-23", "category": "mtb-dh"},
    # MTB Enduro — EWS / UCI Enduro World Cup
    {"name": "Enduro World Cup — Manche 1", "location": "Madère, Portugal", "start": "2026-03-28", "end": "2026-03-29", "category": "mtb-enduro"},
    {"name": "Enduro World Cup — Manche 2", "location": "Derby, Tasmanie", "start": "2026-04-18", "end": "2026-04-19", "category": "mtb-enduro"},
    {"name": "Enduro World Cup — Manche 3", "location": "Petzen, Autriche", "start": "2026-06-13", "end": "2026-06-14", "category": "mtb-enduro"},
    {"name": "Enduro World Cup — Manche 4", "location": "Les 2 Alpes, France", "start": "2026-07-04", "end": "2026-07-05", "category": "mtb-enduro"},
    {"name": "Enduro World Cup — Manche 5", "location": "Whistler, Canada", "start": "2026-08-08", "end": "2026-08-09", "category": "mtb-enduro"},
    {"name": "Enduro World Cup — Finale", "location": "Loudenvielle, France", "start": "2026-09-19", "end": "2026-09-20", "category": "mtb-enduro"},
    {"name": "Championnats du Monde Enduro", "location": "TBD", "start": "2026-10-03", "end": "2026-10-04", "category": "mtb-enduro"},
]


# Calendrier route : pages « <année> UCI World Tour » de Wikipédia (API ouverte aux scripts).
# ProCyclingStats bloque les clients automatisés : on ne le contourne pas.
MONTHS_EN = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July",
                                         "August", "September", "October", "November", "December"], 1)}
COUNTRIES_FR = {
    "France": "France", "Italy": "Italie", "Spain": "Espagne", "Belgium": "Belgique", "Netherlands": "Pays-Bas",
    "Switzerland": "Suisse", "Germany": "Allemagne", "Australia": "Australie", "United Arab Emirates": "Émirats arabes unis",
    "Canada": "Canada", "United Kingdom": "Royaume-Uni", "Poland": "Pologne", "China": "Chine", "Saudi Arabia": "Arabie saoudite",
    "Portugal": "Portugal", "Denmark": "Danemark", "Norway": "Norvège", "Slovenia": "Slovénie", "United States": "États-Unis",
    "Japan": "Japon", "Rwanda": "Rwanda", "Austria": "Autriche", "Monaco": "Monaco",
}
_wt_cache: dict = {}


def _parse_wiki_dates(text: str, year: int):
    """« 20–25 January », « 1 February », « 28 April – 3 May » → (début, fin)."""
    parts = [p.strip() for p in re.split(r"[–-]", text) if p.strip()]
    end_day, end_month = parts[-1].split()[0], parts[-1].split()[-1]
    end = date(year, MONTHS_EN[end_month], int(end_day))
    first = parts[0].split()
    start = date(year, MONTHS_EN[first[1]] if len(first) > 1 else end.month, int(first[0]))
    return start, end


def _worldtour(year: int) -> List[dict]:
    if year in _wt_cache:
        return _wt_cache[year]
    races = []
    try:
        soup = wiki_page("en", f"{year}_UCI_World_Tour")
        table = soup.find("table", class_="wikitable") if soup else None
        for row in (table.find_all("tr")[1:] if table else []):
            cells = row.find_all(["th", "td"])
            if len(cells) < 3:
                continue
            try:
                start, end = _parse_wiki_dates(cells[1].get_text(" ", strip=True), year)
            except (ValueError, KeyError, IndexError):
                continue
            flag = cells[0].find("img")
            winner = re.sub(r"\s*\(.*?\)\s*", "", cells[2].get_text(" ", strip=True)).strip()
            races.append({
                "name": re.sub(r"^[\s/]+", "", cells[0].get_text(" ", strip=True)), "start": start, "end": end,
                "location": COUNTRIES_FR.get(flag.get("alt", ""), flag.get("alt", "")) if flag else "",
                "winner": winner, "stage_race": end > start,
            })
        logger.info("🚴 WorldTour %d (Wikipédia) : %d courses", year, len(races))
    except Exception as e:
        logger.warning("Calendrier WorldTour %d indisponible : %s", year, e)
    _wt_cache[year] = races
    return races


def get_cycling_events(
    league_id: str,
    week_start: date,
    week_end: date,
) -> List[CyclingEvent]:
    """Get cycling events for the given week."""
    cfg = CYCLING_LEAGUES.get(league_id)
    if not cfg:
        return []

    target_category = cfg["uci_category"]
    events: List[CyclingEvent] = []

    # MotoGP : Sprint et course, avec l'heure
    if target_category == "motogp":
        return [CyclingEvent(
            league_id=league_id, league_label=cfg["label"], emoji=cfg["emoji"], name=s["name"],
            location=s["location"], start_date=s["date"], end_date=s["date"], category="motogp",
            channels_fr=cfg["channels_fr"], details=s["details"], start_time=s["time"],
        ) for s in get_motogp_sessions(week_start, week_end)]

    # Sports mécaniques (MXGP, Supercross, Dakar) : calendriers Wikipédia
    if target_category in WIKI_SOURCES:
        return [CyclingEvent(
            league_id=league_id, league_label=cfg["label"], emoji=cfg["emoji"], name=e["name"],
            location=e["location"], start_date=e["start"], end_date=e["end"], category=target_category,
            channels_fr=cfg["channels_fr"], details=e["details"], start_time="",
        ) for e in get_calendar(target_category, week_start, week_end)]

    # Route : calendrier WorldTour réel (Wikipédia)
    if target_category == "road":
        for year in sorted({week_start.year, week_end.year}):
            for race in _worldtour(year):
                if race["end"] >= week_start and race["start"] <= week_end:
                    kind = "Course par étapes" if race["stage_race"] else "Classique"
                    details = f"{kind} · vainqueur : {race['winner']}" if race["winner"] and race["end"] < date.today() else kind
                    events.append(CyclingEvent(
                        league_id=league_id, league_label=cfg["label"], emoji=cfg["emoji"], name=race["name"],
                        location=race["location"], start_date=race["start"], end_date=race["end"], category="road",
                        channels_fr=cfg["channels_fr"], details=details, start_time="",
                    ))
        return events

    # VTT : calendrier saisi à la main (pas de source officielle exploitable)
    for ev in MAJOR_EVENTS_2025_2026:
        if ev["category"] != target_category:
            continue
        ev_start = date.fromisoformat(ev["start"])
        ev_end = date.fromisoformat(ev["end"])
        if ev_end >= week_start and ev_start <= week_end:
            events.append(CyclingEvent(
                league_id=league_id, league_label=cfg["label"], emoji=cfg["emoji"], name=ev["name"],
                location="" if ev.get("location") == "TBD" else ev.get("location", ""),
                start_date=ev_start, end_date=ev_end, category=target_category,
                channels_fr=cfg["channels_fr"], details=ev.get("details", ""), start_time="",
            ))
    return events
