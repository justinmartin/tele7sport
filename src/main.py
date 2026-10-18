import json
import logging
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Tuple

from src.config import (
    load_favorites, ESPN_LEAGUES, CYCLING_LEAGUES, OUT_DIR
)
from src.fetchers.espn import SportEvent, fetch_espn_events
from src.fetchers.cycling import CyclingEvent, get_cycling_events
from src.fetchers.nba_tv import LEAGUE_PASS, get_nba_french_tv, match_french_tv
from src.fetchers.rankings import get_ap_ranked_team_ids
from src.fetchers.standings import TeamStanding, get_standings
from src.fetchers.tv_schedule import resolve_channels
from src.render.newsletter import render_newsletter
from src.send.mailer import send_mail
from src.tvday import tv_day

logger = logging.getLogger("tele7sport")

APP_DATA = OUT_DIR.parent / "web" / "data" / "programme.json"


@dataclass
class WeekData:
    this_start: date
    this_end: date
    prev_start: date
    prev_end: date
    upcoming: List[SportEvent] = field(default_factory=list)
    past: List[SportEvent] = field(default_factory=list)
    cycling_upcoming: List[CyclingEvent] = field(default_factory=list)
    cycling_past: List[CyclingEvent] = field(default_factory=list)
    channels_map: Dict[str, List[str]] = field(default_factory=dict)
    nba_hidden: Dict[date, int] = field(default_factory=dict)  # matchs NBA League Pass seulement, par soirée
    standings: List[TeamStanding] = field(default_factory=list)


def _compute_weeks(today: date):
    """Return (this_week_start, this_week_end, prev_week_start, prev_week_end).
    Weeks run Monday → Sunday."""
    this_monday = today - timedelta(days=today.weekday())
    this_sunday = this_monday + timedelta(days=6)
    prev_monday = this_monday - timedelta(days=7)
    prev_sunday = this_monday - timedelta(days=1)
    return this_monday, this_sunday, prev_monday, prev_sunday


def channel_key(ev: SportEvent) -> str:
    return f"{ev.league_id}:{ev.home_team}:{ev.away_team}"


def _filter_nba(events: List[SportEvent], all_teams: bool, data: WeekData) -> List[SportEvent]:
    """NBA : diffuseurs français réels (nba.com). Si on suit toute la ligue, on ne garde
    en détail que les matchs diffusés en France (hors League Pass) et les grosses
    affiches ; les autres sont seulement comptés, par soirée."""
    if not events:
        return events
    games = get_nba_french_tv(data.prev_start, data.this_end)
    kept = []
    for ev in events:
        ev.channels_fr = match_french_tv(games, ev.datetime_utc, ev.home_team)
        on_french_tv = bool(ev.channels_fr) and ev.channels_fr != [LEAGUE_PASS]
        if not all_teams or on_french_tv or ev.is_highlight or not games:
            kept.append(ev)
        elif ev.status != "completed":
            day, _ = tv_day(ev.datetime_utc)
            data.nba_hidden[day] = data.nba_hidden.get(day, 0) + 1
    return kept


