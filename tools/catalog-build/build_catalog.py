"""Build the clean Kitverse catalog from the supplier crawl + the old catalog.

Inputs (all local): classified.json (supplier albums), orphans.json (unlisted
supplier albums the old catalog used), the old catalog.json (names/Arabic/images
only - never prices), convs.json (DM text, for demand ranking only).
Outputs: <out>/teams.json, products.json, products.csv, featured.csv,
not-offered-summary.json, README.md
"""
import json, re, sys, csv, collections, os
from families import team_norm, ALIAS, strip

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
URL = 'https://jerseyxie.x.yupoo.com/albums/{}?uid=1'
F = json.load(open(os.path.join(os.path.dirname(__file__), 'data', 'classified.json')))
ORPH = json.load(open(os.path.join(os.path.dirname(__file__), 'data', 'orphans.json')))
OLD = json.load(open(os.path.join(os.path.dirname(__file__), 'data', 'old-catalog.json')))['products']
CONVS = json.load(open(os.environ['KV_CONVS'])) if os.environ.get('KV_CONVS') else []

ALIAS.update({'hamburger': 'hamburger sv', 'salvador': 'el salvador', 'nigeria': 'nigeria',
              'real madrid retro': 'real madrid', 'sporting': 'sporting cp', 'club america': 'club america',
              'america': 'club america', 'monterey': 'monterrey', 'colo': 'colo-colo', 'atletico': 'atletico madrid',
              'milan': 'ac milan', 'united states': 'united states', 'south korea': 'south korea'})

# ---------- title parsing (album -> fields) ----------
def season_of(t):
    m = re.search(r'\b(\d{2}|(?:19|20)\d{2})[-/_](\d{2}|(?:19|20)\d{2})\b', t)
    if m:
        a, b = m.groups()
        if len(a) == 2:
            a = ('20' + a) if int(a) < 50 else ('19' + a)
        return f"{a}/{b[-2:]}"
    m = re.search(r'\b((?:19|20)\d{2})\b', t)
    return m.group(1) if m else None

def start_year(s):
    return int(s[:4]) if s and s[:4].isdigit() else None

def kind_of(low):
    if re.search(r'training|pre-?match|warm ?up', low): return 'training'
    if re.search(r'tracksuit|\bsuit\b|jacket|windbreaker|hoodie|coat|sweater|pants|trouser', low): return 'outerwear'
    if re.search(r'\bpolo\b', low): return 'polo'
    if re.search(r'\bvest\b', low): return 'vest'
    if re.search(r'socks', low): return 'socks'
    if re.search(r't-?shirts?\b|tshirt', low): return 'tshirt'
    if re.search(r'jers(r)?ey|shirt', low): return 'jersey'
    if re.search(r'\bshorts?\b', low): return 'shorts'
    if re.search(r'\b(home|away|third|fourth)\b', low): return 'jersey'  # e.g. '25/26 Chelsea Home S-4XL'
    return 'unknown'

def kit_of(low):
    for k, pat in [('Home', r'\bhome\b'), ('Away', r'\baway\b'), ('Third', r'\bthird\b'), ('Fourth', r'\bfourth\b'),
                   ('Goalkeeper', r'goalkeeper|\bgk\b')]:
        if re.search(pat, low): return k
    if re.search(r'special|anniversary|snniversary|commemorative|edition|concept|classic|icons|champion', low): return 'Special'
    return None

