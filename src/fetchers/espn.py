import logging
import requests
from datetime import date, datetime, timedelta
from dataclasses import dataclass, field
from typing import List, Optional

from src.config import ESPN_LEAGUES, HIGHLIGHT_PHASES

logger = logging.getLogger("tele7sport")

BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"


@dataclass
class SportEvent:
    league_id: str
    league_label: str
    emoji: str
    home_team: str
    away_team: str
    datetime_utc: datetime
    status: str  # "scheduled", "in_progress", "completed"
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    broadcasts: List[str] = field(default_factory=list)
    venue: str = ""
    round_info: str = ""
    is_highlight: bool = False
    matched_team: str = ""


def _is_in_season(league_id: str, check_date: date) -> bool:
    """Skip queries for leagues that are clearly out of season."""
    cfg = ESPN_LEAGUES.get(league_id, {})
    window = cfg.get("season_window")
    if not window:
        return True
    m_start, d_start, m_end, d_end = window
    start = date(check_date.year, m_start, d_start)
    end = date(check_date.year, m_end, d_end)
    # Allow 1‑week buffer on each side
    return (start - timedelta(days=7)) <= check_date <= (end + timedelta(days=7))


def _team_matches(team_name: str, filters: List[str]) -> str:
    """Return the matching filter string if *team_name* matches any filter, else ''."""
    name_lower = team_name.lower()
    for f in filters:
        f_lower = f.lower()
        if f_lower in name_lower or name_lower in f_lower:
            return f
    return ""


def _detect_highlight(round_info: str, notes_raw: list) -> bool:
    text = (round_info + " " + " ".join(str(n) for n in notes_raw)).lower()
    return any(kw in text for kw in HIGHLIGHT_PHASES)


def _parse_event(event_data: dict, league_id: str, league_cfg: dict) -> Optional[SportEvent]:
    comps = event_data.get("competitions", [])
    if not comps:
        return None
    comp = comps[0]

    home_team = away_team = "TBD"
    home_score = away_score = None
    for c in comp.get("competitors", []):
        team = c.get("team", {})
        name = team.get("displayName") or team.get("shortDisplayName") or "TBD"
        score = c.get("score")
        if c.get("homeAway") == "home":
            home_team = name
            home_score = int(score) if score and str(score).isdigit() else None
        else:
            away_team = name
            away_score = int(score) if score and str(score).isdigit() else None

    status_data = comp.get("status", {}).get("type", {})
    if status_data.get("completed"):
        status = "completed"
    elif status_data.get("state") == "in":
        status = "in_progress"
    else:
        status = "scheduled"

    broadcasts = []
    for bc in comp.get("broadcasts", []):
        broadcasts.extend(bc.get("names", []))

    venue = comp.get("venue", {}).get("fullName", "")
    notes = comp.get("notes", [])
    round_info = notes[0].get("headline", "") if notes else ""

    dt_str = comp.get("date") or event_data.get("date", "")
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        dt = datetime.utcnow()

    is_highlight = _detect_highlight(round_info, notes)

    return SportEvent(
        league_id=league_id,
        league_label=league_cfg["label"],
        emoji=league_cfg["emoji"],
        home_team=home_team,
        away_team=away_team,
        datetime_utc=dt,
        status=status,
        home_score=home_score,
        away_score=away_score,
        broadcasts=broadcasts,
        venue=venue,
        round_info=round_info,
        is_highlight=is_highlight,
    )


def _fetch_scoreboard(sport: str, league: str, target_date: date) -> list:
    url = f"{BASE_URL}/{sport}/{league}/scoreboard"
    params = {"dates": target_date.strftime("%Y%m%d")}
    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code != 200:
            return []
        return resp.json().get("events", [])
    except Exception as e:
        logger.warning("ESPN fetch failed %s/%s %s: %s", sport, league, target_date, e)
        return []


