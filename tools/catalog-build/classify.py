import json,re,collections
from parse_titles import parse
A=json.load(open('albums.json'))
INFO={'Question','Shipping','order','Sizes Chart','About','Service Center'}
def norm_title(t): return re.sub(r'(?<=[A-Za-z])-(?=[A-Za-z])','',t)  # M-anchester U-nited -> Manchester United
out=[]
for a in A:
    t=norm_title(a['title']); low=t.lower()
    f=parse(t,a['cats']); f.update(id=a['id'],title=t,cover=a['cover'],cats=a['cats'])
    sport='soccer'
    if 'NBA' in a['cats'] or re.search(r'\bnba\b|lakers|celtics|warriors|bulls\b|heat\b|swingman',low): sport='nba'
    elif set(a['cats'])&{'NFL','MLB','NHL','F1','Rugby'} or re.search(r'\bnfl\b|\bmlb\b|\bnhl\b|\bf1\b|formula|rugby|baseball|hockey|racing',low): sport='other'
    elif set(a['cats'])&{'Accessories','Other ball'} or re.search(r'\bball\b|socks|gloves|scarf|cap\b|hat\b|bag\b|backpack|shoes|boots|slippers|keychain',low): sport='accessory'
    if any(k.lower() in low for k in ['question','about shipping','how to order','sizes chart','about liuyang','service center']) or re.fullmatch(r'[A-Za-z ]+(Jerseys|League.*|Teams|equipment)',t): sport='info'
    f['sport']=sport
    if 'Baby' in a['cats'] or f['baby']: f['audience']='baby'
    elif f['kids']: f['audience']='kids'
    elif f['women']: f['audience']='women'
    else: f['audience']='adult'
    out.append(f)
json.dump(out,open('classified.json','w'),ensure_ascii=False)
C=collections.Counter
print('sport',C(f['sport'] for f in out))
S=[f for f in out if f['sport']=='soccer']
print('soccer audience',C(f['audience'] for f in S))
print('soccer type',C(f['type'] for f in S))
print('retro',sum(f['retro'] for f in S),'player',sum(f['player'] for f in S),'long',sum(f['long'] for f in S))
print('season',C(f['season'] for f in S if f['type']=='jersey' and f['audience']=='adult' and not f['retro']).most_common(15))
print('no season',[f['title'] for f in S if not f['season']][:15])
