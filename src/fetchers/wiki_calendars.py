"""
Calendriers de sports mécaniques lus sur Wikipédia (ESPN ne les couvre pas) :
- MXGP (championnat du monde de motocross) : « <année> FIM Motocross World Championship » ;
- Supercross US : « <année> AMA Supercross Championship » ;
- Dakar : « Rallye Dakar <année> » (fr), une ligne par étape.
Les pages de la saison suivante apparaissent sur Wikipédia quelques semaines ou mois avant :
elles sont prises automatiquement dès qu'elles existent.
"""
import logging
import re
from datetime import date
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("tele7sport")

HEADERS = {"User-Agent": "tele7sport (github.com/justinmartin/tele7sport)"}
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                      "september", "october", "november", "december"], 1)}
MONTHS.update({m: i for i, m in enumerate(["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                                           "septembre", "octobre", "novembre", "décembre"], 1)})
_cache: Dict[str, Optional[BeautifulSoup]] = {}


def _page(lang: str, title: str) -> Optional[BeautifulSoup]:
    key = f"{lang}/{title}"
    if key not in _cache:
        try:
            resp = requests.get(f"https://{lang}.wikipedia.org/w/api.php", headers=HEADERS, timeout=15, params={
                "action": "parse", "page": title, "prop": "text", "format": "json", "formatversion": 2})
            d = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            _cache[key] = BeautifulSoup(d["parse"]["text"], "html.parser") if "parse" in d else None
        except Exception as e:  # page absente (saison pas encore créée) ou Wikipédia indisponible
            logger.debug("Wikipédia %s indisponible : %s", key, e)
            _cache[key] = None
    return _cache[key]


def _date(text: str, year: int) -> Optional[date]:
    """« 28 February », « January 10 », « 3 Janvier 2026 »."""
    words = re.findall(r"[A-Za-zÀ-ÿ]+|\d+", text)
    month = next((MONTHS[w.lower()] for w in words if w.lower() in MONTHS), None)
    nums = [int(w) for w in words if w.isdigit()]
    day = next((n for n in nums if n <= 31), None)
    y = next((n for n in nums if n > 1900), year)
    try:
        return date(y, month, day) if month and day else None
    except ValueError:
        return None


def _clean(text: str) -> str:
    return re.sub(r"\s*\((?:I|II|III|IV|V|\d+)\)|\s*\[.*?\]", "", text).strip()


def mxgp(year: int) -> List[dict]:
    soup = _page("en", f"{year}_FIM_Motocross_World_Championship")
    table = next((t for t in (soup.find_all("table", class_="wikitable") if soup else [])
                  if "Grand Prix" in t.find("tr").get_text()), None)
    out = []
    for row in (table.find_all("tr")[1:] if table else []):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
        if len(cells) < 4 or not cells[0].isdigit():
            continue
        d = _date(cells[1], year)
        if d:
            img = row.find("img")
            country = img.get("alt", "") if img else ""
            out.append({"name": cells[2], "start": d, "end": d, "location": ", ".join(x for x in (cells[3], country) if x),
                        "details": f"Manche {cells[0]}"})
    return out


def supercross(year: int) -> List[dict]:
    soup = _page("en", f"{year}_AMA_Supercross_Championship")
    table = next((t for t in (soup.find_all("table", class_="wikitable") if soup else [])
                  if "Stadium" in t.find("tr").get_text()), None)
    out = []
    for row in (table.find_all("tr")[1:] if table else []):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
        if len(cells) < 4:
            continue
        d = _date(cells[1], year)
        if d:
            winner = _clean(cells[5]) if len(cells) > 5 and cells[5] else ""
            details = f"Manche {cells[0]}" + (f" · vainqueur 450 : {winner}" if winner and d < date.today() else "")
            out.append({"name": f"Supercross de {cells[2]}", "start": d, "end": d,
                        "location": f"{cells[3]}, {cells[2]}", "details": details})
    return out


def dakar(year: int) -> List[dict]:
    """Une ligne par étape : « Étape 3 · Hail → Riyad »."""
    soup = _page("fr", f"Rallye_Dakar_{year}")
    table = next((t for t in (soup.find_all("table", class_="wikitable") if soup else [])
                  if "Départ" in t.find("tr").get_text()), None)
    out = []
    for row in (table.find_all("tr")[1:] if table else []):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
        i = next((k for k, c in enumerate(cells) if re.search(r"\d{1,2}\s+\w+\s+\d{4}", c)), None)
        if i is None or len(cells) < i + 3:
            continue
        d = _date(cells[i], year)
        if d:
            stage = cells[0] if cells[0].lower().startswith(("prologue", "repos")) else f"Étape {cells[0]}"
            start_city, end_city = cells[i + 1], cells[i + 2]
            out.append({"name": f"Dakar {year} · {stage}", "start": d, "end": d,
                        "location": start_city if start_city == end_city else f"{start_city} → {end_city}", "details": ""})
    return out


SOURCES = {"mxgp": mxgp, "supercross": supercross, "dakar": dakar}


def get_calendar(kind: str, start: date, end: date) -> List[dict]:
    """Événements d'un calendrier entre deux dates (pages des années concernées + la suivante)."""
    events = []
    for year in sorted({start.year, end.year, end.year + 1}):
        events += [e for e in SOURCES[kind](year) if e["end"] >= start and e["start"] <= end]
    logger.info("🏍️  %s : %d événement(s) %s → %s", kind, len(events), start, end)
    return events