def collect(today: date, days_ahead: int = 0) -> WeekData:
    """Récupère tout ce qu'il faut pour la semaine (newsletter et app).
    days_ahead : garantit au moins N jours à venir (l'app est glissante : un dimanche,
    la semaine calendaire est presque finie)."""
    this_start, this_end, prev_start, prev_end = _compute_weeks(today)
    this_end = max(this_end, today + timedelta(days=days_ahead))
    data = WeekData(this_start, this_end, prev_start, prev_end)
    favorites = load_favorites()
    user_channels = favorites.get("channels", [])
    fav_list = favorites.get("favorites", [])

    logger.info("📅 Week: %s → %s | Previous: %s → %s", this_start, this_end, prev_start, prev_end)
    logger.info("🏟️  %d favorite league(s) configured", len(fav_list))

    for fav in fav_list:
        league_id = fav.get("league", "")
        teams = fav.get("teams", [])

        if league_id in CYCLING_LEAGUES:
            logger.info("🚴 Fetching cycling: %s", league_id)
            data.cycling_upcoming.extend(get_cycling_events(league_id, this_start, this_end))
            data.cycling_past.extend(get_cycling_events(league_id, prev_start, prev_end))
            continue
        if league_id not in ESPN_LEAGUES:
            logger.warning("⚠️  Unknown league '%s' — skipping", league_id)
            continue

        team_ids = None
        if teams == "AP_RANKED" or teams == ["AP_RANKED"]:
            cfg = ESPN_LEAGUES[league_id]
            team_ids = get_ap_ranked_team_ids(cfg["sport"], cfg["league"])
            teams = []
            logger.info("📡 Fetching ESPN: %s (AP Top 25: %d teams)", league_id, len(team_ids))
        else:
            logger.info("📡 Fetching ESPN: %s (teams=%s)", league_id, teams or "all")

        # Les deux semaines en une seule plage
        events = fetch_espn_events(
            league_id, prev_start, this_end,
            team_filters=teams or None,
            phases_only=fav.get("phases_only"),
            rounds_only=fav.get("rounds_only"),
            team_ids=team_ids,
        )
        if league_id == "nba":
            events = _filter_nba(events, all_teams=not teams, data=data)

        for ev in events:
            (data.past if ev.status == "completed" else data.upcoming).append(ev)

    for ev in data.upcoming + data.past:
        data.channels_map[channel_key(ev)] = ev.channels_fr or resolve_channels(ev.league_id, ev.broadcasts, user_channels)

    data.upcoming.sort(key=lambda e: e.datetime_utc)
    data.past.sort(key=lambda e: e.datetime_utc)
    data.cycling_upcoming.sort(key=lambda e: e.start_date)
    data.standings = get_standings(fav_list, today)

    logger.info("📊 Found %d upcoming events, %d past results, %d cycling events, %d NBA games summarised",
                len(data.upcoming), len(data.past),
                len(data.cycling_upcoming) + len(data.cycling_past), sum(data.nba_hidden.values()))
    return data


def _event_json(ev: SportEvent, channels: List[str]) -> dict:
    day, night = tv_day(ev.datetime_utc)
    return {
        "league": ev.league_id, "label": ev.league_label, "emoji": ev.emoji,
        "home": ev.home_team, "away": ev.away_team,
        "kickoff": ev.datetime_utc.astimezone(timezone.utc).isoformat(),
        "tv_day": day.isoformat(), "night": night,
        "status": ev.status, "home_score": ev.home_score, "away_score": ev.away_score,
        "channels": channels, "highlight": ev.is_highlight, "round": ev.round_info,
        "fav": ev.matched_team,
    }


def export_app_data(data: WeekData) -> dict:
    """Données de l'app web (web/data/programme.json)."""
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "week": {"start": data.this_start.isoformat(), "end": data.this_end.isoformat()},
        "prev_week": {"start": data.prev_start.isoformat(), "end": data.prev_end.isoformat()},
        "events": [_event_json(ev, data.channels_map.get(channel_key(ev), [])) for ev in data.past + data.upcoming],
        "nba_hidden": {d.isoformat(): n for d, n in sorted(data.nba_hidden.items())},
        "standings": [asdict(s) for s in data.standings],
        "cycling": [{
            "name": c.name, "label": c.league_label, "emoji": c.emoji, "location": c.location,
            "start": c.start_date.isoformat(), "end": c.end_date.isoformat(),
            "time": c.start_time, "channels": c.channels_fr, "details": c.details,
        } for c in data.cycling_upcoming + data.cycling_past],
    }
    APP_DATA.parent.mkdir(parents=True, exist_ok=True)
    with open(APP_DATA, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    logger.info("📱 App data: %d events → %s", len(payload["events"]), APP_DATA)
    return payload


def run(dry_run: bool = False, target_date: date = None) -> Tuple[str, str]:
    """Newsletter : collecte → rendu → envoi (et données de l'app au passage)."""
    data = collect(target_date or date.today())
    export_app_data(data)
    html, subject = render_newsletter(data)

    out_path = OUT_DIR / f"newsletter_{data.this_start.isoformat()}.html"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    logger.info("💾 Saved to %s", out_path)

    if dry_run:
        logger.info("🧪 Dry run — email not sent. Open %s to preview.", out_path)
    else:
        send_mail(html, subject)
    return html, subject


def export(target_date: date = None) -> dict:
    """Rafraîchit seulement les données de l'app (lancé chaque jour)."""
    return export_app_data(collect(target_date or date.today(), days_ahead=7))
