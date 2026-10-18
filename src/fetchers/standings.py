"""
Bilan et classement des équipes favorites (API standings d'ESPN).

Piège : sans paramètre de saison, ESPN renvoie parfois une saison ancienne (Top 14 :
2022-23). On interroge donc plusieurs saisons candidates et on garde la plus récente
qui a des données.
"""
import logging
import re
from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional

import requests

from src.config import ESPN_LEAGUES
from src.fetchers.espn import _team_matches

logger = logging.getLogger("tele7sport")

URL = "https://site.api.espn.com/apis/v2/sports/{sport}/{league}/standings"


@dataclass
class TeamStanding:
    league_id: str
    league_label: str
    emoji: str
    team: str
    group: str          # « Ligue 2 », « American Football Conference »…
    rank: Optional[int]
    group_size: int
    record: str         # « 4-0 », « 6V 1N 1D »
    points: Optional[str]
    season: str


def _groups(data: dict) -> List[dict]:
    out, stack = [], [data]
    while stack:
        g = stack.pop()
        if (g.get("standings") or {}).get("entries"):
            out.append(g)
        stack.extend(g.get("children") or [])
    return out


def _season_of(data: dict, groups: List[dict]) -> int:
    for g in groups:
        season = (g.get("standings") or {}).get("season")
        if season:
            return int(season)
    years = [int(y) for y in re.findall(r"\d{4}", str((data.get("seasons") or [{}])[0].get("year", "")))]
    return max(years) if years else 0


def _fetch_latest(sport: str, league: str, today: date) -> Optional[dict]:
    best, best_season = None, -1
    for params in ({}, {"season": today.year + 1}, {"season": today.year}):
        try:
            resp = requests.get(URL.format(sport=sport, league=league), params=params, timeout=10)
            if resp.status_code != 200:
                continue
            data = resp.json()
        except Exception:
            continue
        groups = _groups(data)
        if not groups:
            continue
        season = _season_of(data, groups)
        if season > best_season:
            best, best_season = data, season
    return best


def _stat(entry: dict, *names: str) -> Optional[str]:
    for s in entry.get("stats", []):
        if s.get("name") in names and s.get("displayValue") not in (None, ""):
            return s["displayValue"]
    return None


def _season_finished(season_label: str, today: date) -> bool:
    """« 2025-26 » vu en octobre 2026 : saison terminée (la nouvelle n'a pas commencé et
    ESPN renvoie l'ancienne). Les saisons sur une seule année (NFL « 2026 ») ne sont pas
    concernées."""
    m = re.search(r"(\d{4})\s*[-/]\s*(\d{2,4})", season_label)
    if not m:
        return False
    end = int(m.group(2)) if len(m.group(2)) == 4 else int(m.group(1)[:2] + m.group(2))
    return end < today.year or (end == today.year and today.month >= 8)


def get_standings(favorites: List[dict], today: date) -> List[TeamStanding]:
    """Classement de chaque équipe favorite nommée (hors sélections nationales et Top 25),
    pour les compétitions en cours où l'équipe a déjà joué."""
    result: List[TeamStanding] = []
    for fav in favorites:
        league_id, teams = fav.get("league", ""), fav.get("teams") or []
        cfg = ESPN_LEAGUES.get(league_id)
        if not cfg or not isinstance(teams, list) or not teams or teams == ["AP_RANKED"] or teams == ["France"]:
            continue
        data = _fetch_latest(cfg["sport"], cfg["league"], today)
        if not data:
            continue
        for group in _groups(data):
            entries = group["standings"]["entries"]
            season = str((group.get("standings") or {}).get("seasonDisplayName") or "")
            for e in entries:
                name = e.get("team", {}).get("displayName", "")
                played = _stat(e, "gamesPlayed")
                if not _team_matches(name, teams) or _season_finished(season, today) or played == "0":
                    continue
                wins, losses, ties = _stat(e, "wins", "gamesWon"), _stat(e, "losses", "gamesLost"), _stat(e, "ties", "gamesDrawn")
                if cfg["sport"] in ("soccer", "rugby"):
                    record = f"{wins or 0}V {ties or 0}N {losses or 0}D"
                else:
                    record = f"{wins}-{losses}" + (f"-{ties}" if ties and ties != "0" else "")
                rank = _stat(e, "rank", "playoffSeed")
                result.append(TeamStanding(
                    league_id=league_id, league_label=cfg["label"], emoji=cfg["emoji"], team=name,
                    group=" ".join((group.get("name") or cfg["label"]).split()), rank=int(rank) if rank and rank.isdigit() else None,
                    group_size=len(entries), record=record,
                    points=_stat(e, "points") if cfg["sport"] in ("soccer", "rugby") else None, season=season,
                ))
    # Une ligne par équipe (la même équipe peut apparaître dans deux compétitions favorites)
    seen, unique = set(), []
    for st in result:
        if (st.league_id, st.team) not in seen:
            seen.add((st.league_id, st.team))
            unique.append(st)
    logger.info("📈 Classements : %d équipe(s)", len(unique))
    return unique