def _fetch_scoreboard_range(sport: str, league: str, start: date, end: date) -> list:
    """Fetch all events in a date range. Tries range query first, then single-date fallback."""
    url = f"{BASE_URL}/{sport}/{league}/scoreboard"
    # Try range query
    date_str = f"{start.strftime('%Y%m%d')}-{end.strftime('%Y%m%d')}"
    params = {"dates": date_str, "limit": 200}
    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code == 200:
            events = resp.json().get("events", [])
            if events:
                return events
    except Exception as e:
        logger.debug("ESPN range fetch failed %s/%s: %s", sport, league, e)

    # Fallback: try just the current week's start date (today's scoreboard)
    # This limits to 1 fallback request instead of day-by-day
    try:
        params = {"dates": start.strftime("%Y%m%d")}
        resp = requests.get(url, params=params, timeout=8)
        if resp.status_code == 200:
            return resp.json().get("events", [])
    except Exception as e:
        logger.warning("ESPN fallback fetch failed %s/%s: %s", sport, league, e)

    return []


def _round_matches(round_info: str, allowed_rounds: List[str]) -> bool:
    """Check if the event round matches allowed phases (SEMIFINAL, FINAL, etc.)."""
    text = round_info.lower()
    mapping = {
        "QUARTERFINAL": ["quarterfinal", "quarter-final", "quart de finale", "quarter"],
        "SEMIFINAL": ["semifinal", "semi-final", "demi-finale", "semifinals"],
        "FINAL": ["final", "finale", "championship", "super bowl", "nba finals"],
    }
    for phase in allowed_rounds:
        keywords = mapping.get(phase.upper(), [phase.lower()])
        if any(kw in text for kw in keywords):
            return True
    return False


def fetch_espn_events(
    league_id: str,
    start_date: date,
    end_date: date,
    team_filters: Optional[List[str]] = None,
    phases_only: Optional[List[str]] = None,
    rounds_only: Optional[List[str]] = None,
) -> List[SportEvent]:
    """
    Fetch events from ESPN for a league between start_date and end_date.
    Optionally filter by team names and/or tournament phases.
    """
    cfg = ESPN_LEAGUES.get(league_id)
    if not cfg:
        logger.warning("Unknown ESPN league: %s", league_id)
        return []

    sport = cfg["sport"]
    league = cfg["league"]
    events: List[SportEvent] = []

    if not _is_in_season(league_id, start_date):
        return []

    raw_events = _fetch_scoreboard_range(sport, league, start_date, end_date)
    for raw in raw_events:
        ev = _parse_event(raw, league_id, cfg)
        if not ev:
            continue

        # Phase/round filter
        phase_filter = phases_only or rounds_only
        if phase_filter and not _round_matches(ev.round_info, phase_filter):
            continue

        # Team filter
        if team_filters:
            match_home = _team_matches(ev.home_team, team_filters)
            match_away = _team_matches(ev.away_team, team_filters)
            if not match_home and not match_away:
                continue
            ev.matched_team = match_home or match_away
        else:
            # No team filter → include all events for this league
            ev.matched_team = ""

        events.append(ev)

    # Deduplicate by (home_team + away_team + datetime)
    seen = set()
    unique = []
    for ev in events:
        key = (ev.home_team, ev.away_team, ev.datetime_utc.isoformat())
        if key not in seen:
            seen.add(key)
            unique.append(ev)

    return unique


def search_teams(sport: str, league: str, query: str = "") -> list:
    """Search teams in an ESPN league. Useful for finding team names/IDs."""
    url = f"{BASE_URL}/{sport}/{league}/teams"
    try:
        resp = requests.get(url, params={"limit": 200}, timeout=15)
        if resp.status_code != 200:
            return []
        data = resp.json()
        teams = []
        for group in data.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", []):
            t = group.get("team", {})
            name = t.get("displayName", "")
            if query and query.lower() not in name.lower():
                continue
            teams.append({
                "id": t.get("id"),
                "name": name,
                "abbreviation": t.get("abbreviation", ""),
                "logo": t.get("logos", [{}])[0].get("href", "") if t.get("logos") else "",
            })
        return teams
    except Exception as e:
        logger.warning("Team search failed %s/%s: %s", sport, league, e)
        return []