def team_raw_of(t):
    s = re.sub(r'\b(Cheap|Soccer|Yupoo|Jerseys?|Jersrey|Mens|Men\'s)\b', ' ', t, flags=re.I)
    s = re.sub(r'\b(\d{2}|(?:19|20)\d{2})[-/_](\d{2}|(?:19|20)\d{2})\b|\b(?:19|20)\d{2}\b', ' ', s)
    s = re.sub(r'^\s*Player Version\s*', '', s, flags=re.I)
    s = re.split(r'\b(Home|Away|Third|Fourth|Goalkeeper|GK|Special|Player|Kids?|Retro|Training|Long|Women|Baby|Shorts|Polo|'
                 r'Anniversary|Snniversary|Edition|Commemorative|Concept|Classic|Terrace|Pre-?match|Jacket|Suit|Windbreaker|'
                 r'Tracksuit|Vest|Hoodie|Version|and|World Cup|Wrold Cup|Leaked|White|Red|Blue|Black|Purple|Gold|'
                 r'\d+(?:th|st|nd|rd)|T-?Shirts?|Tshirts?|Springbok)\b', s, flags=re.I)[0]
    return re.sub(r'\s+', ' ', s).strip(' -_')

def parse_album(aid, title, cover, cats):
    t = re.sub(r'(?<=[A-Za-z])-(?=[A-Za-z])', '', title).replace('_', '/')
    low = t.lower()
    s = season_of(t)
    y = start_year(s)
    return dict(id=aid, title=t, cover=cover, cats=cats, season=s,
                era='retro' if ('retro' in low or (y and y <= 2022)) else 'current',
                kit=kit_of(low), kind=kind_of(low),
                version='player' if 'player' in low else 'fan',
                sleeve='long' if 'long sleeve' in low else 'short',
                audience='baby' if 'baby' in low or 'Baby' in cats else
                         'kids' if re.search(r'\bkids?\b|children', low) else
                         'women' if re.search(r'\bwomen|woman|ladies|female', low) else 'adult',
                team=team_norm(team_raw_of(t)),
                leaked='leaked' in low, rugby='springbok' in low or 'rugby' in low)

albums = []
for f in F:
    if f['sport'] != 'soccer':
        continue
    albums.append(parse_album(f['id'], f['title'], f['cover'], f['cats']))
seen = {a['id'] for a in albums}
for h, o in ORPH.items():
    if o['albumId'] and o['albumId'] not in seen:
        old = next(p for p in OLD if p['handle'] == h)
        albums.append(parse_album(o['albumId'], o['title'], old['sourceHash'], ['unlisted']))
        seen.add(o['albumId'])

# ---------- team-name cleanup (supplier titles are noisy: typos, leftovers, years) ----------
import difflib
NOISE = (r'\b(souvenn?ir|adults?|wom[ae]n|limited|swear ?shirts?|sweat ?shirts?|short sleeve|ls|cup shirt|cup|joint|specia|'
         r'concpet|etq|fouth|groakeeper|goalkeeper|traning|champions?|memorial|map|sun|light|pink|beige|green|yellow|navy|'
         r'teal dragon|yupo o|yupoo0*|centennial|stadium|trophy|ucl final|x ?koche|x ?fendi|bob marley|2 star|second|'
         r'years?|anos|limited|s-4xl|t shirts?|trianing|training|fa final|ronaldo|messi|pele|dragon|hone|f\.c|cf|fashion|anime|'
         r'crayon|fujiyama)\b|[^\x00-\x7f]+')
