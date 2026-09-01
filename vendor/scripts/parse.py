#!/usr/bin/env python3
"""Parse crawled category HTML -> ../data/albums.json, and parse album titles into attributes.

Title grammar (validated against 688 live albums):
  "25-26 Arsenal Player Version Cheap Soccer Jerseys Yupoo"
  "2026 England Home Women Cheap Soccer Jerseys Yupoo"
  "26-27 Hoffenheim Home Kids Cheap Soccer Jerseys and shorts Yupoo"

Cover photos are NOT trustworthy (baby-kit covers appear on adult jersey albums)
so the image stage must score candidate photos, never trust the cover blindly.
"""
import re, json, html, pathlib

D = pathlib.Path(__file__).parent
CARD = re.compile(
    r'title="([^"]+)"\s+href="/albums/(\d+)[^"]*"\s*>\s*'
    r'<div class="album__imgwrap">\s*<img[^>]*data-src="https?://photo\.yupoo\.com/jerseyxie/([a-f0-9]+)/\w+\.jpe?g"'
    r'.*?album__photonumber">(\d+)<', re.S)

NON_JERSEY = re.compile(r'Shorts|Training|Polo|Baby|Socks|Suit|Tracksuit|Windbreaker|Jacket|Sleeveless|Vest', re.I)

def parse_title(t):
    a = {'raw': t, 'season': None, 'kit': 'Home', 'version': 'Fan',
         'audience': 'Adult', 'sleeve': 'Short', 'type': 'Jersey', 'flags': []}
    # Season is NOT always leading. Three live formats:
    #   "25-26 Arsenal Home ..."            -> leading pair
    #   "Tottenham Hotspur 2025/26 Home ..." -> mid-title, 4+2
    #   "Mens Qatar 2026 World Cup Home ..." -> mid-title, bare year
    # Anchoring on ^ silently dropped 272 eligible albums, most of the 2026
    # World Cup national range among them.
    for pat, fmt in ((r'\b(20\d{2})[-/_](\d{2})\b', lambda m: f"{m.group(1)}/{m.group(2)}"),
                     (r'\b(2\d)[-/_](\d{2})\b',      lambda m: f"20{m.group(1)}/{m.group(2)}"),
                     (r'\b(20\d{2})\b',               lambda m: m.group(1))):
        m = re.search(pat, t)
        if m:
            a['season'] = fmt(m)
            break
    else:
        a['flags'].append('no_season')
    for kit in ('Away', 'Third', 'Fourth', 'Home', 'Goalkeeper', 'Special', 'Anniversary', 'Pre-?match', 'Souvenir'):
        if re.search(r'\b' + kit + r'\b', t, re.I):
            a['kit'] = kit.replace('-?', '-').title(); break
    if re.search(r'Player Version', t, re.I): a['version'] = 'Player'
    if re.search(r'\bKids\b', t, re.I): a['audience'] = 'Kids'
    if re.search(r'\bWomen\b', t, re.I): a['audience'] = 'Women'
    if re.search(r'Long Sleeve', t, re.I): a['sleeve'] = 'Long'
    if re.search(r'and shorts', t, re.I): a['type'] = 'Set'
    if re.search(r'\bRetro\b', t, re.I): a['flags'].append('retro')
    if NON_JERSEY.search(t): a['type'] = 'Other'
    return a

rows, seen = [], set()
for f in sorted((D / 'raw').glob('*.html')):
    league = f.stem.rsplit('_p', 1)[0]
    for m in CARD.finditer(f.read_text(errors='ignore')):
        aid = m.group(2)
        if aid in seen: continue
        seen.add(aid)
        title = html.unescape(m.group(1))
        rows.append({'league': league, 'albumId': aid, 'cover': m.group(3),
                     'photos': int(m.group(4)), **parse_title(title)})

out = D.parent / 'data' / 'albums.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(rows, indent=1, ensure_ascii=False))
kept = [r for r in rows if r['type'] in ('Jersey', 'Set') and 'retro' not in r['flags']]
print(f"{len(rows)} albums parsed -> {out}")
print(f"{len(kept)} sellable (Jersey/Set, non-retro), {len(rows)-len(kept)} parked")
