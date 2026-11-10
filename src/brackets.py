"""
Tableaux des phases finales, pour l'app (catalog.json → "brackets").

Avant les phases finales : une projection « si la saison s'arrêtait aujourd'hui », tirée du classement
(NBA, Ligue des champions et coupes d'Europe, Top 14), ou un tableau vide daté quand il n'existe qu'au
tirage (March Madness). Pendant et après : les vrais résultats, lus sur le scoreboard d'ESPN.

Format : {league_id: {"title", "kind": projection|live|empty, "note",
                      "sections": [{"name", "rounds": [{"name", "ties": [{"a", "b", "info"}]}]}]}}
Un côté (a, b) vaut {"id", "n", "l", "seed", "win"} ou {"n": "Vainqueur …", "tbd": true} ou None (à venir).
"""
import logging
import re
from datetime import date, timedelta
from typing import Dict, List, Optional

from src.config import ESPN_LEAGUES
from src.fetchers.espn import _fetch_scoreboard_range

logger = logging.getLogger("tele7sport")


# ---------------------------------------------------------------- outils
def _side(entry: Optional[dict], seed: Optional[int] = None) -> Optional[dict]:
    if not entry:
        return None
    return {"id": entry.get("team_id") or entry.get("id"), "n": entry.get("team") or entry.get("n"),
            "l": entry.get("logo") or entry.get("l", ""), "seed": seed}


def _tbd(label: str) -> dict:
    return {"n": label, "tbd": True}


def _tie(a, b, info: str = "") -> dict:
    return {"a": a, "b": b, "info": info}


def _empty_rounds(names: List[str], first: int) -> List[dict]:
    """Tours vides : `first` affiches au premier tour, deux fois moins à chaque tour suivant."""
    rounds, n = [], first
    for name in names:
        rounds.append({"name": name, "ties": [_tie(None, None) for _ in range(max(n, 1))]})
        n //= 2
    return rounds


def _order(rounds: List[dict]) -> List[dict]:
    """Range chaque tour dans l'ordre du tableau : l'affiche qui suit le vainqueur des affiches 0 et 1 en premier."""
    for r in range(1, len(rounds)):
        prev = rounds[r - 1]["ties"]

        def pos(t):
            ids = {s.get("id") for s in (t["a"], t["b"]) if s and s.get("id")}
            hits = [i for i, p in enumerate(prev) if ids & {s.get("id") for s in (p["a"], p["b"]) if s and s.get("id")}]
            return min(hits) if hits else 99
        rounds[r]["ties"].sort(key=pos)
    return rounds


