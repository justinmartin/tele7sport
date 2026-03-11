import logging
import requests
from typing import List, Optional

from bs4 import BeautifulSoup

from src.config import ALL_LEAGUES

logger = logging.getLogger("tele7sport")

# ── Programme TV scraping (programme-tv.net) ────────────────
PROGRAMME_TV_URL = "https://www.programme-tv.net/programme/sport/"


def get_default_channels(league_id: str) -> List[str]:
    """Return the default French TV channels for a league."""
    cfg = ALL_LEAGUES.get(league_id, {})
    return cfg.get("channels_fr", [])


def resolve_channels(
    league_id: str,
    espn_broadcasts: List[str],
    user_channels: List[str],
) -> List[str]:
    """
    Determine which channels will broadcast an event.

    Priority:
    1. ESPN broadcast data → match against user's channels
    2. Default French channels for the league → match against user's channels
    3. If nothing matches, return default channels anyway (with a note)
    """
    defaults = get_default_channels(league_id)

    # Normalize for comparison
    def normalize(s: str) -> str:
        return s.lower().replace("é", "e").replace("'", "'").strip()

    user_norm = {normalize(ch): ch for ch in user_channels}

    # Check ESPN broadcasts against user channels
    matched = []
    for bc in espn_broadcasts:
        bc_n = normalize(bc)
        for u_n, u_orig in user_norm.items():
            if bc_n in u_n or u_n in bc_n:
                if u_orig not in matched:
                    matched.append(u_orig)
                break

    if matched:
        return matched

    # Fall back to default channels, matched against user's list
    for ch in defaults:
        ch_n = normalize(ch)
        for u_n, u_orig in user_norm.items():
            if ch_n in u_n or u_n in ch_n:
                if u_orig not in matched:
                    matched.append(u_orig)
                break

    return matched if matched else defaults


def scrape_programme_tv() -> list:
    """
    Optional: scrape programme-tv.net for today's sport broadcasts.
    Returns a list of dicts with programme info.
    This is best-effort and may fail if the site structure changes.
    """
    try:
        resp = requests.get(PROGRAMME_TV_URL, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (compatible; Tele7Sport/1.0)"
        })
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        programmes = []
        for item in soup.select(".singleBroadcastCard, .broadcast-card"):
            title = item.select_one(".title, h3")
            channel = item.select_one(".channel, .channelName")
            time_el = item.select_one(".time, .scheduleTime")
            if title and channel:
                programmes.append({
                    "title": title.get_text(strip=True),
                    "channel": channel.get_text(strip=True),
                    "time": time_el.get_text(strip=True) if time_el else "",
                })
        return programmes
    except Exception as e:
        logger.debug("Programme TV scrape failed (non-critical): %s", e)
        return []