TYPO = {'man u': 'manchester united', 'man uited': 'manchester united', 'manchester untied': 'manchester united',
        'leeds untied': 'leeds united', 'leeds union': 'leeds united', 'celtci': 'celtic', 'celtic seltics': 'celtic',
        'cletic': 'celtic', 'portutal': 'portugal', 'holland': 'netherlands', 'bilba': 'athletic bilbao', 'bessitasa': 'besiktas',
        'beikta': 'besiktas', 'alnass': 'al-nassr', 'alahly': 'al ahly', 'alahli': 'al-ahli saudi', 'al ahli saudi': 'al-ahli saudi',
        'marseilles': 'marseille', 'saintetienn': 'saint etienne', 'kolner': '1. fc koln', 'fc koln': '1. fc koln',
        'st.paul': 'fc st. pauli', 'bayern munchen': 'bayern munich', 'berlin union': '1. fc union berlin',
        'celta de vigo': 'celta vigo', 'alavis': 'alaves', 'aston vera': 'aston villa', 'ca america': 'club america',
        'sporting gij': 'sporting de gijon', 'aargentina': 'argentina', 'argentine': 'argentina', 'boca junior': 'boca juniors',
        'corinthian': 'corinthians', 'bodoglimt': 'bodo/glimt', 'curacaos': 'curacao', 'ecuadorian': 'ecuador',
        'elcheaway': 'elche', 'munich 1860': '1860 munich', 'al ittihad': 'al-ittihad', 'alhilal saudi': 'al-hilal',
        'bayer leverkusen': 'leverkusen', 'coventry': 'coventry city', 'karlsruher': 'karlsruhe', 'getafe club de futbol': 'getafe',
        'university of chile': 'universidad de chile', 'aberdeen f.c': 'aberdeen', 'barc': 'barcelona', 'germany city': 'germany',
        'hibernians': 'hibernian', 'sc internacional': 'internacional', 'ajax amsterdam': 'ajax', 'ajax\'s': 'ajax',
        'colo': 'colo-colo', 'colvado': 'colorado rapids', 'columbus crewm': 'columbus crew', 'st.pauli': 'fc st. pauli',
        'paris': 'paris saint-germain', 'dortmund': 'borussia dortmund', 'mexico league': None, 'premier league': None,
        'serie a league': None, 'adidas': None, 'amazon': None, 'filter': None, 'united': None, 'catholic': None,
        'all saints day': None, 'helen finn': None, 'stokely far alwein': None, 'shaker': None, 'blake': None, 'mont': None,
        'volta': None, 'branko': None, 'gaddis': None, 'bandell': None, 'p90': None, 't90': None, 'oasis': None,
        'prodigy x hummel': None, 'joel campos': None, 'ronaldo': None, 'diego maradona cheapsoccerjerseys.x. .com': None,
        'come': None, 'alma': None, 'argentina maradona': 'argentina', 'barc messi': 'barcelona', 'yerushalayim': 'beitar jerusalem', 'leipzig': 'rb leipzig'}
def clean_team(t):
    t = re.sub(r'\(.*|\)', ' ', t)
    t = re.sub(r'yupoo0+|0{5,}', ' ', t)
    t = re.sub(r'\b\d+(?:[-/]\d+)?(?:-years)?\b', ' ', t)      # years, anniversaries, numbers
    t = re.sub(r'^\s*\d+', ' ', t)
    t = re.sub(r'(?<=[a-z])(home|away|third)$', '', t)          # 'elcheaway'
    t = re.sub(r'^(20\d{2}|\d{2}-\d{2})(?=[a-z])', '', t)       # '2026villarreal'
    t = re.sub(NOISE, ' ', t)
    t = re.sub(r'\s+', ' ', t).strip(' -_.')
    if t in TYPO: return TYPO[t]
    return ALIAS.get(t, t) or None
for a in albums:
    a['team'] = clean_team(a['team']) if a['team'] else None
major = [k for k, n in collections.Counter(a['team'] for a in albums if a['team']).items() if n >= 8]
for a in albums:
    t = a['team']
    if t and t not in major:
        m = difflib.get_close_matches(t, major, n=1, cutoff=0.88)
        if m: a['team'] = m[0]

shirts = [a for a in albums if a['kind'] == 'jersey' and a['audience'] != 'baby' and not a['rugby'] and a['team'] and len(a['team']) > 2]
not_offered = collections.Counter()
for a in albums:
    if a not in shirts:
        why = 'baby' if a['audience'] == 'baby' else 'rugby' if a['rugby'] else a['kind'] if a['kind'] != 'jersey' else 'unparseable team'
        not_offered[why] += 1

# ---------- teams ----------
LEAGUE_CATS = {'Premier League': 'premier-league', 'La Liga': 'la-liga', 'Serie A': 'serie-a', 'Bundesliga': 'bundesliga',
               'Ligue 1': 'ligue-1', 'Saudi': 'saudi-pro-league', 'USA': 'mls', 'Portugal': 'primeira-liga',
               'Netherlands': 'eredivisie', 'Scotland': 'scottish-premiership', 'Brazil Serie A': 'brasileirao',
               'Argentina': 'argentina-primera', 'Mexico': 'liga-mx'}
