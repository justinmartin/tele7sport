"""
Basket européen absent d'ESPN :
- EuroLeague : API officielle publique (api-live.euroleague.net), calendrier complet + classement.
- Betclic Élite : TheSportsDB (clé de test publique « 123 »), journée par journée ; le classement
  est recalculé à partir des résultats (l'API gratuite ne le fournit pas).
  L'API de la LNB exige un jeton d'autorisation : on ne s'en sert pas.
"""
import logging
import time
from datetime import date, datetime, timezone
from typing import Dict, List, Optional

import requests

from src.fetchers.espn import SportEvent

logger = logging.getLogger("tele7sport")

EUROLEAGUE = "https://api-live.euroleague.net"
TSDB = "https://www.thesportsdb.com/api/v1/json/123"
HEADERS = {"User-Agent": "tele7sport (github.com/justinmartin/tele7sport)"}

# Betclic Élite : noms d'usage et acronymes officiels (TheSportsDB n'a ni l'un ni l'autre)
BETCLIC = {
    "Lyon-Villeurbanne": ("LDLC ASVEL", "ASV"), "Paris Basketball": ("Paris Basketball", "PAR"),
    "Dijon": ("JDA Dijon", "JDA"), "Élan Chalon": ("Élan Chalon", "CHA"), "Élan Béarnais": ("Élan Béarnais Pau", "PAU"),
    "Cholet": ("Cholet Basket", "CHO"), "Le Mans Sarthe Basket": ("Le Mans Sarthe", "MSB"), "Limoges": ("Limoges CSP", "CSP"),
    "Nanterre": ("Nanterre 92", "NAN"), "SLUC Nancy Basket": ("SLUC Nancy", "SLUC"), "Saint-Quentin Basket-Ball": ("Saint-Quentin", "SQBB"),
    "Strasbourg": ("SIG Strasbourg", "SIG"), "Chorale Roanne Basket": ("Chorale Roanne", "CRB"),
    "Gravelines-Dunkerque": ("BCM Gravelines-Dunkerque", "BCM"), "Bourg-en-Bresse": ("JL Bourg", "JLB"),
    "Boulazac Basket Dordogne": ("Boulazac", "BBD"), "Monaco": ("AS Monaco", "ASM"),
}
EL_NAMES = {"Paris": "Paris Basketball", "Monaco": "AS Monaco", "Barcelona": "FC Barcelona", "Real Madrid": "Real Madrid"}

ROUND_FR = {"RS": "Saison régulière", "PI": "Play-in", "PO": "Play-offs", "FF": "Final Four"}


def _season_start(today: date) -> int:
    """Saison qui commence en septembre : 2026-27 → 2026."""
    return today.year if today.month >= 8 else today.year - 1


def _get(url: str, **params):
    for attempt in range(5):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=20)
            if r.status_code == 429:  # limite de la clé gratuite : on patiente
                time.sleep(int(r.headers.get("Retry-After") or 15 * (attempt + 1)))
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:  # réseau, JSON vide…
            logger.warning("basket_eu %s : %s", url, e)
            time.sleep(1)
    return None


# ── EuroLeague ───────────────────────────────────────────────

_el_cache: Dict[str, list] = {}


def _el_games(today: date) -> list:
    code = f"E{_season_start(today)}"
    if code not in _el_cache:
        data = _get(f"{EUROLEAGUE}/v2/competitions/E/seasons/{code}/games") or {}
        _el_cache[code] = data.get("data") or []
    return _el_cache[code]


def _el_name(club: dict) -> str:
    n = club.get("abbreviatedName") or club.get("name", "")
    return EL_NAMES.get(n, n)


