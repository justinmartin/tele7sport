"""
Tennis : Grands Chelems, Masters 1000 et ATP Finals (API publique d'ESPN, flux « atp »).
Le flux donne un tournoi avec tout son tableau ; les matchs à venir restent « TBD » tant que les
joueurs ne sont pas connus, et leur heure n'est fixée que la veille (« timeValid »).
Par tournoi :
- le tournoi lui-même, sur toute sa durée (vainqueurs une fois fini) ;
- les demi-finales et finales du simple (messieurs, et dames en Grand Chelem), avec les joueurs et
  l'heure dès qu'ils sont connus, puis le score ; la finale apparaît dès le départ, au dernier jour.
Tant que le tableau n'est pas publié, des créneaux « joueurs à venir » d'après le format du tournoi :
demi-finales la veille de la finale, et pour l'ATP Finals les six jours de phase de groupes avant.
"""
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

import requests

from src.config import TIMEZONE

logger = logging.getLogger("tele7sport")

SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard"
PARIS = ZoneInfo(TIMEZONE)
ET = ZoneInfo("America/New_York")  # ESPN borne les tournois à minuit, heure de New York

ROUNDS = {"Semifinal": "Demi-finale", "Final": "Finale"}
DRAWS = {"Men's Singles": "messieurs", "Women's Singles": "dames"}
NAMES_FR = {"Nitto ATP Finals": "ATP Finals", "Roland Garros": "Roland-Garros", "Australian Open": "Open d'Australie", "US Open": "US Open",
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


def _placeholders(name: str, t_end: date, women: bool, finals: bool, seen: set) -> List[dict]:
    """Créneaux sans joueurs ni horaire, avant la publication du tableau."""
    tbd = lambda day, rnd, label, details: {"name": f"{label} · {name}", "start": day, "end": day, "time": "",
                                            "location": "", "details": details, "phase": rnd}
    # Grand Chelem : finale messieurs le dimanche, dames le samedi, demi-finales jeudi (dames) et vendredi (messieurs)
    shifts = [(" messieurs", 0), (" dames", 1)] if women else [("", 0)]
    out = []
    for suffix, shift in shifts if "Finale" not in seen else []:
        out.append(tbd(t_end - timedelta(days=shift + (2 if women else 1)), "Demi-finale", f"Demi-finales{suffix}", "Joueurs et horaires à venir"))
        out.append(tbd(t_end - timedelta(days=shift), "Finale", f"Finale{suffix}", "Joueurs et horaire à venir"))
    if finals and "Phase de groupes" not in seen:  # ATP Finals : phase de groupes du dimanche au vendredi, deux simples par jour
        for i in range(7, 1, -1):
            out.append(tbd(t_end - timedelta(days=i), "", f"Phase de groupes (jour {8 - i})", "2 matchs de simple · joueurs et horaires à venir"))
    return out


def get_tennis_events(pattern: str, women: bool, start: date, end: date) -> List[dict]:
    out = []
    for ev in _tournaments(start - timedelta(days=14), end):
        if not re.search(pattern, ev.get("name", ""), re.I):
            continue
        name = _name(ev)
        t_start, t_end = _utc(ev["date"]).astimezone(ET).date(), _utc(ev["endDate"]).astimezone(ET).date()
        venue = ""
        winners = []
        finals_ev = "finals" in ev.get("name", "").lower()
        seen = set()  # tours déjà publiés par ESPN
        for g in ev.get("groupings") or []:
            draw = DRAWS.get((g.get("grouping") or {}).get("displayName"))
            if not draw or (draw == "dames" and not women):
                continue
            for c in g.get("competitions") or []:
                rnd = ROUNDS.get((c.get("round") or {}).get("displayName")) or ("Phase de groupes" if finals_ev else None)
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
                seen.add(rnd)
                out.append({"name": f"{rnd} {draw} · {name}", "start": day, "end": day,
                            "time": when.strftime("%H:%M") if timed and known else "",
                            "location": venue, "details": details, "phase": rnd})
        out.extend(_placeholders(name, t_end, women, finals_ev, seen))
        kind = "Grand Chelem" if women else "Masters 1000" if "finals" not in ev.get("name", "").lower() else "ATP Finals"
        if not women:  # un seul tableau : pas besoin de préciser « messieurs »
            winners = [w.replace(" (messieurs)", "") for w in winners]
        details = f"Vainqueur{'s' if len(winners) > 1 else ''} : {', '.join(winners)}" if winners else kind
        out.append({"name": name, "start": t_start, "end": t_end, "time": "", "location": venue,
                    "details": details, "phase": ""})
    out = [e for e in out if e["end"] >= start and e["start"] <= end]
    logger.info("🎾 Tennis %s : %d entrée(s) %s → %s", pattern[:30], len(out), start, end)
    return sorted(out, key=lambda e: (e["start"], e["time"]))


BRACKET_ROUNDS = ["8es", "Quarts", "Demies", "Finale"]


def _bracket_side(x: dict, done: bool) -> dict:
    a = x.get("athlete") or {}
    sets = " ".join(str(int(l["value"])) for l in x.get("linescores") or [] if l.get("value") is not None)
    seed = ((x.get("curatedRank") or {}).get("current"))
    return {"id": str(a.get("id") or a.get("displayName", "")), "n": a.get("displayName", "À venir"), "l": (a.get("flag") or {}).get("href", ""),
            "seed": seed if seed and seed < 99 else None, "score": sets or None, "win": bool(done and x.get("winner"))}


def get_tennis_bracket(pattern: str, women: bool, start: date, end: date) -> Optional[dict]:
    """Tableau du tournoi en cours (sinon du prochain), des 8es à la finale. Vide tant que le tirage n'est pas fait."""
    evs = [ev for ev in _tournaments(start - timedelta(days=14), end) if re.search(pattern, ev.get("name", ""), re.I)]
    evs = [ev for ev in evs if _utc(ev["endDate"]).astimezone(ET).date() >= start]
    if not evs:
        return None
    ev = min(evs, key=lambda e: e["date"])
    name = _name(ev)
    sections = []
    for g in ev.get("groupings") or []:
        draw = DRAWS.get((g.get("grouping") or {}).get("displayName"))
        if not draw or (draw == "dames" and not women):
            continue
        comps = g.get("competitions") or []
        by_round: Dict[str, list] = {}
        for c in comps:
            by_round.setdefault((c.get("round") or {}).get("displayName", ""), []).append(c)
        # 8es : le dernier tour à 8 matchs avant les quarts (« Round 3 » en Masters, « Round 4 » en Grand Chelem)
        r16 = next((r for r in sorted(by_round, reverse=True) if r.startswith("Round") and len(by_round[r]) == 8), None)
        rounds = []
        for label, key, n in zip(BRACKET_ROUNDS, [r16, "Quarterfinal", "Semifinal", "Final"], [8, 4, 2, 1]):
            ties = []
            for c in sorted(by_round.get(key) or [], key=lambda c: c.get("date", "")):
                done = ((c.get("status") or {}).get("type") or {}).get("completed")
                sides = [_bracket_side(x, done) for x in (c.get("competitors") or [])[:2]]
                if len(sides) == 2:
                    ties.append({"a": sides[0] if sides[0]["n"] != "TBD" else None, "b": sides[1] if sides[1]["n"] != "TBD" else None, "info": ""})
            rounds.append({"name": label, "ties": ties + [{"a": None, "b": None, "info": ""}] * max(n - len(ties), 0)})
        from src.brackets import _order  # rangés dans l'ordre du tableau
        rounds = _order(rounds)
        sections.append({"name": f"Simple {draw}" if women else "", "rounds": rounds})
    t_start = _utc(ev["date"]).astimezone(ET).date()
    if not sections:
        empty = lambda: [{"name": l, "ties": [{"a": None, "b": None, "info": ""}] * n} for l, n in zip(BRACKET_ROUNDS, [8, 4, 2, 1])]
        sections = [{"name": f"Simple {d}", "rounds": empty()} for d in (["messieurs", "dames"] if women else [""])]
        if not women:
            sections[0]["name"] = ""
        note = f"Le tableau est publié au tirage, juste avant le tournoi (début le {t_start.day}/{t_start.month:02d})."
        kind = "empty"
    else:
        note, kind = "", "live"
    if "finals" in ev.get("name", "").lower() and kind == "empty":
        sections = [{"name": "", "rounds": [{"name": "Demies", "ties": [{"a": None, "b": None, "info": ""}] * 2}, {"name": "Finale", "ties": [{"a": None, "b": None, "info": ""}]}]}]
        note = "Deux groupes de quatre : les deux premiers de chaque groupe vont en demi-finales. " + note
    return {"title": name, "kind": kind, "sections": sections, "note": note}
