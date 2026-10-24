import json,re,collections,unicodedata
import os
F=json.load(open(os.path.join(os.path.dirname(__file__),'data','classified.json')))
P=json.load(open(os.path.join(os.path.dirname(__file__),'data','old-catalog.json')))['products']
def strip(s): return ''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c)).lower()
ALIAS={'barc':'barcelona','paris':'paris saint-germain','psg':'paris saint-germain','man united':'manchester united','man utd':'manchester united','man city':'manchester city','bayern':'bayern munich','dortmund':'borussia dortmund','monchengladbach':'borussia monchengladbach','atletico madrid':'atletico madrid','inter':'inter milan','tottenham':'tottenham hotspur','newcastle':'newcastle united','west ham':'west ham united','wolves':'wolverhampton wanderers','wolverhampton':'wolverhampton wanderers','brighton':'brighton hove albion','leeds':'leeds united','celta':'celta vigo','koln':'1. fc koln','berlin':'1. fc union berlin','stuttgart':'vfb stuttgart','frankfurt':'eintracht frankfurt','st.pauli':'fc st. pauli','st pauli':'fc st. pauli','usa':'united states','korea':'south korea','ireland':'republic of ireland','bosnia':'bosnia and herzegovina','uae':'united arab emirates','oviedo':'real oviedo','verona':'hellas verona','alnassr':'al-nassr','al nassr':'al-nassr','alhilal':'al-hilal','alittihad':'al-ittihad','ittihad':'al-ittihad','sporting lisbon':'sporting cp','nigeria':'nigeria','republic of albania':'albania','cote d ivoire':'ivory coast','spanish':'espanyol','bilbao':'athletic bilbao','betis':'real betis','sociedad':'real sociedad','alaves':'alaves','gerona':'girona','czech':'czech republic','nottingham':'nottingham forest','aston villa':'aston villa'}
def team_norm(raw):
    t=strip(raw); t=re.sub(r"^(mens|men's|player version)\s+",'',t).strip()
    t=re.sub(r'\s+(\d{2,3}(th|st|nd|rd)|world cup|wrold cup|tshirt|springbok).*$','',t).strip()
    t=re.sub(r'\s+',' ',t)
    return ALIAS.get(t,t)
def season(t):
    m=re.search(r'\b(\d{2})[-/_](\d{2})\b',t) or re.search(r'\b(20\d{2})[-/_](\d{2})\b',t)
    if m:
        a,b=m.groups(); a=a if len(a)==4 else ('20'+a if int(a)<50 else '19'+a); return f"{a}/{b[-2:]}"
    m=re.search(r'\b((?:19|20)\d{2})\b',t); return m.group(1) if m else None
ours={}
for p in P: ours[(team_norm(p['team']),p['season'],p['kit'])]=p
