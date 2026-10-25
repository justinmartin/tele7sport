"""
Calendriers de sports mécaniques lus sur Wikipédia (ESPN ne les couvre pas) :
- MXGP (championnat du monde de motocross) : « <année> FIM Motocross World Championship » ;
- Supercross US : « <année> AMA Supercross Championship » ;
- Dakar : « Rallye Dakar <année> » (fr), une ligne par étape.
Les pages de la saison suivante apparaissent sur Wikipédia quelques semaines ou mois avant :
elles sont prises automatiquement dès qu'elles existent.
"""
import logging
import re
import time
from datetime import date, datetime
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("tele7sport")

HEADERS = {"User-Agent": "tele7sport (github.com/justinmartin/tele7sport)"}
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                      "september", "october", "november", "december"], 1)}
MONTHS.update({m: i for i, m in enumerate(["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                                           "septembre", "octobre", "novembre", "décembre"], 1)})
_cache: Dict[str, Optional[BeautifulSoup]] = {}


_last_call = [0.0]
MIN_INTERVAL = 1.0  # Wikipédia limite le débit (429 en rafale) : une requête par seconde


def wiki_api(lang: str, params: dict) -> dict:
    """Appel poli à l'API Wikipédia : espacé d'une seconde, réessaie après un 429."""
    for attempt in range(5):
        wait = MIN_INTERVAL - (time.time() - _last_call[0])
        if wait > 0:
            time.sleep(wait)
        try:
            resp = requests.get(f"https://{lang}.wikipedia.org/w/api.php", headers=HEADERS, timeout=15, params=params)
        except Exception as e:
            logger.debug("Wikipédia indisponible : %s", e)
            return {}
        finally:
            _last_call[0] = time.time()
        if resp.status_code == 429:
            time.sleep(float(resp.headers.get("Retry-After") or 2 * 2 ** attempt))
            continue
        return resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    logger.warning("Wikipédia : trop de requêtes, abandon (%s)", params.get("page"))
    return {}


def _page(lang: str, title: str) -> Optional[BeautifulSoup]:
    """Page Wikipédia parsée (None si elle n'existe pas encore). Mise en cache."""
    key = f"{lang}/{title}"
    if key not in _cache:
        d = wiki_api(lang, {"action": "parse", "page": title, "prop": "text", "format": "json", "formatversion": 2})
        _cache[key] = BeautifulSoup(d["parse"]["text"], "html.parser") if "parse" in d else None
    return _cache[key]


def _date(text: str, year: int) -> Optional[date]:
    """« 28 February », « January 10 », « 3 Janvier 2026 »."""
    words = re.findall(r"[A-Za-zÀ-ÿ]+|\d+", text)
    month = next((MONTHS[w.lower()] for w in words if w.lower() in MONTHS), None)
    nums = [int(w) for w in words if w.isdigit()]
    day = next((n for n in nums if n <= 31), None)
    y = next((n for n in nums if n > 1900), year)
    try:
        return date(y, month, day) if month and day else None
    except ValueError:
        return None


def _clean(text: str) -> str:
    return re.sub(r"\s*\((?:I|II|III|IV|V|\d+)\)|\s*\[.*?\]", "", text).strip()


def mxgp(year: int) -> List[dict]:
    soup = _page("en", f"{year}_FIM_Motocross_World_Championship")
    table = next((t for t in (soup.find_all("table", class_="wikitable") if soup else [])
                  if "Grand Prix" in t.find("tr").get_text()), None)
    out = []
    for row in (table.find_all("tr")[1:] if table else []):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
        if len(cells) < 4 or not cells[0].isdigit():
            continue
        d = _date(cells[1], year)
        if d:
            img = row.find("img")
            country = img.get("alt", "") if img else ""
            out.append({"name": cells[2], "start": d, "end": d, "location": ", ".join(x for x in (cells[3], country) if x),
                        "details": f"Manche {cells[0]}"})
    return out


def supercross(year: int) -> List[dict]:
    soup = _page("en", f"{year}_AMA_Supercross_Championship")
    table = next((t for t in (soup.find_all("table", class_="wikitable") if soup else [])
                  if "Stadium" in t.find("tr").get_text()), None)
    out = []
    for row in (table.find_all("tr")[1:] if table else []):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
        if len(cells) < 4:
            continue
        d = _date(cells[1], year)
        if d:
            winner = _clean(cells[5]) if len(cells) > 5 and cells[5] else ""
            details = f"Manche {cells[0]}" + (f" · vainqueur 450 : {winner}" if winner and d < date.today() else "")
            out.append({"name": f"Supercross de {cells[2]}", "start": d, "end": d,
                        "location": f"{cells[3]}, {cells[2]}", "details": details})
    return out


def dakar(year: int) -> List[dict]:
    """Une ligne par étape : « Étape 3 · Hail → Riyad »."""
    soup = _page("fr", f"Rallye_Dakar_{year}")
    table = next((t for t in (soup.find_all("table", class_="wikitable") if soup else [])
                  if "Départ" in t.find("tr").get_text()), None)
    out = []
    for row in (table.find_all("tr")[1:] if table else []):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
        i = next((k for k, c in enumerate(cells) if re.search(r"\d{1,2}\s+\w+\s+\d{4}", c)), None)
        if i is None or len(cells) < i + 3:
            continue
        d = _date(cells[i], year)
        if d:
            stage = cells[0] if cells[0].lower().startswith(("prologue", "repos")) else f"Étape {cells[0]}"
            start_city, end_city = cells[i + 1], cells[i + 2]
            out.append({"name": f"Dakar {year} · {stage}", "start": d, "end": d,
                        "location": start_city if start_city == end_city else f"{start_city} → {end_city}", "details": ""})
    return out


# ---------------------------------------------------------------- sports d'hiver
# Pages de saison « 2026–27 … » (octobre → mars). Tableaux avec cellules fusionnées
# (rowspan) : on les déplie en grille avant de lire les colonnes par leur en-tête.

def _grid(table) -> List[List[str]]:
    grid, pending = [], {}  # pending[col] = [texte, lignes restantes]
    for tr in table.find_all("tr"):
        row, col = [], 0
        cells = list(tr.find_all(["th", "td"]))
        while cells or col in pending:
            if col in pending:
                text, left = pending[col]
                row.append(text)
                pending[col][1] -= 1
                if pending[col][1] == 0:
                    del pending[col]
                col += 1
                continue
            cell = cells.pop(0)
            text = cell.get_text(" ", strip=True)
            span = int(cell.get("colspan", 1) or 1)
            rows = int(cell.get("rowspan", 1) or 1)
            for _ in range(span):
                row.append(text)
                if rows > 1:
                    pending[col] = [text, rows - 1]
                col += 1
        grid.append(row)
    return grid


def _season_page(start_year: int, name: str) -> Optional[BeautifulSoup]:
    return _page("en", f"{start_year}–{str(start_year + 1)[-2:]}_{name}")


def _category(table) -> str:
    """« hommes », « dames » ou « par équipes », d'après les titres de section qui précèdent."""
    for h in table.find_all_previous(["h2", "h3", "h4"])[:3]:
        low = h.get_text(" ", strip=True).lower()
        if "women" in low or "ladies" in low:
            return "dames"
        if re.search(r"\bmen", low):
            return "hommes"
        if "team" in low:
            return "par équipes"
    return "hommes"


def _cols(header: List[str], *names) -> List[Optional[int]]:
    low = [h.lower() for h in header]
    return [next((i for i, h in enumerate(low) if h.startswith(n)), None) for n in names]


def _season_date(text: str, start_year: int) -> Optional[date]:
    """Dans une saison d'hiver, septembre→décembre = première année, janvier→avril = la suivante."""
    d = _date(text, start_year)
    if d and not re.search(r"\d{4}", text) and d.month < 7:
        d = d.replace(year=start_year + 1)
    return d


def _range(text: str, start_year: int):
    """« 24–29 November », « October 30 – November 1 », « 25 October 2026 »."""
    parts = [p.strip() for p in re.split(r"\s[–-]\s|–|-", text) if p.strip()]
    if not parts:
        return None, None
    last = parts[-1]
    if not re.search(r"[A-Za-zÀ-ÿ]", last):  # « October 23–25 » : le mois est sur la première partie
        last = f"{re.sub(r'[0-9 ]', '', parts[0])} {last}"
    end = _season_date(last, start_year)
    if not end:
        return None, None
    first = parts[0]
    if not re.search(r"[A-Za-zÀ-ÿ]", first):
        first = f"{first} {re.sub(r'[0-9 ]', '', parts[-1])}"
    start = _season_date(first, start_year) or end
    return start, end


ALPINE_TYPES = {"DH": "Descente", "SG": "Super-G", "GS": "Géant", "SL": "Slalom", "AC": "Combiné",
                "PG": "Parallèle", "PSL": "Slalom parallèle", "PAR": "Parallèle", "TC": "Combiné par équipes"}


def ski_alpin(start_year: int) -> List[dict]:
    soup = _season_page(start_year, "FIS_Alpine_Ski_World_Cup")
    out = []
    for table in (soup.find_all("table", class_="wikitable") if soup else []):
        grid = _grid(table)
        if not grid or "Venue" not in " ".join(grid[0]):
            continue
        sex = _category(table).capitalize()
        i_date, i_venue, i_type, i_win = _cols(grid[0], "date", "venue", "type", "winner")
        for row in grid[1:]:
            if i_date is None or len(row) <= max(i_date, i_venue or 0):
                continue
            d = _season_date(row[i_date], start_year)
            if not d:
                continue
            venue = row[i_venue].split("(")[0].strip()
            code = (row[i_type].split() or [""])[0] if i_type is not None else ""
            if code not in ALPINE_TYPES:  # lignes de récapitulatif (« 61st FIS World Cup Overall »)
                continue
            kind = ALPINE_TYPES[code]
            winner = _clean(row[i_win]) if i_win is not None and len(row) > i_win else ""
            out.append({"name": f"{kind} {sex.lower()} · {venue}", "start": d, "end": d, "location": venue,
                        "details": f"Vainqueur : {winner}" if winner and d < date.today() else f"Coupe du monde · {sex}"})
    return out


BIATHLON_FR = {"Individual / Short individual": "Individuel", "Individual": "Individuel", "Short individual": "Individuel court",
               "Sprint": "Sprint", "Pursuit": "Poursuite", "Mass start": "Mass start", "Relay": "Relais",
               "Mixed relay": "Relais mixte", "Single mixed relay": "Relais mixte simple"}


def biathlon(start_year: int) -> List[dict]:
    soup = _season_page(start_year, "Biathlon_World_Cup")
    out = []
    for table in (soup.find_all("table", class_="wikitable") if soup else []):
        grid = _grid(table)
        if not grid or not grid[0] or grid[0][0].lower() != "stage":
            continue
        i_loc, i_date = _cols(grid[0], "location", "date")
        formats = [h for h in grid[0][i_date + 1:]] if i_date is not None else []
        for row in grid[1:]:
            if len(row) <= i_date:
                continue
            start, end = _range(row[i_date], start_year)
            if not start:
                continue
            races = [BIATHLON_FR.get(f, f) for f, mark in zip(formats, row[i_date + 1:])
                     if mark.strip() and f.lower() not in ("detail", "details", "ref.", "ref")]
            out.append({"name": f"Biathlon · {row[i_loc]}", "start": start, "end": end, "location": row[i_loc],
                        "details": f"Étape {row[0]}" + (f" · {', '.join(races)}" if races else "")})
    return out


def _fis_races(start_year: int, page: str, label: str) -> List[dict]:
    soup = _season_page(start_year, page)
    out = []
    for table in (soup.find_all("table", class_="wikitable") if soup else []):
        grid = _grid(table)
        if not grid or "Date" not in grid[0] or "No." not in grid[0] or not any(h.startswith("Place") for h in grid[0]):
            continue
        sex = _category(table)
        i_date, i_place, i_disc, i_win = _cols(grid[0], "date", "place", "discipline", "winner")
        if i_disc is None:
            i_disc = _cols(grid[0], "size")[0]
        seen = set()
        for row in grid[1:]:
            if len(row) <= max(i_date, i_place) or any(re.search(r"overall|world cup", c, re.I) for c in row):
                continue  # lignes de récapitulatif (« 16th FIS World Cup Men's Overall »)
            d = _season_date(row[i_date], start_year)
            place = row[i_place].split("(")[0].strip()
            if not d or not place or (d, place, sex) in seen:
                continue
            seen.add((d, place, sex))
            disc = row[i_disc] if i_disc is not None and len(row) > i_disc else ""
            out.append({"name": f"{label} {sex} · {place}", "start": d, "end": d, "location": place,
                        "details": _fis_detail(disc)})
    return out


def _fis_detail(code: str) -> str:
    """« 10 km C » → « 10 km classique » ; « L 858 » → « Grand tremplin »."""
    hill = {"L": "Grand tremplin", "N": "Tremplin normal", "F": "Vol à ski", "S": "Tremplin normal"}
    first = (code.split() or [""])[0]
    if first in hill:
        return hill[first]
    words = {"C": "classique", "F": "libre", "MSS": "départ groupé", "Pur": "poursuite", "Skiathlon": "skiathlon"}
    return " ".join(words.get(w, w) for w in code.split())


def ski_fond(start_year: int) -> List[dict]:
    return _fis_races(start_year, "FIS_Cross-Country_World_Cup", "Ski de fond")


def saut_a_ski(start_year: int) -> List[dict]:
    return _fis_races(start_year, "FIS_Ski_Jumping_World_Cup", "Saut à ski")


def patinage_gp(start_year: int) -> List[dict]:
    soup = _season_page(start_year, "ISU_Grand_Prix_of_Figure_Skating")
    table = next((t for t in (soup.find_all("table", class_="wikitable") if soup else [])
                  if "Event" in t.find("tr").get_text() and "Location" in t.find("tr").get_text()), None)
    out = []
    for row in (_grid(table)[1:] if table else []):
        if len(row) < 3:
            continue
        start, end = _range(row[0], start_year)
        if start:
            out.append({"name": re.sub(r"^\d{4}\s+", "", row[1]), "start": start, "end": end,
                        "location": row[2], "details": "Grand Prix ISU"})
    return out


# ---------------------------------------------------------------- handball et athlétisme
# Handball : matchs des Bleus (et Bleues) aux Euros et Mondiaux, plus demi-finales et finales.
# Pages « 2027 World Men's Handball Championship »… ; chaque match est un petit tableau
# [date heure, équipe, score ou « v », équipe, salle, ville…]. Heures locales des salles.

COUNTRY_FR = {
    "France": "France", "Germany": "Allemagne", "Denmark": "Danemark", "Norway": "Norvège", "Sweden": "Suède",
    "Spain": "Espagne", "Hungary": "Hongrie", "Croatia": "Croatie", "Slovenia": "Slovénie", "Poland": "Pologne",
    "Netherlands": "Pays-Bas", "Iceland": "Islande", "Portugal": "Portugal", "Austria": "Autriche", "Serbia": "Serbie",
    "Montenegro": "Monténégro", "Romania": "Roumanie", "Czech Republic": "Tchéquie", "Czechia": "Tchéquie",
    "Slovakia": "Slovaquie", "Switzerland": "Suisse", "Faroe Islands": "Îles Féroé", "Ukraine": "Ukraine",
    "North Macedonia": "Macédoine du Nord", "Turkey": "Turquie", "Greece": "Grèce", "Italy": "Italie",
    "Egypt": "Égypte", "Tunisia": "Tunisie", "Algeria": "Algérie", "Brazil": "Brésil", "Argentina": "Argentine",
    "Japan": "Japon", "South Korea": "Corée du Sud", "Qatar": "Qatar", "Bahrain": "Bahreïn", "Angola": "Angola",
    "Senegal": "Sénégal", "Cape Verde": "Cap-Vert", "Chile": "Chili", "United States": "États-Unis",
    "Bosnia and Herzegovina": "Bosnie-Herzégovine", "Lithuania": "Lituanie", "Georgia": "Géorgie", "Israel": "Israël",
    "Belgium": "Belgique", "Kosovo": "Kosovo", "United Kingdom": "Royaume-Uni", "China": "Chine", "Morocco": "Maroc",
    "Qatar ": "Qatar", "Kenya": "Kenya", "Jamaica": "Jamaïque", "Monaco": "Monaco", "Finland": "Finlande", "Ireland": "Irlande", "Cuba": "Cuba", "Iran": "Iran", "Saudi Arabia": "Arabie saoudite",
}
CITY_TZ = {"Cluj-Napoca": "Europe/Bucharest", "Oradea": "Europe/Bucharest", "Bucharest": "Europe/Bucharest",
           "Antalya": "Europe/Istanbul", "Istanbul": "Europe/Istanbul", "Lisbon": "Europe/Lisbon", "Porto": "Europe/Lisbon",
           "Póvoa de Varzim": "Europe/Lisbon", "Athens": "Europe/Athens", "Helsinki": "Europe/Helsinki"}
ROUND_FR = [("bronze", "Match pour la 3e place"), ("third", "Match pour la 3e place"), ("fifth", "Match pour la 5e place"),
            ("seventh", "Match pour la 7e place"), ("placement", "Match de classement"), ("president", "Coupe du président"),
            ("semi", "Demi-finale"), ("quarter", "Quart de finale"), ("final", "Finale"), ("main round", "Tour principal"),
            ("group", "Phase de groupes"), ("preliminary", "Phase de groupes")]
HANDBALL = [("European_Men's_Handball_Championship", "Euro masculin"), ("European_Women's_Handball_Championship", "Euro féminin"),
            ("World_Men's_Handball_Championship", "Mondial masculin"), ("World_Women's_Handball_Championship", "Mondial féminin")]


def _round_fr(table) -> str:
    """Le titre de section le plus proche ; « Group I » sous « Main round » = tour principal."""
    found = ""
    for h in table.find_all_previous(["h2", "h3", "h4"])[:4]:
        low = h.get_text(" ", strip=True).lower()
        fr = next((fr for key, fr in ROUND_FR if key in low), "")
        if fr and fr != "Phase de groupes":
            return fr if not found or fr == "Tour principal" else found
        if fr and not found:
            found = fr
        if h.name == "h2" and found:
            break
    return found


def handball_fr(year: int) -> List[dict]:
    from zoneinfo import ZoneInfo
    paris = ZoneInfo("Europe/Paris")
    out = []
    for page, label in HANDBALL:
        soup = _page("en", f"{year}_{page}")
        for t in (soup.find_all("table") if soup else []):
            if t.get("class"):
                continue
            cells = [c.get_text(" ", strip=True) for c in t.find_all(["td", "th"])]
            if len(cells) < 5 or ("Report" not in cells and cells[2] != "v"):
                continue
            m = re.match(r"(\d{1,2} \w+ \d{4})\s+(\d{1,2}):(\d{2})", cells[0])
            if not m:
                continue
            home, score, away = cells[1], cells[2], cells[3]
            rnd = _round_fr(t)
            if "France" not in (home, away) and rnd not in ("Demi-finale", "Finale"):
                continue
            d = _date(m.group(1), year)
            if not d:
                continue
            venue = cells[4].split("Attendance")[0].strip()
            city = venue.split(",")[-1].strip()
            local = datetime(d.year, d.month, d.day, int(m.group(2)), int(m.group(3)), tzinfo=ZoneInfo(CITY_TZ.get(city, "Europe/Paris")))
            when = local.astimezone(paris)
            fr = lambda x: COUNTRY_FR.get(x, x if not re.match(r"^[WL]?(SF|QF)\d|^W\w*\d$", x) else "à déterminer")
            played = re.match(r"\d+\s*[–-]\s*\d+", score)
            details = f"{rnd} · {score.replace('–', '-')}" if played else rnd
            known = all(x and fr(x) != "à déterminer" for x in (home, away))
            name = f"{fr(home)} – {fr(away)} · {label}" if known else f"{rnd} · {label}"
            if not known:
                details = "Équipes à déterminer"
            out.append({"name": name, "start": when.date(), "end": when.date(),
                        "time": when.strftime("%H:%M"), "location": venue.replace(" ,", ","), "details": details})
    return out


# Athlétisme : grands championnats (infobox « Dates ») et étapes de la Ligue de diamant.
ATHLE = [("World_Athletics_Championships", "Championnats du monde"), ("World_Athletics_Indoor_Championships", "Championnats du monde en salle"),
         ("European_Athletics_Championships", "Championnats d'Europe"), ("European_Athletics_Indoor_Championships", "Championnats d'Europe en salle"),
         ("World_Athletics_Ultimate_Championship", "Ultimate Championship")]


def _infobox(soup, key: str) -> str:
    box = soup.find("table", class_="infobox") if soup else None
    for tr in (box.find_all("tr") if box else []):
        th = tr.find("th")
        if th and th.get_text(" ", strip=True).startswith(key):
            td = tr.find("td")
            return td.get_text(" ", strip=True) if td else ""
    return ""


def _span(text: str, year: int):
    """« 10–19 September 2027 », « 30 November – 19 December », « 16 May – 5 September 2026 »."""
    parts = [p.strip() for p in re.split(r"[–-]", re.sub(r"\[.*?\]", "", text)) if p.strip()]
    if not parts:
        return None, None
    end = _date(parts[-1], year)
    if not end:
        return None, None
    first = parts[0] if re.search(r"[A-Za-z]", parts[0]) else f"{parts[0]} {end.strftime('%B')}"
    return _date(first, end.year) or end, end


def athletisme(year: int) -> List[dict]:
    out = []
    for page, label in ATHLE:
        soup = _page("en", f"{year}_{page}")
        start, end = _span(_infobox(soup, "Dates"), year)
        if start:
            parts = [p.strip() for p in _infobox(soup, "Host city").replace(" ,", ",").split(",") if p.strip()]
            where = ", ".join(dict.fromkeys([parts[0], COUNTRY_FR.get(parts[-1], parts[-1])])) if parts else ""
            out.append({"name": f"{label} d'athlétisme" if "Ultimate" not in label else f"Athlétisme · {label}",
                        "start": start, "end": end, "location": where, "details": ""})
    soup = _page("en", f"{year}_Diamond_League")
    table = next((t for t in (soup.find_all("table", class_="wikitable") if soup else [])
                  if "Meet" in " ".join(_grid(t)[0])), None)
    for row in (_grid(table)[1:] if table else []):
        if len(row) < 5:
            continue
        d = _date(row[1], year)
        if d:
            final = "final" in row[2].lower() or not row[0].isdigit()
            out.append({"name": row[2], "start": d, "end": d,
                        "location": f"{row[4]}, {COUNTRY_FR.get(row[5], row[5])}" if len(row) > 5 else row[4],
                        "details": "Finale de la Ligue de diamant" if final else f"Ligue de diamant · étape {row[0]}"})
    return out


# ---------------------------------------------------------------- natation, volley, Ryder Cup
# Un événement par page (infobox « Dates » ou « Date », lieu). Les pages des éditions futures
# apparaissent au fil du temps : elles sont prises dès qu'elles existent.

def _place(soup) -> str:
    for key in ("Host city", "Location", "Host country", "Host nation", "Venue"):
        v = _infobox(soup, key)
        if v and not v[0].isdigit():
            parts = [p.strip() for p in re.sub(r"\[.*?\]", "", v).replace(" ,", ",").split(",") if p.strip()]
            if len(parts) == 1:
                return COUNTRY_FR.get(parts[0], parts[0])
            return ", ".join(dict.fromkeys([parts[0], COUNTRY_FR.get(parts[-1], parts[-1])]))
    return ""


def _infobox_events(year: int, items) -> List[dict]:
    out = []
    for title, label, details in items:
        soup = _page("en", title.format(y=year))
        start, end = _span(_infobox(soup, "Dates") or _infobox(soup, "Date"), year) if soup else (None, None)
        if start:
            out.append({"name": label, "start": start, "end": end, "location": _place(soup), "details": details})
    return out


def natation(year: int) -> List[dict]:
    return _infobox_events(year, [
        ("{y}_World_Aquatics_Championships", "Championnats du monde de natation", "Natation, plongeon, water-polo…"),
        ("{y}_World_Aquatics_Swimming_Championships_(25_m)", "Mondiaux de natation en petit bassin", "Bassin de 25 m"),
        ("{y}_European_Aquatics_Championships", "Championnats d'Europe de natation", ""),
        ("{y}_European_Short_Course_Swimming_Championships", "Championnats d'Europe en petit bassin", "Bassin de 25 m"),
    ])


def volley(year: int) -> List[dict]:
    return _infobox_events(year, [
        ("{y}_FIVB_Men's_Volleyball_World_Championship", "Championnat du monde de volley masculin", ""),
        ("{y}_FIVB_Women's_Volleyball_World_Championship", "Championnat du monde de volley féminin", ""),
        ("{y}_Men's_European_Volleyball_Championship", "Euro de volley masculin", ""),
        ("{y}_Women's_European_Volleyball_Championship", "Euro de volley féminin", ""),
        ("{y}_FIVB_Men's_Volleyball_Nations_League", "Ligue des nations de volley masculine", ""),
        ("{y}_FIVB_Women's_Volleyball_Nations_League", "Ligue des nations de volley féminine", ""),
    ])


def ryder_cup(year: int) -> List[dict]:
    return _infobox_events(year, [("{y}_Ryder_Cup", "Ryder Cup", "Europe – États-Unis")])


# ---------------------------------------------------------------- endurance (WEC) et rallye (WRC)
def endurance(year: int) -> List[dict]:
    out = []
    soup = _page("en", f"{year}_FIA_World_Endurance_Championship")
    for t in (soup.find_all("table", class_="wikitable") if soup else []):
        grid = _grid(t)
        if not grid or grid[0][:2] != ["Rnd", "Race"]:
            continue
        i_race, i_circ, i_loc, i_date = _cols(grid[0], "race", "circuit", "location", "date")
        for row in grid[1:]:
            if len(row) <= i_date or not row[0].strip().isdigit():  # prologue et lignes de notes
                continue
            start, end = _span(row[i_date], year)
            if start:
                name = row[i_race].replace("Hours of", "Heures de").replace("24 Heures de Le Mans", "24 Heures du Mans")
                out.append({"name": re.sub(r"\bde ([AEIOUÉ])", r"d'\1", name),
                            "start": start, "end": end, "location": f"{row[i_circ]}, {row[i_loc]}",
                            "details": f"Championnat du monde d'endurance · manche {row[0]}"})
        break
    soup = _page("en", f"{year}_World_Rally_Championship")
    for t in (soup.find_all("table", class_="wikitable") if soup else []):
        grid = _grid(t)
        if not grid or "Rally" not in grid[0] or "Start date" not in grid[0]:
            continue
        i_rnd, i_s, i_e, i_rally, i_hq = _cols(grid[0], "round", "start date", "finish date", "rally", "rally headquarters")
        for row in grid[1:]:
            if len(row) <= i_hq:
                continue
            start, end = _date(row[i_s], year), _date(row[i_e], year)
            if start and end:
                rnd = f" · manche {row[i_rnd]}" if i_rnd is not None and row[i_rnd].isdigit() else ""
                out.append({"name": re.sub(r"\s*\[.*?\]", "", row[i_rally]), "start": start, "end": end,
                            "location": row[i_hq].split(",")[0], "details": f"Championnat du monde des rallyes{rnd}"})
        break
    return out


# ---------------------------------------------------------------- voile (pages françaises)
VOILE = [("Route_du_Rhum_{y}", "Route du Rhum"), ("Transat_Jacques-Vabre_{y}", "Transat Jacques-Vabre"),
         ("Transat_Café_L'Or_{y}", "Transat Café L'Or (ex-Jacques-Vabre)"), ("Vendée_Globe_{y}-{y1}", "Vendée Globe"),
         ("Vendée_Globe_{y}", "Vendée Globe"), ("The_Ocean_Race_{y}-{y1}", "The Ocean Race"),
         ("Solitaire_du_Figaro_{y}", "Solitaire du Figaro")]


def voile(year: int) -> List[dict]:
    """Le départ des grandes courses au large : « départ programmé le 1er novembre 2026 à 13 h 02 »."""
    out = []
    for title, label in VOILE:
        soup = _page("fr", title.format(y=year, y1=year + 1))
        if not soup:
            continue
        text = soup.get_text(" ", strip=True)
        m = re.search(r"[Dd]épart[^.]{0,60}?(\d{1,2})\s*(?:er)?\s+(" + "|".join(list(MONTHS)[12:]) + r")\s+(\d{4})", text)
        if not m:
            continue
        d = date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))
        hm = re.search(r"[Dd]épart[^.]{0,120}?à (\d{1,2}) h (\d{1,2})", text)
        route = re.search(r"entre ([^()]+?)\s*(?:\([^)]*\))?\s+et\s+([^()]+?)\s*(?:\(|Date)", text)
        out.append({"name": f"{label} · départ", "start": d, "end": d,
                    "time": f"{int(hm.group(1)):02d}:{int(hm.group(2)):02d}" if hm else "",
                    "location": f"{route.group(1).strip()} → {route.group(2).strip()}" if route else "",
                    "details": "Course au large"})
    return out


WINTER = {"ski-alpin": ski_alpin, "biathlon": biathlon, "ski-fond": ski_fond, "saut-ski": saut_a_ski,
          "patinage": patinage_gp}

SOURCES = {"mxgp": mxgp, "supercross": supercross, "dakar": dakar, "handball": handball_fr, "athletisme": athletisme,
           "natation": natation, "volley": volley, "endurance": endurance, "voile": voile, "ryder-cup": ryder_cup, **WINTER}


def get_calendar(kind: str, start: date, end: date) -> List[dict]:
    """Événements d'un calendrier entre deux dates (pages des années concernées + la suivante)."""
    events = []
    # Sports d'hiver : une page par saison (année de début) ; autres : une page par année
    years = sorted({start.year - 1, start.year, end.year}) if kind in WINTER else sorted({start.year, end.year, end.year + 1})
    for year in years:
        events += [e for e in SOURCES[kind](year) if e["end"] >= start and e["start"] <= end]
    logger.info("🏍️  %s : %d événement(s) %s → %s", kind, len(events), start, end)
    return events