def _pad(rounds: List[dict], first: int) -> List[dict]:
    """Complète chaque tour avec des affiches « à venir » jusqu'au nombre attendu."""
    n = first
    for r in rounds:
        r["ties"] += [_tie(None, None) for _ in range(max(n - len(r["ties"]), 0))]
        n = max(n // 2, 1)
    return rounds


def _teams(comp: dict) -> List[dict]:
    out = []
    for c in comp.get("competitors") or []:
        t = c.get("team") or {}
        out.append({"id": str(t.get("id", "")), "n": t.get("displayName", ""), "l": t.get("logo") or ((t.get("logos") or [{}])[0].get("href", "")),
                    "home": c.get("homeAway") == "home", "score": c.get("score"), "winner": c.get("winner")})
    return out


def _events(league_id: str, start: date, end: date) -> list:
    cfg = ESPN_LEAGUES[league_id]
    try:
        return _fetch_scoreboard_range(cfg["sport"], cfg["league"], start, end)
    except Exception as e:
        logger.warning("Tableau %s : scoreboard indisponible (%s)", league_id, e)
        return []


def _season_year(today: date, start_month: int) -> int:
    """Année civile des phases finales de la saison en cours (saison d'automne → printemps suivant)."""
    return today.year + 1 if today.month >= start_month else today.year


# ---------------------------------------------------------------- NBA
NBA_ROUNDS = ["1er tour", "Demi-finales de conf.", "Finale de conf."]


def _nba(tables: dict, today: date) -> Optional[dict]:
    year = _season_year(today, 8)
    start, end = date(year, 4, 18), date(year, 6, 25)
    if start <= today:
        live = _nba_live(start, min(today, end))
        if live:
            return live
    table = tables.get("nba")
    if not table:
        return None
    sections = []
    for name, label in (("East", "Conférence Est"), ("West", "Conférence Ouest")):
        g = next((g for g in table["groups"] if name in g["name"]), None)
        if not g:
            continue
        seeds = {e["rank"]: e for e in g["entries"] if e.get("rank")}
        first = [_tie(_side(seeds.get(a), a), _side(seeds.get(b), b)) for a, b in ((1, 8), (4, 5), (3, 6), (2, 7))]
        rounds = [{"name": NBA_ROUNDS[0], "ties": first}] + _empty_rounds(NBA_ROUNDS[1:], 2)
        sections.append({"name": label, "rounds": rounds})
    sections.append({"name": "Finales NBA", "rounds": [{"name": "Finales", "ties": [_tie(_tbd("Champion Est"), _tbd("Champion Ouest"))]}]})
    return {"title": "Playoffs NBA", "kind": "projection", "sections": sections,
            "note": "Projection d'après le classement actuel (les 7e et 8e passent par le play-in)."}


def _series_fr(text: str) -> str:
    """« CLE wins series 4-3 », « LAL leads series 3-2 », « Series tied 2-2 » → en français."""
    m = re.match(r"(\w+) wins? series (\d+-\d+)", text)
    if m:
        return f"{m.group(1)} gagne {m.group(2)}"
    m = re.match(r"(\w+) leads? series (\d+-\d+)", text)
    if m:
        return f"{m.group(1)} mène {m.group(2)}"
    m = re.match(r"Series tied (\d+-\d+)", text)
    return f"Égalité {m.group(1)}" if m else text


def _nba_live(start: date, end: date) -> Optional[dict]:
    series: Dict[tuple, dict] = {}
    for ev in _events("nba", start, end):
        comp = (ev.get("competitions") or [{}])[0]
        head = ((comp.get("notes") or [{}])[0].get("headline") or "")
        m = re.match(r"(East|West)\s+(1st Round|Semifinals|Finals)|NBA Finals", head)
        if not m:
            continue
        conf = m.group(1) or "Finals"
        rnd = {"1st Round": 0, "Semifinals": 1, "Finals": 2}.get(m.group(2), 0)
        teams = _teams(comp)
        key = (conf, rnd, frozenset(t["id"] for t in teams))
        wins = {str(c.get("id")): c.get("wins", 0) for c in (comp.get("series") or {}).get("competitors", [])}
        s = series.setdefault(key, {"teams": teams, "wins": wins, "summary": "", "date": ev.get("date", "")})
        if ev.get("date", "") >= s["date"]:
            s.update(wins=wins or s["wins"], summary=(comp.get("series") or {}).get("summary", ""), date=ev.get("date", ""))
    if not series:
        return None

    def tie(s):
        a, b = s["teams"][:2]
        sides = []
        for t in (a, b):
            w = s["wins"].get(t["id"], 0)
            sides.append({"id": t["id"], "n": t["n"], "l": t["l"], "score": w, "win": w >= 4})
        return _tie(sides[0], sides[1], _series_fr(s["summary"]))

    sections = []
    for conf, label in (("East", "Conférence Est"), ("West", "Conférence Ouest")):
        rounds = [{"name": NBA_ROUNDS[r], "ties": [tie(s) for k, s in series.items() if k[0] == conf and k[1] == r]} for r in range(3)]
        sections.append({"name": label, "rounds": _pad(_order(rounds), 4)})
    finals = [tie(s) for k, s in series.items() if k[0] == "Finals"]
    sections.append({"name": "Finales NBA", "rounds": [{"name": "Finales", "ties": finals or [_tie(_tbd("Champion Est"), _tbd("Champion Ouest"))]}]})
    return {"title": "Playoffs NBA", "kind": "live", "sections": sections, "note": ""}


# ---------------------------------------------------------------- coupes d'Europe (format 2024 : phase de ligue à 36)
UEFA_SLUGS = {"knockout-round-playoffs": 0, "round-of-16": 1, "quarterfinals": 2, "semifinals": 3, "final": 4}
UEFA_ROUNDS = ["Barrages", "8es de finale", "Quarts", "Demies", "Finale"]


def _uefa(league_id: str, title: str, tables: dict, today: date) -> Optional[dict]:
    year = _season_year(today, 7)
    start, end = date(year, 2, 1), date(year, 6, 10)
    if start <= today:
        live = _uefa_live(league_id, title, start, min(today, end))
        if live:
            return live
    table = tables.get(league_id)
    if not table:
        return None
    seeds = {e["rank"]: e for e in table["groups"][0]["entries"] if e.get("rank")}
    # Barrages : 9e-24e, 10e-23e… ; le vainqueur retrouve en 8es le club classé à l'opposé (16e-17e → 1er)
    order = [1, 8, 4, 5, 2, 7, 3, 6]
    playoffs, r16 = [], []
    for top in order:
        hi, lo = 17 - top, 16 + top  # 1er ↔ barrage 16e-17e, 8e ↔ barrage 9e-24e
        playoffs.append(_tie(_side(seeds.get(hi), hi), _side(seeds.get(lo), lo)))
        r16.append(_tie(_side(seeds.get(top), top), _tbd(f"Vainqueur {hi}e-{lo}e")))
    rounds = [{"name": UEFA_ROUNDS[0], "ties": playoffs}, {"name": UEFA_ROUNDS[1], "ties": r16}] + _empty_rounds(UEFA_ROUNDS[2:], 4)
    return {"title": title, "kind": "projection", "sections": [{"name": "", "rounds": rounds}],
            "note": "Projection d'après la phase de ligue : du 1er au 8e qualifiés pour les 8es, du 9e au 24e en barrages. Le tirage fixe ensuite les croisements exacts."}


def _uefa_live(league_id: str, title: str, start: date, end: date) -> Optional[dict]:
    ties: Dict[tuple, dict] = {}
    for ev in _events(league_id, start, end):
        rnd = UEFA_SLUGS.get(((ev.get("season") or {}).get("slug") or ""))
        if rnd is None:
            continue
        comp = (ev.get("competitions") or [{}])[0]
        teams = _teams(comp)
        if len(teams) < 2:
            continue
        key = (rnd, frozenset(t["id"] for t in teams))
        t = ties.setdefault(key, {"teams": teams, "legs": [], "note": ""})
        done = ((comp.get("status") or {}).get("type") or {}).get("completed")
        home = next(x for x in teams if x["home"]); away = next(x for x in teams if not x["home"])
        if done:
            t["legs"].append(f"{home['score']}-{away['score']}")
        head = ((comp.get("notes") or [{}])[0].get("headline") or "")
        if "advance" in head or rnd == 4:
            t["note"] = head
            named = [x["id"] for x in teams if x["n"] and f"{x['n']} advance" in head]
            t["winner"] = named[0] if named else next((x["id"] for x in teams if x.get("winner")), None)
    if not ties:
        return None
    rounds = [{"name": UEFA_ROUNDS[r], "ties": []} for r in range(5)]
    for (rnd, _), t in sorted(ties.items(), key=lambda kv: kv[0][0]):
        a, b = t["teams"][:2]
        m = re.search(r"(\d+)-(\d+) on aggregate", t["note"])
        info = f"{m.group(1)}-{m.group(2)} cumulé" if m else " · ".join(t["legs"])
        sides = [{"id": x["id"], "n": x["n"], "l": x["l"], "win": t.get("winner") == x["id"]} for x in (a, b)]
        rounds[rnd]["ties"].append(_tie(sides[0], sides[1], info))
    rounds = _pad(_order(rounds), 8)
    return {"title": title, "kind": "live", "sections": [{"name": "", "rounds": rounds}], "note": ""}


# ---------------------------------------------------------------- Top 14
def _top14(tables: dict, today: date) -> Optional[dict]:
    year = _season_year(today, 8)
    start, end = date(year, 5, 28), date(year, 7, 5)
    if start <= today:
        live = _top14_live(start, min(today, end))
        if live:
            return live
    table = tables.get("top-14")
    if not table:
        return None
    s = {e["rank"]: e for e in table["groups"][0]["entries"] if e.get("rank")}
    rounds = [
        {"name": "Barrages", "ties": [_tie(_side(s.get(4), 4), _side(s.get(5), 5)), _tie(_side(s.get(3), 3), _side(s.get(6), 6))]},
        {"name": "Demi-finales", "ties": [_tie(_side(s.get(1), 1), _tbd("Vainqueur 4e-5e")), _tie(_side(s.get(2), 2), _tbd("Vainqueur 3e-6e"))]},
        {"name": "Finale", "ties": [_tie(None, None)]},
    ]
    return {"title": "Phases finales du Top 14", "kind": "projection", "sections": [{"name": "", "rounds": rounds}],
            "note": "Projection d'après le classement : les deux premiers attendent en demi-finales, du 3e au 6e en barrages."}


def _top14_live(start: date, end: date) -> Optional[dict]:
    """ESPN ne nomme pas les tours : après la saison régulière, les week-ends à 2, 2 puis 1 match."""
    evs = sorted(_events("top-14", start, end), key=lambda e: e.get("date", ""))
    weeks: Dict[tuple, list] = {}
    for ev in evs:
        d = date.fromisoformat(ev["date"][:10])
        weeks.setdefault(d.isocalendar()[:2], []).append(ev)
    playoff_weeks = [w for w in weeks.values() if len(w) <= 2]
    if not playoff_weeks:
        return None
    names = ["Barrages", "Demi-finales", "Finale"]
    rounds = []
    for i, w in enumerate(playoff_weeks[:3]):
        ties = []
        for ev in w:
            comp = (ev.get("competitions") or [{}])[0]
            teams = _teams(comp)[:2]
            done = ((comp.get("status") or {}).get("type") or {}).get("completed")
            sides = [{"id": t["id"], "n": t["n"], "l": t["l"], "score": t["score"] if done else None, "win": bool(done and t.get("winner"))} for t in teams]
            ties.append(_tie(*sides))
        rounds.append({"name": names[i], "ties": ties})
    return {"title": "Phases finales du Top 14", "kind": "live", "sections": [{"name": "", "rounds": _pad(_order(rounds), 2)}], "note": ""}


# ---------------------------------------------------------------- March Madness
NCAA_ROUNDS = {"1st Round": 0, "2nd Round": 1, "Sweet 16": 2, "Elite 8": 3}
NCAA_NAMES = ["1er tour", "2e tour", "Sweet 16", "Elite 8"]


def _ncaam(today: date) -> dict:
    year = _season_year(today, 8)
    start, end = date(year, 3, 17), date(year, 4, 10)
    if start <= today:
        live = _ncaam_live(start, min(today, end))
        if live:
            return live
    sections = [{"name": f"Région {r}", "rounds": _empty_rounds(NCAA_NAMES, 8)} for r in ("Est", "Ouest", "Sud", "Midwest")]
    sections.append({"name": "Final Four", "rounds": _empty_rounds(["Demi-finales", "Finale"], 2)})
    return {"title": "March Madness", "kind": "empty", "sections": sections,
            "note": f"Les 68 équipes sont connues le dimanche de la sélection, mi-mars {year} ; le tableau se remplit alors tout seul."}


def _ncaam_live(start: date, end: date) -> Optional[dict]:
    regions: Dict[str, list] = {}
    final_four = [[], []]
    for ev in _events("ncaam", start, end):
        comp = (ev.get("competitions") or [{}])[0]
        head = ((comp.get("notes") or [{}])[0].get("headline") or "")
        if "Championship" not in head:
            continue
        teams = _teams(comp)[:2]
        done = ((comp.get("status") or {}).get("type") or {}).get("completed")
        sides = [{"id": t["id"], "n": t["n"], "l": t["l"], "score": t["score"] if done else None, "win": bool(done and t.get("winner"))} for t in teams]
        if len(sides) < 2:
            continue
        m = re.search(r"- (\w+) Region - (1st Round|2nd Round|Sweet 16|Elite 8)", head)
        if m:
            rounds = regions.setdefault(m.group(1), [{"name": n, "ties": []} for n in NCAA_NAMES])
            rounds[NCAA_ROUNDS[m.group(2)]]["ties"].append(_tie(*sides))
        elif "Final Four" in head:
            final_four[0].append(_tie(*sides))
        elif "National Championship" in head:
            final_four[1].append(_tie(*sides))
    if not regions:
        return None
    fr = {"East": "Est", "West": "Ouest", "South": "Sud", "Midwest": "Midwest"}
    sections = [{"name": f"Région {fr.get(r, r)}", "rounds": _pad(_order(rounds), 8)} for r, rounds in regions.items()]
    sections.append({"name": "Final Four", "rounds": _pad([{"name": "Demi-finales", "ties": final_four[0]}, {"name": "Finale", "ties": final_four[1]}], 2)})
    return {"title": "March Madness", "kind": "live", "sections": sections, "note": ""}


# ---------------------------------------------------------------- tout
def build_brackets(tables: dict, today: date) -> dict:
    out = {}
    builders = {
        "nba": lambda: _nba(tables, today),
        "ncaam": lambda: _ncaam(today),
        "champions-league": lambda: _uefa("champions-league", "Ligue des champions", tables, today),
        "europa-league": lambda: _uefa("europa-league", "Ligue Europa", tables, today),
        "conference-league": lambda: _uefa("conference-league", "Ligue Conférence", tables, today),
        "top-14": lambda: _top14(tables, today),
    }
    for league_id, build in builders.items():
        try:
            b = build()
        except Exception as e:  # un tableau en panne ne doit pas bloquer le catalogue
            logger.warning("Tableau %s indisponible : %s", league_id, e)
            b = None
        if b:
            out[league_id] = b
    return out