NATIONAL_CATS = {'National Teams', 'National Team Jerseys', 'Copa America', 'WC2022'}
old_team = {team_norm(p['team']): p for p in OLD}
AR = {  # Arabic display names for teams the old catalog did not carry (curated)
    'liverpool': 'ليفربول', 'juventus': 'يوفنتوس', 'al-nassr': 'النصر', 'al-hilal': 'الهلال', 'al-ittihad': 'الاتحاد',
    'inter miami': 'إنتر ميامي', 'flamengo': 'فلامنغو', 'benfica': 'بنفيكا', 'porto': 'بورتو', 'sporting cp': 'سبورتينغ لشبونة',
    'ajax': 'أياكس', 'celtic': 'سلتيك', 'rangers': 'رينجرز', 'galatasaray': 'غلطة سراي', 'fenerbahce': 'فنربخشة',
    'besiktas': 'بشكتاش', 'boca juniors': 'بوكا جونيورز', 'river plate': 'ريفر بليت', 'club america': 'كلوب أمريكا',
    'santos': 'سانتوس', 'corinthians': 'كورينثيانز', 'palmeiras': 'بالميراس', 'leverkusen': 'باير ليفركوزن',
    'leipzig': 'لايبزيغ', 'aston villa': 'أستون فيلا', 'crystal palace': 'كريستال بالاس', 'lazio': 'لاتسيو',
    'olympiacos': 'أولمبياكوس', 'feyenoord': 'فينورد', 'psv': 'آيندهوفن', 'eindhoven': 'آيندهوفن', 'bologna': 'بولونيا',
    'torino': 'تورينو', 'southampton': 'ساوثهامبتون', 'leicester city': 'ليستر سيتي', 'bournemouth': 'بورنموث',
    'wrexham': 'ريكسهام', 'sheffield united': 'شيفيلد يونايتد', 'hamburger sv': 'هامبورغ', 'schalke': 'شالكه',
    'malaga': 'مالقا', 'deportivo la coruna': 'ديبورتيفو لا كورونيا', 'granada': 'غرناطة', 'cadiz': 'قادش',
    'nice': 'نيس', 'strasbourg': 'ستراسبورغ', 'lecce': 'ليتشي', 'cape verde': 'الرأس الأخضر', 'ivory coast': 'ساحل العاج',
    'mali': 'مالي', 'iraq': 'العراق', 'syria': 'سوريا', 'lebanon': 'لبنان', 'kuwait': 'الكويت', 'oman': 'عُمان',
    'bahrain': 'البحرين', 'libya': 'ليبيا', 'sudan': 'السودان', 'iran': 'إيران', 'israel': 'إسرائيل',
    'chivas': 'تشيفاس', 'tigres': 'تيغريس', 'monterrey': 'مونتيري', 'cruz azul': 'كروز أزول', 'galaxy': 'لوس أنجلوس غالاكسي',
    'la galaxy': 'لوس أنجلوس غالاكسي', 'sao paulo': 'ساو باولو', 'gremio': 'غريميو', 'fluminense': 'فلومينينسي',
    'vasco': 'فاسكو دا غاما', 'botafogo': 'بوتافوغو', 'internacional': 'إنترناسيونال', 'cruzeiro': 'كروزيرو',
}
DIALECT = {  # extra spellings customers actually type (DMs) - search aliases
    'barcelona': ['برشلونه', 'برسا', 'برشا', 'البرسا', 'barca', 'barça', 'ברצלונה'],
    'real madrid': ['الريال', 'ريال', 'مدريد', 'ريال مدريد', 'madrid', 'ריאל מדריד'],
    'manchester united': ['يونايتد', 'مان يونايتد', 'المان', 'man utd', 'man united', 'מנצ\'סטר יונייטד'],
    'manchester city': ['سيتي', 'مان سيتي', 'man city'],
    'paris saint-germain': ['باريس', 'بي اس جي', 'psg'],
    'bayern munich': ['بايرن', 'بايرن ميونخ'],
    'ac milan': ['ميلان', 'milan'], 'inter milan': ['انتر', 'الانتر', 'inter'],
    'arsenal': ['ارسنال', 'الارسنال'], 'chelsea': ['تشلسي', 'تشيلسي'], 'liverpool': ['ليفربول', 'lfc'],
    'juventus': ['يوفي', 'اليوفي', 'juve'], 'al-nassr': ['النصر', 'nassr'], 'inter miami': ['ميامي', 'انتر ميامي'],
    'tottenham hotspur': ['توتنهام', 'spurs'], 'borussia dortmund': ['دورتموند', 'bvb'],
    'atletico madrid': ['اتلتيكو', 'أتلتيكو'], 'argentina': ['ارجنتين', 'الارجنتين'], 'brazil': ['البرازيل', 'برازيل'],
    'spain': ['اسبانيا'], 'portugal': ['البرتغال', 'برتغال'], 'morocco': ['المغرب'], 'palestine': ['فلسطين'],
}
NATIONALS = {team_norm(p['team']) for p in OLD if p['kind'] == 'national'} | {
    'cape verde', 'ivory coast', 'mali', 'iraq', 'syria', 'lebanon', 'kuwait', 'oman', 'bahrain', 'libya', 'sudan', 'iran',
    'israel', 'panama', 'costa rica', 'peru', 'denmark', 'serbia', 'greece', 'russia', 'china', 'india', 'iceland', 'slovakia',
    'slovenia', 'georgia', 'nigeria', 'burkina', 'cote d ivoire', 'dr congo', 'zambia', 'angola', 'kenya', 'north macedonia'}

