"""
Diffuseurs français des matchs NBA, lus sur nba.com (données __NEXT_DATA__ de la page
/games). ESPN ne donne que les chaînes américaines : sans ça, tous les matchs NBA
s'affichaient « beIN Sports » alors que beIN n'en diffuse que deux ou trois par soir.

Règles observées sur nba.com :
- intlTvBroadcasters / intlOttBroadcasters : diffuseurs internationaux explicites ;
- diffusion nationale US (ESPN, TNT, ABC, NBC, Prime…) : reprise par beIN Sports ;
- sinon : League Pass uniquement.
"""
import json
import logging
import re
import socket
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from typing import Dict, List, Tuple

import requests

logger = logging.getLogger("tele7sport")

LEAGUE_PASS = "NBA League Pass"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}
NEXT_DATA_RE = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)

# IPv4 d'abord : sur certains réseaux l'IPv6 de nba.com ne répond pas et requests attend
# l'échec de chaque adresse avant de tenter l'IPv4.
_getaddrinfo = socket.getaddrinfo
socket.getaddrinfo = lambda *a, **k: sorted(_getaddrinfo(*a, **k), key=lambda r: r[0] != socket.AF_INET)


def _french_broadcasters(bc: dict) -> List[str]:
    names: List[str] = []
    for field in ("intlTvBroadcasters", "intlOttBroadcasters"):
        for b in bc.get(field, []) or []:
            name = b.get("broadcasterDisplayName", "")
            if name and name not in names:
                names.append(name)
    if not names and (bc.get("nationalBroadcasters") or bc.get("nationalOttBroadcasters")):
        names.append("beIN Sports")
    return names or [LEAGUE_PASS]


def _games_for_us_date(day: date) -> List[Tuple[datetime, str, List[str]]]:
    """[(heure UTC, nom court de l'équipe à domicile, diffuseurs FR)] pour une date US."""
    resp = requests.get(f"https://www.nba.com/games?date={day.isoformat()}", headers=HEADERS, timeout=15)
    resp.raise_for_status()
    m = NEXT_DATA_RE.search(resp.text)
    if not m:
        return []
    modules = json.loads(m.group(1)).get("props", {}).get("pageProps", {}).get("gameCardFeed", {}).get("modules", [])
    games = []
    for module in modules:
        for card in module.get("cards", []):
            cd = card.get("cardData", {})
            t = cd.get("gameTimeUtc")
            if not t:
                continue
            games.append((
                datetime.fromisoformat(t.replace("Z", "+00:00")),
                cd.get("homeTeam", {}).get("teamName", ""),
                _french_broadcasters(cd.get("broadcasters", {})),
            ))
    return games


def get_nba_french_tv(start: date, end: date) -> List[Tuple[datetime, str, List[str]]]:
    """Tous les matchs NBA entre deux dates (UTC), avec leurs diffuseurs français.
    Retourne [] si nba.com ne répond pas : la newsletter n'est jamais bloquée."""
    days = [start - timedelta(days=1) + timedelta(days=i) for i in range((end - start).days + 2)]
    try:
        with ThreadPoolExecutor(max_workers=6) as pool:
            per_day = list(pool.map(_games_for_us_date, days))
    except Exception as e:
        logger.warning("⚠️  nba.com indisponible, diffuseurs NBA inconnus : %s", e)
        return []
    games = [g for day_games in per_day for g in day_games]
    logger.info("📺 nba.com : %d matchs, %d diffusés en France hors League Pass",
                len(games), sum(1 for g in games if g[2] != [LEAGUE_PASS]))
    return games


def match_french_tv(games: List[Tuple[datetime, str, List[str]]], kickoff_utc: datetime, home_team: str) -> List[str]:
    """Diffuseurs FR d'un match ESPN (même heure à 2 h près, équipe à domicile identique)."""
    for t, home_short, channels in games:
        if home_short and home_short.lower() in home_team.lower() and abs((t - kickoff_utc).total_seconds()) < 7200:
            return channels
    return []
