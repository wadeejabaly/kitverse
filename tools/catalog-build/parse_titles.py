import re,json,sys,collections
NONSOCCER={'NBA','NFL','MLB','NHL','F1','Rugby','Accessories','Other ball'}
def parse(t,cats=()):
    s=t.replace('Cheap','').replace('Soccer','').replace('Yupoo','').replace('Jerseys','').replace('Jersey','')
    s=re.sub(r'\s+',' ',s).strip()
    low=t.lower()
    f={}
    m=re.match(r'^((?:19|20)\d{2}(?:[-/](?:\d{2}|\d{4}))?|\d{2}[-/]\d{2})\s+',s)
    if m:
        y=m.group(1)
        if re.fullmatch(r'\d{2}[-/]\d{2}',y): a,b=y.split(y[2]); y=f"20{a}/{b}" if int(a)<50 else f"19{a}/{b}"
        f['season']=y.replace('-','/'); s=s[m.end():]
    else: f['season']=None
    f['kids']=bool(re.search(r'\bkids?\b|children|child',low)); f['baby']='baby' in low
    f['women']=bool(re.search(r'\bwomen|woman|female|ladies',low))
    f['player']='player' in low
    f['long']='long sleeve' in low
    f['retro']='retro' in low
    kit=None
    for k,pat in [('Home',r'\bhome\b'),('Away',r'\baway\b'),('Third',r'\bthird\b'),('Fourth',r'\bfourth\b'),('Goalkeeper',r'goalkeeper|\bgk\b'),('Special',r'special|commemorative|anniversary|edition|concept|classic')]:
        if re.search(pat,low): kit=kit or k
    f['kit']=kit
    typ='jersey'
    for k,pat in [('shorts',r'\bshorts?\b(?!.*jersey)'),('training',r'training|pre-match|prematch|warm'),('tracksuit',r'tracksuit|suit\b|jacket|windbreaker|hoodie|coat|sweater|pants'),('polo',r'\bpolo\b'),('socks',r'socks'),('vest',r'\bvest\b')]:
        if re.search(pat,low): typ=k;break
    if 'and shorts' in low or 'kit' in low.split(): f['with_shorts']=True
    f['type']=typ
    f['nonsoccer']=bool(NONSOCCER & set(cats)) and not ({'Daily new arrivals'}>=set(cats))
    team=re.split(r'\b(Home|Away|Third|Fourth|Goalkeeper|GK|Special|Player|Kids?|Retro|Training|Long|Women|Baby|Shorts|Polo|Anniversary|Edition|Commemorative|Concept|Classic|Pre-?match|Jacket|Suit|Windbreaker|Tracksuit|Vest|Hoodie|Version|and)\b',s,flags=re.I)[0].strip(' -')
    f['team_raw']=team
    return f
if __name__=='__main__':
    A=json.load(open(sys.argv[1]))
    for a in A[:int(sys.argv[2]) if len(sys.argv)>2 else 30]:
        t=a.get('title') or a.get('raw'); print(t,'=>',parse(t,a.get('cats',())))
