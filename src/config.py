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
        "sport": "basketball", "league": "fra.1", "source": "thesportsdb", "tsdb_id": 4423,
        "logo": "https://assets.altrstat.xyz/images/Basketball/Competition/317/logoBlack/md.png",
        "label": "Betclic Élite", "emoji": "🏀",
        "channels_fr": ["Canal+ Sport", "L'Équipe"],
    },
    "euroleague": {
        "sport": "basketball", "league": "euroleague", "source": "euroleague",
        "logo": "https://r2.thesportsdb.com/images/media/league/badge/7xjtuy1554397263.png",
        "label": "EuroLeague", "emoji": "🏀",
        "channels_fr": [],
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
        "group": "foot-intl",
        "label": "Ligue des Nations UEFA", "emoji": "⚽",
        "channels_fr": ["TF1", "M6", "France 2"],
    },
    "world-cup-qual": {
        "sport": "soccer", "league": "fifa.worldq.uefa",
        "group": "foot-intl",
        "label": "Qualif. Coupe du Monde", "emoji": "⚽",
        "channels_fr": ["TF1", "M6"],
    },
    "euro": {
        "sport": "soccer", "league": "uefa.euro",
        "group": "foot-intl",
        "label": "Euro", "emoji": "⚽",
        "channels_fr": ["TF1", "M6", "beIN Sports"],
    },
    "equipe-de-france-foot": {
        "sport": "soccer", "league": "fifa.friendly",
        "group": "foot-intl",
        "label": "Matchs amicaux", "emoji": "⚽",
        "channels_fr": ["TF1", "M6", "France 2"],
    },
    "world-cup": {
        "sport": "soccer", "league": "fifa.world",
        "group": "foot-intl",
        "label": "Coupe du Monde", "emoji": "⚽",
        "channels_fr": ["TF1", "M6", "beIN Sports"],
    },
    # Olympics
    "jo-basket-m": {
        "sport": "basketball", "league": "mens-olympics-basketball",
        "label": "Basket masculin", "emoji": "🏅", "group": "jo", "note": "Prochains Jeux : Los Angeles, 14-30 juillet 2028",
        "channels_fr": ["France 2", "France 3", "Eurosport"],
        "season_window": (7, 15, 8, 15),
    },
    "jo-basket-w": {
        "sport": "basketball", "league": "womens-olympics-basketball",
        "label": "Basket féminin", "emoji": "🏅", "group": "jo", "note": "Prochains Jeux : Los Angeles, 14-30 juillet 2028",
        "channels_fr": ["France 2", "France 3", "Eurosport"],
        "season_window": (7, 15, 8, 15),
    },
    "jo-foot": {
        "sport": "soccer", "league": "fifa.olympics",
        "label": "Football masculin", "emoji": "🏅", "group": "jo", "note": "Prochains Jeux : Los Angeles, 14-30 juillet 2028",
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
        "group": "rugby-intl",
        "label": "Six Nations", "emoji": "🏉",
        "channels_fr": ["France 2"],
    },
    "rugby-world-cup": {
        "sport": "rugby", "league": "164205",
        "group": "rugby-intl",
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
    # ── Ajouts 10/2026 : grands championnats, coupes, international, féminines, rugby ──
    "premier-league": {
        "sport": "soccer", "league": "eng.1",
        "label": "Premier League", "emoji": "⚽",
        "channels_fr": ["Canal+"],
    },
    "laliga": {
        "sport": "soccer", "league": "esp.1",
        "label": "LaLiga", "emoji": "⚽",
        "channels_fr": ["beIN Sports"],
    },
    "serie-a": {
        "sport": "soccer", "league": "ita.1",
        "label": "Serie A", "emoji": "⚽",
        "channels_fr": ["beIN Sports"],
    },
    "bundesliga": {
        "sport": "soccer", "league": "ger.1",
        "label": "Bundesliga", "emoji": "⚽",
        "channels_fr": ["beIN Sports"],
    },
    "liga-portugal": {
        "sport": "soccer", "league": "por.1",
        "label": "Liga Portugal", "emoji": "⚽",
        "channels_fr": [],
    },
    "eredivisie": {
        "sport": "soccer", "league": "ned.1",
        "label": "Eredivisie", "emoji": "⚽",
        "channels_fr": [],
    },
    "mls": {
        "sport": "soccer", "league": "usa.1",
        "label": "MLS", "emoji": "⚽",
        "channels_fr": [],
    },
    "fa-cup": {
        "sport": "soccer", "league": "eng.fa",
        "label": "FA Cup", "emoji": "🏆",
        "channels_fr": [],
    },
    "league-cup": {
        "sport": "soccer", "league": "eng.league_cup",
        "label": "Carabao Cup", "emoji": "🏆",
        "channels_fr": [],
    },
    "copa-del-rey": {
        "sport": "soccer", "league": "esp.copa_del_rey",
        "label": "Copa del Rey", "emoji": "🏆",
        "channels_fr": [],
    },
    "coppa-italia": {
        "sport": "soccer", "league": "ita.coppa_italia",
        "label": "Coppa Italia", "emoji": "🏆",
        "channels_fr": [],
    },
    "dfb-pokal": {
        "sport": "soccer", "league": "ger.dfb_pokal",
        "label": "Coupe d'Allemagne", "emoji": "🏆",
        "channels_fr": [],
    },
    "trophee-des-champions": {
        "sport": "soccer", "league": "fra.super_cup",
        "label": "Trophée des Champions", "emoji": "🏆",
        "channels_fr": [],
    },
    "supercoupe-uefa": {
        "sport": "soccer", "league": "uefa.super_cup",
        "label": "Supercoupe de l'UEFA", "emoji": "🏆",
        "channels_fr": [],
    },
    "coupe-du-monde-clubs": {
        "sport": "soccer", "league": "fifa.cwc",
        "label": "Coupe du monde des clubs", "emoji": "🌍",
        "channels_fr": [],
    },
    "euro-qual": {
        "sport": "soccer", "league": "uefa.euroq",
        "group": "foot-intl",
        "label": "Qualif. Euro", "emoji": "🇪🇺",
        "channels_fr": ["TF1"],
    },
    "copa-america": {
        "sport": "soccer", "league": "conmebol.america",
        "group": "foot-intl",
        "label": "Copa América", "emoji": "🌎",
        "channels_fr": [],
    },
    "can": {
        "sport": "soccer", "league": "caf.nations",
        "group": "foot-intl",
        "label": "Coupe d'Afrique des Nations", "emoji": "🌍",
        "channels_fr": ["beIN Sports"],
    },
    "libertadores": {
        "sport": "soccer", "league": "conmebol.libertadores",
        "label": "Copa Libertadores", "emoji": "🌎",
        "channels_fr": [],
    },
    "coupe-du-monde-f": {
        "sport": "soccer", "league": "fifa.wwc",
        "group": "foot-intl",
        "label": "Coupe du Monde féminine", "emoji": "🌍",
        "channels_fr": [],
    },
    "euro-f": {
        "sport": "soccer", "league": "uefa.weuro",
        "group": "foot-intl",
        "label": "Euro féminin", "emoji": "🇪🇺",
        "channels_fr": [],
    },
    "ligue-des-champions-f": {
        "sport": "soccer", "league": "uefa.wchampions",
        "label": "Ligue des Champions féminine", "emoji": "⭐",
        "channels_fr": [],
    },
    "premiere-ligue-f": {
        "sport": "soccer", "league": "fra.w.1",
        "label": "Première Ligue (D1 féminine)", "emoji": "⚽",
        "channels_fr": [],
    },
    "rugby-championship": {
        "sport": "rugby", "league": "244293",
        "group": "rugby-intl",
        "label": "Rugby Championship", "emoji": "🏉",
        "channels_fr": [],
    },
    "premiership-rugby": {
        "sport": "rugby", "league": "267979",
        "label": "Premiership", "emoji": "🏉",
        "channels_fr": [],
    },
    "urc": {
        "sport": "rugby", "league": "270557",
        "label": "United Rugby Championship", "emoji": "🏉",
        "channels_fr": [],
    },
    "tests-rugby": {
        "sport": "rugby", "league": "289234",
        "group": "rugby-intl",
        "label": "Tests internationaux (rugby)", "emoji": "🏉",
        "channels_fr": [],
    },
    "nhl": {
        "sport": "hockey", "league": "nhl",
        "label": "NHL", "emoji": "🏒",
        "channels_fr": [],
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
    # Sports mécaniques : calendriers Wikipédia (src/fetchers/wiki_calendars.py)
    "mxgp": {
        "label": "Motocross MXGP", "emoji": "🏍️",
        "channels_fr": [],
        "uci_category": "mxgp", "sport": "moto",
    },
    "supercross": {
        "label": "Supercross US", "emoji": "🏍️",
        "channels_fr": [],
        "uci_category": "supercross", "sport": "moto",
    },
    "dakar": {
        "label": "Rallye Dakar", "emoji": "🏜️",
        "channels_fr": [],
        "uci_category": "dakar", "sport": "moto",
    },
    # Sports d'hiver : pages de saison Wikipédia « 2026–27 … World Cup »
    "ski-alpin": {
        "label": "Ski alpin", "emoji": "⛷️",
        "channels_fr": ["Eurosport"],
        "uci_category": "ski-alpin", "sport": "hiver",
    },
    "biathlon": {
        "label": "Biathlon", "emoji": "🎯",
        "channels_fr": ["L'Équipe"],
        "uci_category": "biathlon", "sport": "hiver",
    },
    "ski-fond": {
        "label": "Ski de fond", "emoji": "🎿",
        "channels_fr": ["Eurosport"],
        "uci_category": "ski-fond", "sport": "hiver",
    },
    "saut-ski": {
        "label": "Saut à ski", "emoji": "🎿",
        "channels_fr": ["Eurosport"],
        "uci_category": "saut-ski", "sport": "hiver",
    },
    "patinage": {
        "label": "Patinage artistique (Grand Prix)", "emoji": "⛸️",
        "channels_fr": [],
        "uci_category": "patinage", "sport": "hiver",
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


# Noms ESPN qui ne contiennent pas le nom usuel de l'équipe.
TEAM_ALIASES = {
    "toulouse": ["Stade Toulousain"],
    # Sélections nationales : ESPN les nomme en anglais
    "écosse": ["Scotland"],
    "angleterre": ["England"],
    "irlande": ["Ireland"],
    "pays de galles": ["Wales"],
    "italie": ["Italy"],
    "espagne": ["Spain"],
    "allemagne": ["Germany"],
    "belgique": ["Belgium"],
    "pays-bas": ["Netherlands"],
    "argentine": ["Argentina"],
    "brésil": ["Brazil"],
    "nouvelle-zélande": ["New Zealand"],
    "afrique du sud": ["South Africa"],
    "australie": ["Australia"],
    "japon": ["Japan"],
    "états-unis": ["United States"],
    "suisse": ["Switzerland"],
    "croatie": ["Croatia"],
    "maroc": ["Morocco"],
    "sénégal": ["Senegal"],
    "géorgie": ["Georgia"],
    "fidji": ["Fiji"],
    "danemark": ["Denmark"],
    "suède": ["Sweden"],
    "norvège": ["Norway"],
    "autriche": ["Austria"],
    "pologne": ["Poland"],
    "mexique": ["Mexico"],
    "colombie": ["Colombia"],
    "uruguay": ["Uruguay"],
    "algérie": ["Algeria"],
    "tunisie": ["Tunisia"],
    "côte d'ivoire": ["Ivory Coast"],
    "cameroun": ["Cameroon"],
    "turquie": ["Turkey"],
    "grèce": ["Greece"],
    "tchéquie": ["Czechia"],
    "roumanie": ["Romania"],
    "samoa": ["Samoa"],
    "tonga": ["Tonga"],
    "canada": ["Canada"],
}
