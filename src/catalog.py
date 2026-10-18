"""
Catalogue de l'app : toutes les compétitions en saison (matchs, équipes, logos, bilans,
classements), pour que l'app filtre elle-même selon les favoris choisis sur le téléphone.
Écrit dans web/data/catalog.json (format compact : l'app le lit plusieurs fois par jour).
"""
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List

import requests

from src.config import ESPN_LEAGUES, CYCLING_LEAGUES, OUT_DIR, load_favorites
from src.fetchers.cycling import get_cycling_events
from src.fetchers.espn import BASE_URL, SportEvent, _is_in_season, _round_matches, _team_matches, fetch_espn_events
from src.fetchers.nba_tv import get_nba_french_tv, match_french_tv
from src.fetchers.standings import get_league_table
from src.fetchers.tv_schedule import resolve_channels
from src.tvday import tv_day

logger = logging.getLogger("tele7sport")

CATALOG = OUT_DIR.parent / "web" / "data" / "catalog.json"
PHASES = ["QUARTERFINAL", "SEMIFINAL", "FINAL"]
AP_LEAGUES = {"ncaaf", "ncaam"}
# Compétitions à élimination directe : « seulement les phases finales » a un sens
FINALS_LEAGUES = {
    "top-14", "champions-league", "europa-league", "conference-league", "coupe-de-france", "world-cup", "euro",
    "rugby-world-cup", "fa-cup", "league-cup", "copa-del-rey", "coppa-italia", "dfb-pokal", "coupe-du-monde-clubs",
    "copa-america", "can", "libertadores", "coupe-du-monde-f", "euro-f", "ligue-des-champions-f",
    "champions-cup-rugby", "challenge-cup-rugby",
}  # trop de matchs : on ne garde que ceux d'une équipe du Top 25 AP


# ESPN n'a qu'une icône générique pour le rugby (et rien pour certaines compétitions) :
# on prend alors le logo officiel sur Wikipédia.
WIKI_LOGOS = {
    "top-14": "fr/Top_14",
    "champions-cup-rugby": "en/European_Rugby_Champions_Cup",
    "challenge-cup-rugby": "en/EPCR_Challenge_Cup",
    "six-nations": "en/Six_Nations_Championship",
    "rugby-world-cup": "en/Rugby_World_Cup",
    "betclic-elite": "fr/Championnat_de_France_de_basket-ball",
}


def _wiki_logo(page: str) -> str:
    lang, title = page.split("/", 1)
    try:
        d = requests.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}", timeout=10,
                         headers={"User-Agent": "tele7sport (github.com/justinmartin/tele7sport)"}).json()
        return ((d.get("originalimage") or d.get("thumbnail") or {}).get("source") or "").split("?")[0]
    except Exception:
        return ""


def _league_logo(league_id: str, cfg: dict) -> str:
    """Logo de la compétition (version pour fond clair : l'app le pose sur une pastille blanche)."""
    logo = ""
    try:
        resp = requests.get(f"{BASE_URL}/{cfg['sport']}/{cfg['league']}/scoreboard", timeout=10)
        logos = (resp.json().get("leagues") or [{}])[0].get("logos") or []
        logo = logos[0].get("href", "") if logos else ""
    except Exception:
        pass
    if (not logo or "ESPN-icon" in logo) and league_id in WIKI_LOGOS:
        logo = _wiki_logo(WIKI_LOGOS[league_id]) or logo
    return logo


def _team(ev: SportEvent, side: str) -> dict:
    """Côté d'un match. Nom, abréviation et logo sont dans leagues[lg].teams[id] (pas
    répétés à chaque match) ; on garde ici le bilan et le rang du moment."""
    g = lambda k: getattr(ev, f"{side}_{k}")
    team = {"id": g("id"), "r": g("record")}
    if g("rank"):
        team["rk"] = g("rank")
    if g("color"):
        team["c"] = g("color")
    return team


def _event(ev: SportEvent, channels: List[str], idx: int) -> dict:
    day, night = tv_day(ev.datetime_utc)
    out = {
        "id": idx, "lg": ev.league_id,
        "ko": ev.datetime_utc.astimezone(timezone.utc).isoformat(timespec="minutes"),
        "day": day.isoformat(), "st": ev.status[0],  # s(cheduled) / i(n progress) / c(ompleted)
        "h": _team(ev, "home"), "a": _team(ev, "away"), "ch": channels,
    }
    if night:
        out["nt"] = 1
    if ev.home_score is not None:
        out["hs"], out["as"] = ev.home_score, ev.away_score
    if ev.is_highlight:
        out["hl"] = 1
    if ev.round_info:
        out["rd"] = ev.round_info
        phases = [p for p in PHASES if _round_matches(ev.round_info, [p])]
        if phases:
            out["ph"] = phases
    return out