def _el_table(today: date) -> Optional[dict]:
    games = _el_games(today)
    played = [g["round"] for g in games if g.get("played") and g.get("phaseType", {}).get("code") == "RS"]
    if not played:
        return None
    code = f"E{_season_start(today)}"
    data = _get(f"{EUROLEAGUE}/v3/competitions/E/seasons/{code}/rounds/{max(played)}/basicstandings") or {}
    entries = []
    for t in data.get("teams") or []:
        club = t.get("club") or {}
        entries.append({
            "team_id": club.get("code", ""), "team": _el_name(club),
            "abbr": club.get("tvCode") or club.get("code", ""), "logo": (club.get("images") or {}).get("crest", ""),
            "rank": t.get("position"), "record": f"{t.get('gamesWon', 0)}-{t.get('gamesLost', 0)}",
            "points": None, "played": t.get("gamesPlayed"),
        })
    if not entries:
        return None
    season = f"{_season_start(today)}-{str(_season_start(today) + 1)[2:]}"
    return {"season": season, "groups": [{"name": "EuroLeague", "season": season, "entries": entries}]}


def _el_events(cfg: dict, league_id: str, start: date, end: date, today: date) -> List[SportEvent]:
    table = _el_table(today)
    records = {e["team_id"]: e["record"] for e in (table or {"groups": [{"entries": []}]})["groups"][0]["entries"]}
    out = []
    for g in _el_games(today):
        try:
            ko = datetime.fromisoformat(g["utcDate"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if not (start <= ko.date() <= end):
            continue
        home, away = (g.get("local") or {}), (g.get("road") or {})
        hc, ac = home.get("club") or {}, away.get("club") or {}
        status = "completed" if g.get("played") else ("in_progress" if (g.get("gameStatus") or "").lower() == "live" else "scheduled")
        phase = (g.get("phaseType") or {}).get("code", "RS")
        rnd = f"Journée {g.get('round')}" if phase == "RS" else ROUND_FR.get(phase, phase)
        out.append(SportEvent(
            league_id=league_id, league_label=cfg["label"], emoji=cfg["emoji"],
            home_team=_el_name(hc), away_team=_el_name(ac),
            datetime_utc=ko, status=status,
            home_score=home.get("score") if status != "scheduled" else None,
            away_score=away.get("score") if status != "scheduled" else None,
            round_info=rnd, home_id=hc.get("code", ""), away_id=ac.get("code", ""),
            home_abbr=hc.get("tvCode") or hc.get("code", ""), away_abbr=ac.get("tvCode") or ac.get("code", ""),
            home_logo=(hc.get("images") or {}).get("crest", ""), away_logo=(ac.get("images") or {}).get("crest", ""),
            home_record=records.get(hc.get("code"), ""), away_record=records.get(ac.get("code"), ""),
            espn_id=g.get("identifier", ""), is_highlight=phase == "FF",
        ))
    return out


# ── Betclic Élite (TheSportsDB) ─────────────────────────────

_tsdb_cache: Dict[str, list] = {}


def _tsdb_round(lid: str, season: str, rnd: int) -> list:
    key = f"{lid}:{season}:{rnd}"
    if key not in _tsdb_cache:
        time.sleep(2.1)  # 30 requêtes/minute au plus avec la clé gratuite
        data = _get(f"{TSDB}/eventsround.php", id=lid, r=rnd, s=season) or {}
        _tsdb_cache[key] = data.get("events") or []
    return _tsdb_cache[key]


def _tsdb_all(cfg: dict, today: date, until: date) -> list:
    """Toutes les journées depuis la 1re jusqu'à celle qui dépasse `until`."""
    lid, y = str(cfg["tsdb_id"]), _season_start(today)
    season = f"{y}-{y + 1}"
    games, empty = [], 0
    for rnd in range(1, 41):
        evs = _tsdb_round(lid, season, rnd)
        if not evs:
            empty += 1
            if empty >= 2:
                break
            continue
        empty = 0
        games.extend(evs)
        if min(e.get("dateEvent") or "9999" for e in evs) > until.isoformat():
            break
    return games


def _tsdb_ko(e: dict) -> Optional[datetime]:
    ts = e.get("strTimestamp") or (f"{e.get('dateEvent')}T{e.get('strTime') or '00:00:00'}")
    try:
        return datetime.fromisoformat(ts.replace("Z", "")[:19]).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _score(v) -> Optional[int]:
    return int(v) if v not in (None, "") and str(v).lstrip("-").isdigit() else None


def _tsdb_table(games: list) -> List[dict]:
    rows: Dict[str, dict] = {}
    for e in games:
        hs, as_ = _score(e.get("intHomeScore")), _score(e.get("intAwayScore"))
        for side, other in (("Home", "Away"), ("Away", "Home")):
            tid = e.get(f"id{side}Team")
            name, abbr = BETCLIC.get(e.get(f"str{side}Team", ""), (e.get(f"str{side}Team", ""), ""))
            r = rows.setdefault(tid, {"team_id": tid, "team": name, "abbr": abbr,
                                       "logo": (e.get(f"str{side}TeamBadge") or ""), "w": 0, "l": 0, "diff": 0})
            if hs is None or as_ is None:
                continue
            mine, theirs = (hs, as_) if side == "Home" else (as_, hs)
            r["w" if mine > theirs else "l"] += 1
            r["diff"] += mine - theirs
    entries = sorted(rows.values(), key=lambda r: (-r["w"], r["l"], -r["diff"]))
    for i, r in enumerate(entries, 1):
        r.update(rank=i, record=f"{r['w']}-{r['l']}", points=None, played=r["w"] + r["l"])
    return [{k: r[k] for k in ("team_id", "team", "abbr", "logo", "rank", "record", "points", "played")} for r in entries]


def _fr(e: dict, side: str):
    raw = e.get(f"str{side}Team", "")
    return BETCLIC.get(raw, (raw, ""))


def _tsdb_events(cfg: dict, league_id: str, start: date, end: date, today: date) -> List[SportEvent]:
    games = _tsdb_all(cfg, today, end)
    records = {r["team_id"]: r["record"] for r in _tsdb_table(games)}
    out = []
    for e in games:
        ko = _tsdb_ko(e)
        if not ko or not (start <= ko.date() <= end):
            continue
        hs, as_ = _score(e.get("intHomeScore")), _score(e.get("intAwayScore"))
        st = (e.get("strStatus") or "").lower()
        status = "completed" if hs is not None and as_ is not None and st not in ("in progress", "live") else \
            "in_progress" if st in ("in progress", "live") else "scheduled"
        out.append(SportEvent(
            league_id=league_id, league_label=cfg["label"], emoji=cfg["emoji"],
            home_team=_fr(e, "Home")[0], away_team=_fr(e, "Away")[0], home_abbr=_fr(e, "Home")[1], away_abbr=_fr(e, "Away")[1],
            datetime_utc=ko, status=status,
            home_score=hs, away_score=as_, round_info=f"Journée {e.get('intRound')}" if e.get("intRound") else "",
            home_id=e.get("idHomeTeam", ""), away_id=e.get("idAwayTeam", ""),
            home_logo=e.get("strHomeTeamBadge") or "", away_logo=e.get("strAwayTeamBadge") or "",
            home_record=records.get(e.get("idHomeTeam"), ""), away_record=records.get(e.get("idAwayTeam"), ""),
            espn_id=f"tsdb{e.get('idEvent')}",
        ))
    return out


# ── Points d'entrée ──────────────────────────────────────────

def fetch_events(league_id: str, cfg: dict, start: date, end: date, today: Optional[date] = None) -> List[SportEvent]:
    today = today or date.today()
    if cfg.get("source") == "euroleague":
        return _el_events(cfg, league_id, start, end, today)
    if cfg.get("source") == "thesportsdb":
        return _tsdb_events(cfg, league_id, start, end, today)
    return []


def get_table(league_id: str, cfg: dict, today: date) -> Optional[dict]:
    if cfg.get("source") == "euroleague":
        return _el_table(today)
    if cfg.get("source") == "thesportsdb":
        entries = _tsdb_table(_tsdb_all(cfg, today, today))
        if not any(e["played"] for e in entries):
            return None
        y = _season_start(today)
        season = f"{y}-{str(y + 1)[2:]}"
        return {"season": season, "groups": [{"name": cfg["label"], "season": season, "entries": entries}]}
    return None
