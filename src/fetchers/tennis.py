"""
Tennis : Grands Chelems, Masters 1000 et ATP Finals (API publique d'ESPN, flux « atp »).
Le flux donne un tournoi avec tout son tableau ; les matchs à venir restent « TBD » tant que les
joueurs ne sont pas connus, et leur heure n'est fixée que la veille (« timeValid »).
Par tournoi :
- le tournoi lui-même, sur toute sa durée (vainqueurs une fois fini) ;
- les demi-finales et finales du simple (messieurs, et dames en Grand Chelem), avec les joueurs et
  l'heure dès qu'ils sont connus, puis le score ; la finale apparaît dès le départ, au dernier jour.
"""
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import List
from zoneinfo import ZoneInfo

import requests

from src.config import TIMEZONE

logger = logging.getLogger("tele7sport")

SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard"
PARIS = ZoneInfo(TIMEZONE)
ET = ZoneInfo("America/New_York")  # ESPN borne les tournois à minuit, heure de New York

ROUNDS = {"Semifinal": "Demi-finale", "Final": "Finale"}
DRAWS = {"Men's Singles": "messieurs", "Women's Singles": "dames"}
NAMES_FR = {"Roland Garros": "Roland-Garros", "Australian Open": "Open d'Australie", "US Open": "US Open",
            "Wimbledon": "Wimbledon"}


def _utc(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%MZ").replace(tzinfo=ZoneInfo("UTC"))


@lru_cache(maxsize=128)
def _day(d: date) -> tuple:
    try:
        r = requests.get(SCOREBOARD, params={"dates": d.strftime("%Y%m%d")}, timeout=20)
        r.raise_for_status()
        return tuple(r.json().get("events", []))
    except Exception as e:
        logger.debug("Tennis ESPN %s : %s", d, e)
        return ()


def _tournaments(start: date, end: date) -> List[dict]:
    """Tournois en cours sur la période. Un tournoi dure 8 jours ou plus : un jour sur trois suffit,
    un sur six pour chercher le prochain tournoi sur l'année."""
    step = 3 if (end - start).days <= 60 else 6
    days = [start + timedelta(days=i) for i in range(0, (end - start).days + 1, step)] + [end]
    seen = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for evs in pool.map(_day, days):
            for ev in evs:
                seen.setdefault(ev["id"], ev)
    return list(seen.values())


def _name(ev: dict) -> str:
    raw = re.sub(r"\s+\d+-\d{4}$", "", ev.get("name", "")).strip()
    return NAMES_FR.get(raw, raw)


def _players(c: dict) -> List[str]:
    return [(x.get("athlete") or {}).get("displayName", "TBD") for x in c.get("competitors") or []]


def _result(c: dict) -> str:
    """« (1) Daniil Medvedev (RUS) bt Nikoloz Basilashvili (GEO) 6-7 (6-8) 6-1 6-3 » → en français, sans têtes de série."""
    note = next((n.get("text", "") for n in c.get("notes") or [] if n.get("text")), "")
    note = re.sub(r"\(\d+\)\s*|\s*\([A-Z]{3}\)", "", note).replace(" bt ", " bat ")
    return note.strip()


def get_tennis_events(pattern: str, women: bool, start: date, end: date) -> List[dict]:
    out = []
    for ev in _tournaments(start - timedelta(days=14), end):
        if not re.search(pattern, ev.get("name", ""), re.I):
            continue
        name = _name(ev)
        t_start, t_end = _utc(ev["date"]).astimezone(ET).date(), _utc(ev["endDate"]).astimezone(ET).date()
        venue = ""
        winners = []
        for g in ev.get("groupings") or []:
            draw = DRAWS.get((g.get("grouping") or {}).get("displayName"))
            if not draw or (draw == "dames" and not women):
                continue
            for c in g.get("competitions") or []:
                rnd = ROUNDS.get((c.get("round") or {}).get("displayName"))
                if not rnd:
                    continue
                venue = venue or (c.get("venue") or {}).get("fullName", "")
                players = _players(c)
                done = ((c.get("status") or {}).get("type") or {}).get("completed")
                known = "TBD" not in players and len(players) == 2
                if done and rnd == "Finale":
                    w = next((x["athlete"]["displayName"] for x in c["competitors"] if x.get("winner")), "")
                    if w:
                        winners.append(f"{w} ({draw})")
                if not known and rnd != "Finale":
                    continue
                when = _utc(c["date"]).astimezone(PARIS)
                timed = c.get("timeValid") or done
                day = when.date() if timed and known else t_end
                details = _result(c) if done else (" – ".join(players) if known else "Joueurs à venir")
                out.append({"name": f"{rnd} {draw} · {name}", "start": day, "end": day,
                            "time": when.strftime("%H:%M") if timed and known else "",
                            "location": venue, "details": details, "phase": rnd})
        kind = "Grand Chelem" if women else "Masters 1000" if "finals" not in ev.get("name", "").lower() else "ATP Finals"
        if not women:  # un seul tableau : pas besoin de préciser « messieurs »
            winners = [w.replace(" (messieurs)", "") for w in winners]
        details = f"Vainqueur{'s' if len(winners) > 1 else ''} : {', '.join(winners)}" if winners else kind
        out.append({"name": name, "start": t_start, "end": t_end, "time": "", "location": venue,
                    "details": details, "phase": ""})
    out = [e for e in out if e["end"] >= start and e["start"] <= end]
    logger.info("🎾 Tennis %s : %d entrée(s) %s → %s", pattern[:30], len(out), start, end)
    return sorted(out, key=lambda e: (e["start"], e["time"]))