tcats = collections.defaultdict(collections.Counter)
for a in shirts:
    for c in a['cats']:
        tcats[a['team']][c] += 1

def pretty(key):
    if key in old_team: return old_team[key]['team']
    special = {'psv': 'PSV Eindhoven', 'club america': 'Club América', 'sporting cp': 'Sporting CP', 'al-nassr': 'Al-Nassr',
               'al-hilal': 'Al-Hilal', 'al-ittihad': 'Al-Ittihad', 'hamburger sv': 'Hamburger SV'}
    return special.get(key, ' '.join(w.capitalize() if w not in ('de', 'la', 'del', 'fc', 'sv') else w.upper() if w in ('fc', 'sv') else w for w in key.split()))

teams = {}
for key in sorted({a['team'] for a in shirts}):
    cats = tcats[key]
    is_nat = key in NATIONALS or (sum(cats[c] for c in NATIONAL_CATS) > 0 and not any(c in LEAGUE_CATS for c in cats))
    league = None
    if not is_nat:
        best = [(n, c) for c, n in cats.items() if c in LEAGUE_CATS]
        if best: league = LEAGUE_CATS[max(best)[1]]
        elif key in old_team and old_team[key]['league']: league = old_team[key]['league']
    slug = re.sub(r'[^a-z0-9]+', '-', strip(pretty(key)).lower()).strip('-')
    teams[key] = dict(id=slug, name_en=pretty(key), name_ar=(old_team[key]['teamAr'] if key in old_team else AR.get(key)),
                      name_he=None, aliases=DIALECT.get(key, []), type='national' if is_nat else 'club', league=league,
                      supplier_albums=sum(1 for a in shirts if a['team'] == key))

# ---------- products (merge albums into one product with options) ----------
groups = collections.defaultdict(list)
for a in shirts:
    if a['kit'] in ('Home', 'Away', 'Third', 'Fourth', 'Goalkeeper'):
        key = (a['team'], a['season'], a['kit'], a['era'])
    else:  # specials / kit not stated: each distinct album is its own design
        key = (a['team'], a['season'], a['kit'] or 'Unstated', a['era'], a['cover'])
    groups[key].append(a)

