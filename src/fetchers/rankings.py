import logging
import requests
from typing import List, Dict, Tuple

logger = logging.getLogger("tele7sport")

RANKINGS_URL = "https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/rankings"

# Cache rankings per run to avoid re-fetching
_cache: Dict[str, List[str]] = {}


def get_ap_ranked_teams(sport: str, league: str) -> List[str]:
    """
    Fetch the current AP Top 25 teams for a given sport/league.
    Returns a list of team location names (e.g. ["Duke", "Arizona", ...]).
    Results are cached for the duration of the run.
    """
    cache_key = f"{sport}/{league}"
    if cache_key in _cache:
        return _cache[cache_key]

    url = RANKINGS_URL.format(sport=sport, league=league)
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            logger.warning("Rankings fetch failed %s: HTTP %d", cache_key, resp.status_code)
            _cache[cache_key] = []
            return []

        data = resp.json()
        for ranking in data.get("rankings", []):
            name = ranking.get("name", "")
            if "AP" in name.upper():
                teams = []
                for rk in ranking.get("ranks", []):
                    team = rk.get("team", {})
                    # Use location (e.g. "Duke", "Ohio State") as the match name
                    location = team.get("location", "")
                    nickname = team.get("nickname", "")
                    if location:
                        teams.append(location)
                    elif nickname:
                        teams.append(nickname)
                logger.info("🏆 AP Top 25 %s: %d teams loaded", cache_key, len(teams))
                _cache[cache_key] = teams
                return teams

        logger.warning("No AP ranking found for %s", cache_key)
        _cache[cache_key] = []
        return []

    except Exception as e:
        logger.warning("Rankings fetch error %s: %s", cache_key, e)
        _cache[cache_key] = []
        return []


def clear_cache():
    """Clear the rankings cache (useful between runs in scheduler mode)."""
    _cache.clear()
