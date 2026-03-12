import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("tele7sport")

# ── Env vars ────────────────────────────────────────────────
TIMEZONE = os.getenv("TIMEZONE") or "Europe/Paris"
LANGUAGE = os.getenv("LANGUAGE") or "fr"
NEWSLETTER_DAY = os.getenv("NEWSLETTER_DAY") or "monday"
NEWSLETTER_TIME = os.getenv("NEWSLETTER_TIME") or "09:00"

MAIL_SMTP_HOST = os.getenv("MAIL_SMTP_HOST", "smtp.gmail.com")
MAIL_SMTP_PORT = int(os.getenv("MAIL_SMTP_PORT", 587))
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
EMAIL_TO = os.getenv("EMAIL_TO")

# ── Project paths ───────────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
FAVORITES_PATH = ROOT_DIR / "favorites.json"
FAVORITES_EXAMPLE_PATH = ROOT_DIR / "favorites.example.json"
OUT_DIR = ROOT_DIR / "out"
OUT_DIR.mkdir(exist_ok=True)

# ── ESPN league registry ────────────────────────────────────
ESPN_LEAGUES = {
    # Basketball
    "nba": {
        "sport": "basketball", "league": "nba",
        "label": "NBA", "emoji": "🏀",
        "channels_fr": ["beIN Sports", "NBA League Pass"],
    },
    "betclic-elite": {
        "sport": "basketball", "league": "fra.1",
        "label": "Betclic Élite", "emoji": "🏀",
        "channels_fr": ["Canal+ Sport", "L'Équipe"],
    },
    # American Football
    "nfl": {
        "sport": "football", "league": "nfl",
        "label": "NFL", "emoji": "🏈",
        "channels_fr": ["L'Équipe", "beIN Sports"],
    },
    "ncaaf": {
        "sport": "football", "league": "college-football",
        "label": "NCAA Football", "emoji": "🏈",
        "channels_fr": ["ESPN"],
        "supports_ap_ranked": True,
    },
    # College Basketball
    "ncaam": {
        "sport": "basketball", "league": "mens-college-basketball",
        "label": "NCAA Basketball", "emoji": "🏀",
        "channels_fr": ["ESPN"],
        "supports_ap_ranked": True,
    },
    # Soccer
    "ligue-1": {
        "sport": "soccer", "league": "fra.1",
        "label": "Ligue 1", "emoji": "⚽",
        "channels_fr": ["DAZN", "beIN Sports"],
    },
    "ligue-2": {
        "sport": "soccer", "league": "fra.2",
        "label": "Ligue 2", "emoji": "⚽",
        "channels_fr": ["beIN Sports"],
    },
    "champions-league": {
        "sport": "soccer", "league": "uefa.champions",
        "label": "Ligue des Champions", "emoji": "⚽",
        "channels_fr": ["Canal+"],
    },
    "europa-league": {
        "sport": "soccer", "league": "uefa.europa",
        "label": "Europa League", "emoji": "⚽",
        "channels_fr": ["Canal+"],
    },
    "conference-league": {
        "sport": "soccer", "league": "uefa.europa.conf",
        "label": "Conference League", "emoji": "⚽",
        "channels_fr": ["Canal+"],
    },
    "coupe-de-france": {
        "sport": "soccer", "league": "fra.coupe_de_france",
        "label": "Coupe de France", "emoji": "⚽",
        "channels_fr": ["beIN Sports", "France 3"],
    },
    "nations-league": {
        "sport": "soccer", "league": "uefa.nations",
        "label": "Ligue des Nations UEFA", "emoji": "⚽",
        "channels_fr": ["TF1", "M6", "France 2"],
    },
    "world-cup-qual": {
        "sport": "soccer", "league": "fifa.worldq.uefa",
        "label": "Qualif. Coupe du Monde", "emoji": "⚽",
        "channels_fr": ["TF1", "M6"],
    },
    "euro": {
        "sport": "soccer", "league": "uefa.euro",
        "label": "Euro", "emoji": "⚽",
        "channels_fr": ["TF1", "M6", "beIN Sports"],
    },
    "equipe-de-france-foot": {
        "sport": "soccer", "league": "fifa.friendly",
        "label": "Matchs amicaux", "emoji": "⚽",
        "channels_fr": ["TF1", "M6", "France 2"],
    },
    "world-cup": {
        "sport": "soccer", "league": "fifa.world",
        "label": "Coupe du Monde", "emoji": "⚽",
        "channels_fr": ["TF1", "M6", "beIN Sports"],
    },
    # Olympics
    "jo-basket-m": {
        "sport": "basketball", "league": "mens-olympics-basketball",
        "label": "JO Basketball (H)", "emoji": "🏅",
        "channels_fr": ["France 2", "France 3", "Eurosport"],
        "season_window": (7, 15, 8, 15),
    },
    "jo-basket-w": {
        "sport": "basketball", "league": "womens-olympics-basketball",
        "label": "JO Basketball (F)", "emoji": "🏅",
        "channels_fr": ["France 2", "France 3", "Eurosport"],
        "season_window": (7, 15, 8, 15),
    },
    "jo-foot": {
        "sport": "soccer", "league": "fifa.olympics",
        "label": "JO Football (H)", "emoji": "🏅",
        "channels_fr": ["France 2", "France 3", "Eurosport"],
        "season_window": (7, 15, 8, 15),
    },
    # Rugby
    "top-14": {
        "sport": "rugby", "league": "270559",
        "label": "Top 14", "emoji": "🏉",
        "channels_fr": ["Canal+"],
    },
    "champions-cup-rugby": {
        "sport": "rugby", "league": "271937",
        "label": "Champions Cup", "emoji": "🏉",
        "channels_fr": ["beIN Sports", "France 2"],
    },
    "challenge-cup-rugby": {
        "sport": "rugby", "league": "272073",
        "label": "Challenge Cup", "emoji": "🏉",
        "channels_fr": ["beIN Sports"],
    },
    "six-nations": {
        "sport": "rugby", "league": "180659",
        "label": "Six Nations", "emoji": "🏉",
        "channels_fr": ["France 2"],
    },
    "rugby-world-cup": {
        "sport": "rugby", "league": "164205",
        "label": "Coupe du Monde Rugby", "emoji": "🏉",
        "channels_fr": ["TF1", "France 2"],
    },
    # Tennis Grand Slams
    "australian-open": {
        "sport": "tennis", "league": "560",
        "label": "Open d'Australie", "emoji": "🎾",
        "channels_fr": ["Eurosport"],
        "season_window": (1, 1, 2, 1),  # month_start, day_start, month_end, day_end
    },
    "roland-garros": {
        "sport": "tennis", "league": "520",
        "label": "Roland-Garros", "emoji": "🎾",
        "channels_fr": ["France TV", "Eurosport"],
        "season_window": (5, 20, 6, 12),
    },
    "wimbledon": {
        "sport": "tennis", "league": "540",
        "label": "Wimbledon", "emoji": "🎾",
        "channels_fr": ["beIN Sports"],
        "season_window": (6, 25, 7, 16),
    },
    "us-open": {
        "sport": "tennis", "league": "580",
        "label": "US Open", "emoji": "🎾",
        "channels_fr": ["Eurosport"],
        "season_window": (8, 20, 9, 12),
    },
}

