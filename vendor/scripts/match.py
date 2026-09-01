#!/usr/bin/env python3
"""Match supplier albums -> Shopify product handles.

Supplier titles use trademark-evasive club names ("Barc", "Paris", "Man United"),
so team resolution needs an explicit alias table, not string similarity.

Output: ../data/match_all.tsv  (handle, productGid, hash, photos, album title)
Covers only 2025/26 club kits and 2026 national kits, fan/adult/short-sleeve,
single jerseys — the axes the current catalog actually expresses.
"""
import json, pathlib, re, sys

D = pathlib.Path(__file__).parent
albums = json.load(open(D.parent / "data/albums.json"))
rows = [l.split("\t") for l in (D.parent / "data/export.tsv").read_text().strip().splitlines()]
catalog = {h: g for g, h, s in rows if s == "ACTIVE"}

ALIAS = {
    "barc": "barcelona", "paris": "paris-saint-germain", "psg": "paris-saint-germain",
    "man united": "manchester-united", "man utd": "manchester-united",
    "man city": "manchester-city", "inter milan": "inter-milan", "ac milan": "ac-milan",
    "bayern": "bayern-munich", "dortmund": "borussia-dortmund",
    "leverkusen": "bayer-leverkusen", "atletico madrid": "atletico-madrid",
    "atletico": "atletico-madrid", "real madrid": "real-madrid",
    "spurs": "tottenham-hotspur", "tottenham": "tottenham-hotspur",
    "newcastle": "newcastle-united", "newcastle united": "newcastle-united",
    "west ham": "west-ham-united", "leeds": "leeds-united",
    "wolves": "wolverhampton-wanderers", "brighton": "brighton-hove-albion",
    "forest": "nottingham-forest", "nottingham forest": "nottingham-forest",
    "villa": "aston-villa", "aston villa": "aston-villa",
    "monchengladbach": "borussia-monchengladbach", "gladbach": "borussia-monchengladbach",
    "frankfurt": "eintracht-frankfurt", "leipzig": "rb-leipzig",
    "stuttgart": "vfb-stuttgart", "wolfsburg": "vfl-wolfsburg",
    "bremen": "werder-bremen", "hoffenheim": "tsg-hoffenheim",
    "freiburg": "sc-freiburg", "augsburg": "fc-augsburg",
    "marseille": "marseille", "lyon": "lyon", "monaco": "monaco", "lille": "lille",
    "nice": "nice", "rennes": "rennes", "lens": "lens", "nantes": "nantes",
    "juventus": "juventus", "napoli": "napoli", "roma": "roma", "lazio": "lazio",
    "atalanta": "atalanta", "fiorentina": "fiorentina", "torino": "torino",
    "bologna": "bologna", "udinese": "udinese", "genoa": "genoa", "como": "como",
    "parma": "parma", "sevilla": "sevilla", "valencia": "valencia",
    "villarreal": "villarreal", "betis": "real-betis", "real betis": "real-betis",
    "sociedad": "real-sociedad", "real sociedad": "real-sociedad",
    "athletic bilbao": "athletic-bilbao", "bilbao": "athletic-bilbao",
    "celta vigo": "celta-vigo", "girona": "girona", "osasuna": "osasuna",
    "mallorca": "mallorca", "getafe": "getafe", "espanyol": "espanyol",
    "rayo vallecano": "rayo-vallecano", "alaves": "alaves", "levante": "levante",
    "elche": "elche", "arsenal": "arsenal", "chelsea": "chelsea",
    "liverpool": "liverpool", "everton": "everton", "fulham": "fulham",
    "brentford": "brentford", "burnley": "burnley", "sunderland": "sunderland",
    "bournemouth": "bournemouth", "crystal palace": "crystal-palace",
}
# national sides: slug == lowercase name with dashes; add only the irregular ones
ALIAS.update({"south korea": "south-korea", "usa": "united-states",
              "united states": "united-states", "ivory coast": "cote-divoire",
              "cote d ivoire": "cote-divoire", "holland": "netherlands"})

# parse.py already extracted season/kit/version/audience/sleeve/type; use those.
# It stores the title as "raw" and the cover photo hash as "cover".
AMBIG = re.compile(r"(third\s+away|away\s+third|home\s+away)", re.I)

# Derive every team slug the catalog actually uses, so national sides (whose slug
# IS their name) resolve without hand-written aliases. Aliases stay for the
# evasive club names the supplier uses.
SLUG_RE = re.compile(r"^(.*?)-(?:\d{4}-\d{2}|\d{4})-(?:home|away|third)-jersey$")
catalog_teams = set()
for h in catalog:
    m = SLUG_RE.match(h)
    if m:
        catalog_teams.add(m.group(1))
# match longer names first: "united-states" before "united", "north-macedonia" before "north"
team_probe = sorted(catalog_teams, key=len, reverse=True)
alias_keys = sorted(ALIAS, key=len, reverse=True)

def resolve_team(title):
    low = title.lower()
    for k in alias_keys:                       # evasive club names first
        if re.search(r"\b" + re.escape(k) + r"\b", low):
            return ALIAS[k]
    for slug in team_probe:                    # then the catalog's own names
        name = slug.replace("-", " ")
        if re.search(r"\b" + re.escape(name) + r"\b", low):
            return slug
    return None

best = {}   # handle -> (photos, hash, title)
for a in albums:
    t = a.get("raw", "")
    if a.get("type") != "Jersey" or a.get("version") != "Fan":
        continue
    if a.get("audience") != "Adult" or a.get("sleeve") != "Short":
        continue
    if a.get("flags") or AMBIG.search(t) or a.get("photos", 0) < 1:
        continue
    kit = a.get("kit")
    if kit not in ("Home", "Away", "Third"):
        continue
    team = resolve_team(t)
    if not team:
        continue
    season = a.get("season")
    if season == "2026/27":                    # CURRENT season — supplier's live stock
        handle = f"{team}-2026-27-{kit.lower()}-jersey"
    elif season == "2025/26":                  # last season, still sellable
        handle = f"{team}-2025-26-{kit.lower()}-jersey"
    elif season == "2026":                     # national sides
        handle = f"{team}-2026-{kit.lower()}-jersey"
    else:
        continue
    if handle not in catalog:
        continue
    prev = best.get(handle)
    # prefer more photos; prefer current season when tied
    if prev is None or a["photos"] > prev[0]:
        best[handle] = (a["photos"], a["cover"], t)

out = D.parent / "data/match_all.tsv"
with open(out, "w") as f:
    for handle, (photos, h, title) in sorted(best.items()):
        f.write(f"{handle}\t{catalog[handle]}\t{h}\t{photos}\t{title}\n")
print(f"{len(best)} catalog products matched to a supplier album -> {out.name}")
from collections import Counter
c = Counter(h.rsplit("-", 2)[1] for h in best)
print("by kit:", dict(c))
