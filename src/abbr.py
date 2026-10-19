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
    # Le reste de l'Europe (codes UEFA / des ligues)
    "AEK Athens": "AEK", "AGF": "AGF", "AZ Alkmaar": "AZ", "ADO Den Haag": "ADO", "Anderlecht": "AND",
    "Ararat-Armenia": "ARA", "Besiktas": "BJK", "Bodo/Glimt": "BOD", "Borac Banja Luka": "BOR", "Braga": "SCB",
    "CSKA Sofia": "CSK", "CSU Craiova": "UCV", "Dinamo Zagreb": "DZG", "Egnatia": "EGN", "F.C. København": "FCK",
    "FC Groningen": "GRO", "FC Lugano": "LUG", "FC Midtjylland": "FCM", "FC Nordsjælland": "FCN", "FC Thun": "THU",
    "FC Twente": "TWE", "FC Utrecht": "UTR", "Ferencvaros": "FTC", "Fortuna Sittard": "FOR", "Go Ahead Eagles": "GAE",
    "Hajduk Split": "HAJ", "Hapoel Be'er": "HBS", "Heart of Midlothian": "HEA", "Heerenveen": "HEE", "Excelsior": "EXC",
    "Iberia 1999": "IBE", "Inter D'Escaldes": "INT", "Jablonec": "JAB", "Jagiellonia Bialystok": "JAG", "KAA Gent": "GNT",
    "Kairat Almaty": "KAI", "Kauno Zalgiris": "KZA", "KuPS Kuopio": "KUP", "LASK Linz": "LAS", "Lech Poznan": "LPO",
    "Levski Sofia": "LEV", "Lillestrom": "LSK", "Lincoln Red Imps": "LIN", "Mjällby AIF": "MJA", "NEC Nijmegen": "NEC",
    "NK Celje": "CLJ", "OFI Crete": "OFI", "Omonia Nicosia": "OMO", "PEC Zwolle": "PEC", "Pafos": "PAF",
    "Panathinaikos": "PAO", "Red Star Belgrade": "CZV", "Riga FC": "RIG", "SC Cambuur": "CAM", "SK Brann": "BRA",
    "SK Sturm Graz": "STU", "Sabah FK": "SAB", "Sint-Truidense": "STV", "Slavia Prague": "SLA", "Slovan Bratislava": "SBR",
    "Sparta Prague": "SPA", "Sparta Rotterdam": "SPR", "Telstar": "TEL", "Torreense": "TOR", "Trabzonspor": "TS",
    "Union St.-Gilloise": "USG", "Viking FK": "VIK", "Viktoria Plzen": "PLZ", "Willem II": "WIL",
    # Angleterre, Espagne, Italie, Allemagne, Portugal
    "Brentford": "BRE", "Coventry City": "COV", "Everton": "EVE", "Fulham": "FUL", "Hull City": "HUL",
    "Ipswich Town": "IPS", "Leeds United": "LEE", "Sunderland": "SUN",
    "Alavés": "ALA", "Deportivo": "DEP", "Elche": "ELC", "Espanyol": "ESP", "Getafe": "GET", "Levante": "LEV",
    "Málaga": "MAL", "Osasuna": "OSA", "Racing Santander": "RAC", "Rayo Vallecano": "RAY",
    "Bologna": "BOL", "Cagliari": "CAG", "Como": "COM", "Frosinone": "FRO", "Genoa": "GEN", "Lecce": "LEC",
    "Sassuolo": "SAS", "Torino": "TOR", "Udinese": "UDI", "Venezia": "VEN",
    "FC Augsburg": "FCA", "Hamburg SV": "HSV", "Mainz": "M05", "SC Freiburg": "SCF", "SC Paderborn 07": "SCP",
    "SV Elversberg": "SVE", "Schalke 04": "S04", "TSG Hoffenheim": "TSG",
    "Académico de Viseu": "ACV", "Alverca": "ALV", "Arouca": "ARO", "C.D. Nacional": "NAC", "Casa Pia": "CPI",
    "Estoril": "EST", "Estrela": "EAM", "FC Famalicao": "FAM", "Gil Vicente": "GIL", "Maritimo": "MAR",
    "Moreirense": "MOR", "Rio Ave": "RAV", "Santa Clara": "STC", "Vitória de Guimaraes": "VSC",
    # MLS
    "Atlanta United FC": "ATL", "Austin FC": "ATX", "CF Montréal": "MTL", "Charlotte FC": "CLT", "Chicago Fire FC": "CHI",
    "Colorado Rapids": "COL", "Columbus Crew": "CLB", "D.C. United": "DC", "FC Cincinnati": "CIN", "FC Dallas": "DAL",
    "Houston Dynamo FC": "HOU", "Inter Miami CF": "MIA", "LA Galaxy": "LA", "LAFC": "LAFC", "Minnesota United FC": "MIN",
    "Nashville SC": "NSH", "New England Revolution": "NE", "New York City FC": "NYC", "Orlando City SC": "ORL",
    "Philadelphia Union": "PHI", "Portland Timbers": "POR", "Real Salt Lake": "RSL", "Red Bull New York": "RBNY",
    "San Diego FC": "SD", "San Jose Earthquakes": "SJ", "Seattle Sounders FC": "SEA", "Sporting Kansas City": "SKC",
    "St. Louis CITY SC": "STL", "Toronto FC": "TOR", "Vancouver Whitecaps": "VAN",
    # Amérique du Sud
    "Always Ready": "ARE", "Atlético Junior": "JUN", "Barcelona SC": "BSC", "Boca Juniors": "BOC", "Bolívar": "BOL",
    "Cerro Porteño": "CCP", "Coquimbo Unido": "COQ", "Corinthians": "COR", "Cruzeiro": "CRU", "Cusco FC": "CUS",
    "Deportes Tolima": "TOL", "Deportivo La Guaira": "DLG", "Estudiantes de La Plata": "EST", "Flamengo": "FLA",
    "Fluminense": "FLU", "Independiente Medellín": "DIM", "Independiente Rivadavia": "IRI", "Independiente Santa Fe": "SFE",
    "Independiente del Valle": "IDV", "Lanús": "LAN", "Libertad": "LIB", "Liga de Quito": "LDU", "Mirassol": "MIR",
    "Nacional": "NAC", "Palmeiras": "PAL", "Peñarol": "PEN", "Platense": "PLA", "Rosario Central": "RCE",
    "Sporting Cristal": "SCR", "UCV FC": "UCV", "Universidad Católica": "UCA", "Universitario": "UNI",
    # Féminines
    "Saint-Malo": "SMA",
}