# Cycling (non-ESPN, separate fetcher)
CYCLING_LEAGUES = {
    "cycling-road": {
        "label": "Cyclisme Route", "emoji": "🚴",
        "channels_fr": ["Eurosport", "France TV"],
        "uci_category": "road",
    },
    "cycling-mtb-dh": {
        "label": "VTT Descente", "emoji": "🚵",
        "channels_fr": ["Red Bull TV", "Eurosport", "L'Équipe"],
        "uci_category": "mtb-dh",
    },
    "cycling-mtb-enduro": {
        "label": "VTT Enduro", "emoji": "🚵",
        "channels_fr": ["Red Bull TV", "Eurosport"],
        "uci_category": "mtb-enduro",
    },
}

ALL_LEAGUES = {**ESPN_LEAGUES, **CYCLING_LEAGUES}

# ── Highlight detection keywords ────────────────────────────
HIGHLIGHT_PHASES = [
    "final", "finale", "semifinal", "semi-final", "demi-finale",
    "quarterfinal", "quarter-final", "quart de finale",
    "playoff", "play-off", "wild card", "wildcard",
    "championship", "super bowl", "nba finals",
]

# ── Load user favorites ────────────────────────────────────
def load_favorites():
    path = FAVORITES_PATH if FAVORITES_PATH.exists() else FAVORITES_EXAMPLE_PATH
    if not path.exists():
        logger.error("No favorites.json found. Copy favorites.example.json → favorites.json")
        return {"favorites": [], "channels": []}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# ── Day names ───────────────────────────────────────────────
DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
DAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS_FR = ["", "janvier", "février", "mars", "avril", "mai", "juin",
             "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