old_by_cover = {p['sourceHash']: p for p in OLD}
KIT_AR = {'Home': 'الأساسي', 'Away': 'الاحتياطي', 'Third': 'الثالث', 'Fourth': 'الرابع', 'Goalkeeper': 'حارس المرمى',
          'Special': 'إصدار خاص', 'Unstated': ''}
products = []
for key, albs in groups.items():
    team, season, kit, era = key[:4]
    T = teams[team]
    old = next((old_by_cover[a['cover']] for a in albs if a['cover'] in old_by_cover), None)
    flags = []
    if kit == 'Unstated': flags.append('kit not stated by supplier - check photo')
    if kit == 'Special': flags.append('special edition - name from photo/title')
    if any(a['leaked'] for a in albs): flags.append('leaked pre-release design - replace with final kit if available')
    if not season: flags.append('no season in supplier title')
    if not T['name_ar']: flags.append('team has no Arabic name yet')
    if kit == 'Special' and old:
        flags.append(f"old catalog wrongly called this '{old['kit']}'")
    options = collections.defaultdict(list)
    for a in albs:
        options[(a['audience'], a['version'], a['sleeve'])].append(a['id'])
    primary = sorted(albs, key=lambda a: (a['audience'] != 'adult', a['version'] != 'fan', a['sleeve'] != 'short'))[0]
    label = {'Unstated': 'Shirt', 'Special': 'Special Edition Shirt'}.get(kit, f'{kit} Shirt')
    title_en = f"{T['name_en']} {season or ''} {'Retro ' if era == 'retro' else ''}{label}".replace('  ', ' ').strip()
    title_ar = f"قميص {T['name_ar'] or T['name_en']} {season or ''} {KIT_AR.get(kit, '')}{' ريترو' if era == 'retro' else ''}".replace('  ', ' ').strip()
    handle = re.sub(r'[^a-z0-9]+', '-', strip(title_en).lower()).strip('-')
    products.append(dict(
        handle=handle, team_id=T['id'], team_key=team, season=season, kit=kit, era=era,
        title_en=title_en, title_ar=title_ar,
        audiences=sorted({o[0] for o in options}), versions=sorted({o[1] for o in options}), sleeves=sorted({o[2] for o in options}),
        options=[dict(audience=k[0], version=k[1], sleeve=k[2], supplier_album_ids=v) for k, v in sorted(options.items())],
        primary_album=primary['id'], primary_album_url=URL.format(primary['id']), primary_cover=primary['cover'],
        supplier_titles=sorted({a['title'] for a in albs})[:5],
        old_catalog_handle=old['handle'] if old else None, old_image=old['image'] if old else None,
        status='available', flags=flags))

# de-duplicate handles
cnt = collections.Counter()
for p in products:
    cnt[p['handle']] += 1
    if cnt[p['handle']] > 1: p['handle'] += f"-{cnt[p['handle']]}"

# ---------- demand ranking (DMs) -> featured ----------
dm_text = ' '.join(m['text'].lower() for c in CONVS for m in c['msgs'])
demand = collections.Counter()
for key, T in teams.items():
    words = [T['name_en'].lower()] + ([T['name_ar']] if T['name_ar'] else []) + [w.lower() for w in T['aliases']]
    demand[key] = sum(dm_text.count(w) for w in set(words) if len(w) > 2)

TOP_CLUBS = ['barcelona', 'real madrid', 'manchester united', 'manchester city', 'arsenal', 'chelsea', 'paris saint-germain',
             'bayern munich', 'ac milan', 'inter milan', 'al-nassr', 'inter miami', 'atletico madrid', 'tottenham hotspur',
             'borussia dortmund', 'napoli', 'newcastle united', 'al-hilal', 'roma', 'al-ittihad', 'benfica', 'porto',
             'galatasaray', 'celtic', 'ajax', 'aston villa', 'marseille', 'sporting cp', 'flamengo', 'boca juniors']