_RUGBY = {
    # Top 14 (codes de la LNR)
    "Stade Toulousain": "ST", "Stade Francais Paris": "SFP", "La Rochelle": "SR", "Bordeaux Begles": "UBB",
    "Toulon": "RCT", "Racing 92": "R92", "Clermont Auvergne": "ASM", "Castres Olympique": "CO",
    "Lyon": "LOU", "Perpignan": "USAP", "Bayonne": "AB", "Pau": "SP", "Montpellier Herault": "MHR",
    "Vannes": "RCV", "Montpellier": "MHR",
    # Coupes d'Europe
    "Leinster": "LEI", "Leicester Tigers": "LEIC", "Munster": "MUN", "Ulster": "ULS",
    # Premiership, URC, Challenge Cup, tests
    "Bath Rugby": "BAT", "Bristol Rugby": "BRI", "Exeter Chiefs": "EXE", "Gloucester Rugby": "GLO", "Harlequins": "HAR",
    "Newcastle Falcons": "NEW", "Northampton Saints": "NOR", "Sale Sharks": "SAL", "Saracens": "SAR",
    "Benetton Treviso": "BEN", "Bulls": "BUL", "Cardiff Blues": "CAR", "Connacht": "CON", "Dragons": "DRA",
    "Edinburgh": "EDI", "Glasgow Warriors": "GLA", "Lions": "LIO", "Ospreys": "OSP", "Scarlets": "SCA", "Sharks": "SHA",
    "Stormers": "STO", "Zebre": "ZEB", "Black Lion": "BLI", "Cheetahs": "CHE",
    "Australia": "AUS", "Fiji": "FIJ", "Japan": "JPN", "New Zealand": "NZL", "France": "FRA", "England": "ENG",
    "Ireland": "IRL", "Scotland": "SCO", "Wales": "WAL", "Italy": "ITA", "South Africa": "RSA", "Argentina": "ARG",
}

# Sports US : ESPN abrège parfois (GS, NY…) là où la ligue utilise trois lettres.
_US = {
    "basketball": {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"},
    "hockey": {"LA": "LAK", "NJ": "NJD", "SJ": "SJS", "TB": "TBL"},
    "football": {"WSH": "WAS"},
}

OFFICIAL = {"soccer": _SOCCER, "rugby": _RUGBY}


def official_abbr(sport: str, name: str, fallback: str) -> str:
    if sport in _US:
        return _US[sport].get(fallback, fallback)
    return OFFICIAL.get(sport, {}).get(name) or fallback
