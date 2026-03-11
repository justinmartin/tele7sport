import logging
from datetime import date, timedelta
from typing import List, Dict

from src.config import (
    load_favorites, ESPN_LEAGUES, CYCLING_LEAGUES, ALL_LEAGUES, OUT_DIR
)
from src.fetchers.espn import SportEvent, fetch_espn_events
from src.fetchers.cycling import CyclingEvent, get_cycling_events
from src.fetchers.rankings import get_ap_ranked_teams
from src.fetchers.tv_schedule import resolve_channels
from src.render.newsletter import render_newsletter
from src.send.mailer import send_mail

logger = logging.getLogger("tele7sport")


def _compute_weeks(today: date):
    """Return (this_week_start, this_week_end, prev_week_start, prev_week_end).
    Weeks run Monday → Sunday."""
    # Monday of this week
    this_monday = today - timedelta(days=today.weekday())
    this_sunday = this_monday + timedelta(days=6)
    prev_monday = this_monday - timedelta(days=7)
    prev_sunday = this_monday - timedelta(days=1)
    return this_monday, this_sunday, prev_monday, prev_sunday


def run(dry_run: bool = False, target_date: date = None):
    """Main pipeline: fetch → render → send."""
    today = target_date or date.today()
    this_start, this_end, prev_start, prev_end = _compute_weeks(today)
    favorites = load_favorites()

    user_channels = favorites.get("channels", [])
    fav_list = favorites.get("favorites", [])

    logger.info("📅 Week: %s → %s | Previous: %s → %s",
                this_start, this_end, prev_start, prev_end)
    logger.info("🏟️  %d favorite league(s) configured", len(fav_list))

    # ── Fetch events ────────────────────────────────────────
    all_upcoming: List[SportEvent] = []
    all_past: List[SportEvent] = []
    cycling_upcoming: List[CyclingEvent] = []
    cycling_past: List[CyclingEvent] = []
    channels_map: Dict[str, List[str]] = {}

    for fav in fav_list:
        league_id = fav.get("league", "")
        teams = fav.get("teams", [])
        phases_only = fav.get("phases_only")
        rounds_only = fav.get("rounds_only")

        # Cycling leagues use a different fetcher
        if league_id in CYCLING_LEAGUES:
            logger.info("🚴 Fetching cycling: %s", league_id)
            c_up = get_cycling_events(league_id, this_start, this_end)
            c_past = get_cycling_events(league_id, prev_start, prev_end)
            cycling_upcoming.extend(c_up)
            cycling_past.extend(c_past)
            continue

        # ESPN leagues
        if league_id not in ESPN_LEAGUES:
            logger.warning("⚠️  Unknown league '%s' — skipping", league_id)
            continue

        # Resolve AP_RANKED dynamic teams
        if teams == "AP_RANKED" or (isinstance(teams, list) and teams == ["AP_RANKED"]):
            league_cfg = ESPN_LEAGUES[league_id]
            teams = get_ap_ranked_teams(league_cfg["sport"], league_cfg["league"])
            logger.info("📡 Fetching ESPN: %s (AP Top 25: %d teams)", league_id, len(teams))
        else:
            logger.info("📡 Fetching ESPN: %s (teams=%s)", league_id, teams or "all")

        # Fetch both weeks in one combined range (2 weeks)
        combined = fetch_espn_events(
            league_id, prev_start, this_end,
            team_filters=teams if teams else None,
            phases_only=phases_only,
            rounds_only=rounds_only,
        )

        # Split into past (completed) and upcoming
        for ev in combined:
            ev_date = ev.datetime_utc.date() if hasattr(ev.datetime_utc, 'date') else ev.datetime_utc
            if hasattr(ev_date, '__call__'):
                ev_date = ev_date()
            if ev.status == "completed":
                all_past.append(ev)
            else:
                all_upcoming.append(ev)

    # ── Resolve TV channels ─────────────────────────────────
    for ev in all_upcoming + all_past:
        ch_key = f"{ev.league_id}:{ev.home_team}:{ev.away_team}"
        channels_map[ch_key] = resolve_channels(
            ev.league_id, ev.broadcasts, user_channels
        )

    # ── Sort events ─────────────────────────────────────────
    all_upcoming.sort(key=lambda e: e.datetime_utc)
    all_past.sort(key=lambda e: e.datetime_utc)
    cycling_upcoming.sort(key=lambda e: e.start_date)

    logger.info("📊 Found %d upcoming events, %d past results, %d cycling events",
                len(all_upcoming), len(all_past),
                len(cycling_upcoming) + len(cycling_past))

    # ── Render newsletter ───────────────────────────────────
    html, subject = render_newsletter(
        upcoming_events=all_upcoming,
        past_events=all_past,
        cycling_upcoming=cycling_upcoming,
        cycling_past=cycling_past,
        channels_map=channels_map,
        week_start=this_start,
        week_end=this_end,
        prev_week_start=prev_start,
        prev_week_end=prev_end,
    )

    # ── Save to file ────────────────────────────────────────
    filename = f"newsletter_{this_start.isoformat()}.html"
    out_path = OUT_DIR / filename
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    logger.info("💾 Saved to %s", out_path)

    # ── Send email ──────────────────────────────────────────
    if dry_run:
        logger.info("🧪 Dry run — email not sent. Open %s to preview.", out_path)
    else:
        send_mail(html, subject)

    return html, subject
