import logging
import requests
from datetime import date, datetime
from dataclasses import dataclass, field
from typing import List, Optional

from bs4 import BeautifulSoup

from src.config import CYCLING_LEAGUES

logger = logging.getLogger("tele7sport")

# ── ProCyclingStats scraper for road races ──────────────────
PCS_CALENDAR_URL = "https://www.procyclingstats.com/races.php"

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


# ── Major cycling calendar (static fallback) ────────────────
# Updated yearly — covers World Tour, Grand Tours, Monuments, UCI MTB World Cup
MAJOR_EVENTS_2025_2026 = [
    # Road — Grand Tours & Monuments
    {"name": "Milan-San Remo", "location": "Italie", "start": "2026-03-21", "end": "2026-03-21", "category": "road"},
    {"name": "Tour des Flandres", "location": "Belgique", "start": "2026-04-05", "end": "2026-04-05", "category": "road"},
    {"name": "Paris-Roubaix", "location": "France", "start": "2026-04-12", "end": "2026-04-12", "category": "road"},
    {"name": "Liège-Bastogne-Liège", "location": "Belgique", "start": "2026-04-26", "end": "2026-04-26", "category": "road"},
    {"name": "Giro d'Italia", "location": "Italie", "start": "2026-05-09", "end": "2026-05-31", "category": "road"},
    {"name": "Tour de France", "location": "France", "start": "2026-07-04", "end": "2026-07-26", "category": "road"},
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


def _scrape_pcs_races(week_start: date, week_end: date) -> List[dict]:
    """Scrape ProCyclingStats for road races happening this week."""
    try:
        params = {
            "year": week_start.year,
            "circuit": 1,  # UCI WorldTour
            "class": "1.UWT,2.UWT,1.Pro,2.Pro",
        }
        resp = requests.get(PCS_CALENDAR_URL, params=params, timeout=15)
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        races = []
        for row in soup.select("table.basic tbody tr"):
            cols = row.find_all("td")
            if len(cols) < 4:
                continue
            date_text = cols[0].get_text(strip=True)
            race_name = cols[2].get_text(strip=True)
            try:
                parts = date_text.split(".")
                if len(parts) >= 2:
                    d = int(parts[0])
                    m = int(parts[1])
                    race_date = date(week_start.year, m, d)
                    if week_start <= race_date <= week_end:
                        races.append({"name": race_name, "date": race_date})
            except (ValueError, IndexError):
                continue
        return races
    except Exception as e:
        logger.warning("PCS scrape failed: %s", e)
        return []


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

    # 1. Check static calendar
    for ev in MAJOR_EVENTS_2025_2026:
        if ev["category"] != target_category:
            continue
        ev_start = date.fromisoformat(ev["start"])
        ev_end = date.fromisoformat(ev["end"])
        # Event overlaps with our week?
        if ev_end >= week_start and ev_start <= week_end:
            events.append(CyclingEvent(
                league_id=league_id,
                league_label=cfg["label"],
                emoji=cfg["emoji"],
                name=ev["name"],
                location=ev.get("location", ""),
                start_date=ev_start,
                end_date=ev_end,
                category=target_category,
                channels_fr=cfg["channels_fr"],
            ))

    # 2. For road cycling, try PCS scraping to catch races not in static calendar
    if target_category == "road":
        pcs_races = _scrape_pcs_races(week_start, week_end)
        existing_names = {e.name.lower() for e in events}
        for race in pcs_races:
            if race["name"].lower() not in existing_names:
                events.append(CyclingEvent(
                    league_id=league_id,
                    league_label=cfg["label"],
                    emoji=cfg["emoji"],
                    name=race["name"],
                    location="",
                    start_date=race["date"],
                    end_date=race["date"],
                    category="road",
                    channels_fr=cfg["channels_fr"],
                ))

    return events