def _default_favorites(leagues: Dict[str, dict]) -> List[dict]:
    """Favoris de la newsletter (favorites.json / secret) au format de l'app :
    {league, mode: all|teams|ap, teams: [ids], names: [noms non retrouvés], finals}."""
    out = []
    for fav in load_favorites().get("favorites", []):
        league_id, teams = fav.get("league", ""), fav.get("teams") or []
        if league_id not in leagues:
            continue
        item = {"league": league_id, "finals": bool(fav.get("phases_only") or fav.get("rounds_only"))}
        if teams in ("AP_RANKED", ["AP_RANKED"]):
            item.update(mode="ap", teams=[], names=[])
        elif not teams:
            item.update(mode="all", teams=[], names=[])
        else:
            known = leagues[league_id]["teams"]
            ids = [tid for tid, t in known.items() if _team_matches(t["n"], teams)]
            found = {f for f in teams if any(_team_matches(known[tid]["n"], [f]) for tid in ids)}
            item.update(mode="teams", teams=ids, names=[f for f in teams if f not in found])
        out.append(item)
    return out


def _next_event(league_id: str, after: date):
    """Prochain événement d'un calendrier hors fenêtre (ex. la manche MXGP de février),
    affiché dans les favoris pour les sports à l'arrêt."""
    events = get_cycling_events(league_id, after + timedelta(days=1), after + timedelta(days=365))
    ev = min(events, key=lambda e: e.start_date, default=None)
    return {"name": ev.name, "start": ev.start_date.isoformat(), "loc": ev.location} if ev else None


def build_catalog(today: date) -> dict:
    start = today - timedelta(days=today.weekday() + 7)            # lundi de la semaine passée
    end = max(start + timedelta(days=13), today + timedelta(days=7))  # au moins 7 jours devant
    logger.info("🗂️  Catalogue : %s → %s", start, end)

    leagues: Dict[str, dict] = {}
    events: List[dict] = []
    tables: Dict[str, dict] = {}
    for league_id, cfg in ESPN_LEAGUES.items():
        evs = fetch_espn_events(league_id, start, end) if _is_in_season(league_id, today) else []
        if league_id in AP_LEAGUES:
            evs = [e for e in evs if e.home_rank or e.away_rank]
        if league_id == "nba" and evs:
            games = get_nba_french_tv(start, end)
            for e in evs:
                e.channels_fr = match_french_tv(games, e.datetime_utc, e.home_team)
        # Compétition à l'arrêt (Six Nations en octobre, Coupe du monde entre deux éditions) :
        # on la garde quand même pour qu'on puisse la suivre à l'avance, sans classement.
        table = None if league_id in AP_LEAGUES or not evs else get_league_table(league_id, today)

        teams: Dict[str, dict] = {}
        for e in evs:
            for side in ("home", "away"):
                tid = getattr(e, f"{side}_id")
                if tid:
                    teams[tid] = {"n": getattr(e, f"{side}_team"), "a": getattr(e, f"{side}_abbr"), "l": getattr(e, f"{side}_logo")}
        if table:
            for g in table["groups"]:
                for row in g["entries"]:
                    teams.setdefault(row["team_id"], {"n": row["team"], "a": row["abbr"], "l": row["logo"]})
            tables[league_id] = table
        leagues[league_id] = {
            "label": cfg["label"], "emoji": cfg["emoji"], "sport": cfg["sport"], "logo": _league_logo(league_id, cfg),
            "teams": dict(sorted(teams.items(), key=lambda kv: kv[1]["n"])),
            "has_finals": any(_round_matches(e.round_info, PHASES) for e in evs) or league_id in FINALS_LEAGUES,
            "active": bool(evs),
        }
        for e in evs:
            channels = e.channels_fr or resolve_channels(league_id, e.broadcasts, [])
            events.append(_event(e, channels, len(events)))
        if evs:
            logger.info("   %s : %d matchs, %d équipes%s", cfg["label"], len(evs), len(teams), ", classement" if table else "")

    cycling = []
    for league_id in CYCLING_LEAGUES:
        for c in get_cycling_events(league_id, start, end):
            cycling.append({
                "lg": league_id, "label": c.league_label, "emoji": c.emoji, "name": c.name, "loc": c.location,
                "start": c.start_date.isoformat(), "end": c.end_date.isoformat(), "time": c.start_time,
                "ch": c.channels_fr, "details": c.details,
            })

    events.sort(key=lambda e: e["ko"])
    catalog = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "leagues": leagues, "events": events, "tables": tables, "cycling": cycling,
        "cycling_leagues": {k: {"label": v["label"], "emoji": v["emoji"], "sport": v.get("sport", "cycling"),
                                "next": _next_event(k, end)} for k, v in CYCLING_LEAGUES.items()},
        "default_favorites": _default_favorites(leagues),
        "default_cycling": [f["league"] for f in load_favorites().get("favorites", []) if f.get("league") in CYCLING_LEAGUES],
        "channels": load_favorites().get("channels", []),
    }
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    with open(CATALOG, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))
    logger.info("📱 Catalogue : %d compétitions, %d matchs, %d classements → %s (%d Ko)",
                len(leagues), len(events), len(tables), CATALOG, CATALOG.stat().st_size // 1024)
    return catalog
