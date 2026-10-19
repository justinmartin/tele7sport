"""
Acronymes officiels des équipes. ESPN en invente parfois (Bayern « MUN », trois clubs du
Top 14 en « STA », Marseille « OLM » ou « MAR » selon la compétition) : on impose ceux
qu'utilisent les ligues et les diffuseurs. Clé = (sport ESPN, nom ESPN).
"""

_SOCCER = {
    # Ligue 1 / Ligue 2
    "Paris Saint-Germain": "PSG", "Marseille": "OM", "Lyon": "OL", "Lille": "LOSC", "AS Monaco": "ASM",
    "Nice": "OGCN", "Lens": "RCL", "Stade Rennais": "SRFC", "Strasbourg": "RCSA", "Toulouse": "TFC",
    "Nantes": "FCN", "Brest": "SB29", "AJ Auxerre": "AJA", "Angers": "SCO", "Le Havre AC": "HAC",
    "Lorient": "FCL", "Metz": "FCM", "Paris FC": "PFC", "Troyes": "ESTAC", "Montpellier": "MHSC",
    "Saint-Étienne": "ASSE", "Stade de Reims": "SDR", "Le Mans": "LMFC", "Guingamp": "EAG",
    "AS Nancy Lorraine": "ASNL", "Clermont Foot": "CF63", "Dijon FCO": "DFCO", "Red Star FC 93": "RED",
    "Stade Laval": "SL53", "Sochaux": "FCSM", "Grenoble": "GF38", "Rodez Aveyron": "RAF", "Pau": "PAU",
    "Annecy": "FCA", "Dunkerque": "USLD", "Boulogne": "USBCO", "OL Lyonnes": "OL", "FC Fleury 91": "F91",
    # Premier League
    "Manchester City": "MCI", "Manchester United": "MUN", "Arsenal": "ARS", "Chelsea": "CHE", "Liverpool": "LIV",
    "Tottenham Hotspur": "TOT", "Newcastle United": "NEW", "Aston Villa": "AVL", "AFC Bournemouth": "BOU",
    "Brighton & Hove Albion": "BHA", "Nottingham Forest": "NFO", "Crystal Palace": "CRY",
    # Liga
    "Barcelona": "BAR", "Real Madrid": "RMA", "Atlético Madrid": "ATM", "Athletic Club": "ATH",
    "Real Sociedad": "RSO", "Real Betis": "BET", "Villarreal": "VIL", "Sevilla": "SEV", "Valencia": "VAL",
    # Serie A
    "Internazionale": "INT", "AC Milan": "MIL", "Juventus": "JUV", "Napoli": "NAP", "AS Roma": "ROM",
    "Lazio": "LAZ", "Atalanta": "ATA", "Fiorentina": "FIO", "Parma": "PAR", "Monza": "MON",
    # Bundesliga
    "Bayern Munich": "BAY", "Borussia Dortmund": "BVB", "Bayer Leverkusen": "B04", "RB Leipzig": "RBL",
    "Eintracht Frankfurt": "SGE", "VfB Stuttgart": "VFB", "Borussia Mönchengladbach": "BMG",
    "FC Cologne": "KOE", "1. FC Union Berlin": "FCU", "Werder Bremen": "SVW",
    # Europe
    "Ajax Amsterdam": "AJA", "PSV Eindhoven": "PSV", "Feyenoord Rotterdam": "FEY", "Benfica": "SLB",
    "FC Porto": "FCP", "Sporting CP": "SCP", "Celtic": "CEL", "Celta Vigo": "CLV", "Galatasaray": "GS", "Fenerbahce": "FB",
    "Club Brugge": "CLU", "Shakhtar Donetsk": "SHK", "RB Salzburg": "SAL", "Olympiacos": "OLY",
}

_RUGBY = {
    # Top 14 (codes de la LNR)
    "Stade Toulousain": "ST", "Stade Francais Paris": "SFP", "La Rochelle": "SR", "Bordeaux Begles": "UBB",
    "Toulon": "RCT", "Racing 92": "R92", "Clermont Auvergne": "ASM", "Castres Olympique": "CO",
    "Lyon": "LOU", "Perpignan": "USAP", "Bayonne": "AB", "Pau": "SP", "Montpellier Herault": "MHR",
    "Vannes": "RCV", "Montpellier": "MHR",
    # Coupes d'Europe
    "Leinster": "LEI", "Leicester Tigers": "LEIC", "Munster": "MUN", "Ulster": "ULS",
}

OFFICIAL = {"soccer": _SOCCER, "rugby": _RUGBY}


def official_abbr(sport: str, name: str, fallback: str) -> str:
    return OFFICIAL.get(sport, {}).get(name) or fallback