TOP_NATIONS = ['argentina', 'brazil', 'portugal', 'spain', 'france', 'germany', 'england', 'morocco', 'palestine', 'algeria',
               'egypt', 'saudi arabia', 'jordan', 'tunisia', 'italy', 'netherlands', 'japan', 'mexico', 'united states',
               'belgium', 'croatia', 'colombia', 'senegal']
# curated only: DM word-matching produced false positives ('ليل' = night -> Lille, 'nice', 'come', 'alma')
featured_teams = set(TOP_CLUBS + TOP_NATIONS)
for p in products:
    if (p['team_key'] in featured_teams and p['era'] == 'current' and p['season'] in ('2025/26', '2026/27', '2026')
            and p['kit'] in ('Home', 'Away', 'Third') and 'adult' in p['audiences']):
        p['status'] = 'featured'
RETRO_ICONS = ['barcelona', 'real madrid', 'manchester united', 'ac milan', 'brazil', 'argentina', 'arsenal', 'bayern munich',
               'inter milan', 'france', 'germany', 'italy']
for team in RETRO_ICONS:
    r = [p for p in products if p['team_key'] == team and p['era'] == 'retro' and p['kit'] in ('Home', 'Away') and 'adult' in p['audiences']]
    for p in sorted(r, key=lambda p: -sum(len(o['supplier_album_ids']) for o in p['options']))[:3]:
        p['status'] = 'featured'

# ---------- write ----------
json.dump(list(teams.values()), open(f'{OUT}/teams.json', 'w'), ensure_ascii=False, indent=1)
json.dump(products, open(f'{OUT}/products.json', 'w'), ensure_ascii=False, indent=1)
with open(f'{OUT}/products.csv', 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['status', 'handle', 'title_en', 'title_ar', 'team', 'season', 'kit', 'era', 'audiences', 'versions', 'sleeves',
                'primary_album_url', 'old_catalog_handle', 'flags'])
    for p in sorted(products, key=lambda p: (p['status'] != 'featured', p['team_key'], p['season'] or '', p['kit'])):
        w.writerow([p['status'], p['handle'], p['title_en'], p['title_ar'], teams[p['team_key']]['name_en'], p['season'], p['kit'],
                    p['era'], '/'.join(p['audiences']), '/'.join(p['versions']), '/'.join(p['sleeves']), p['primary_album_url'],
                    p['old_catalog_handle'] or '', '; '.join(p['flags'])])
fe = [p for p in products if p['status'] == 'featured']
with open(f'{OUT}/featured.csv', 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(['team', 'season', 'kit', 'era', 'title_en', 'title_ar', 'primary_album_url', 'flags'])
    for p in sorted(fe, key=lambda p: (p['era'], p['team_key'], p['season'] or '', p['kit'])):
        w.writerow([teams[p['team_key']]['name_en'], p['season'], p['kit'], p['era'], p['title_en'], p['title_ar'], p['primary_album_url'], '; '.join(p['flags'])])
json.dump(dict(not_offered_albums=not_offered, dm_demand_top=demand.most_common(30)), open(f'{OUT}/not-offered-summary.json', 'w'), ensure_ascii=False, indent=1)

S = collections.Counter
stats = dict(
    supplier_football_albums=len(albums), shirt_albums=len(shirts), products=len(products), teams=len(teams),
    by_status=S(p['status'] for p in products), by_era=S(p['era'] for p in products),
    by_kit=S(p['kit'] for p in products), flagged=S(f.split(' - ')[0].split("'")[0] for p in products for f in p['flags']),
    old_catalog_linked=sum(1 for p in products if p['old_catalog_handle']),
    old_catalog_total=len(OLD), teams_no_arabic=sum(1 for t in teams.values() if not t['name_ar']),
    featured_teams_missing_at_supplier=sorted(t for t in featured_teams if t not in teams),
    not_offered=not_offered)
json.dump(stats, open(f'{OUT}/stats.json', 'w'), ensure_ascii=False, indent=1, default=dict)
print(json.dumps(stats, ensure_ascii=False, indent=1, default=dict))
