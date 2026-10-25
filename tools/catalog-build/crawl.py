import re,html,json,time,subprocess,sys
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
BASE="https://jerseyxie.x.yupoo.com"
CATS={4717653:'Daily new arrivals',4717652:'Premier League',4717651:'La Liga',4717649:'Serie A',4717648:'Bundesliga',4717646:'Ligue 1',4717647:'Mexico',4717645:'Brazil Serie A',4717642:'Argentina',4717644:'Netherlands',4717641:'Scotland',4717640:'Portugal',4717638:'USA',4717637:'Saudi',4717635:'Other League',4717636:'National Teams',4717634:'National Team Jerseys',4717622:'Retro',4717626:'Player Version',4717624:'Baby',4717619:'DIY',4717620:'Accessories',4717621:'Other ball',4717623:'POLO',4717625:'Copa America',4717650:'WC2022',4717654:'HOT',4717655:'Cheap UK',4722244:'2024 obscure',4793509:'2025 obscure',4717627:'Rugby',4717628:'MLB',4717629:'NFL',4717630:'NBA',4717632:'NHL',4717633:'F1'}
def get(url):
    for i in range(4):
        r=subprocess.run(['curl','-s','-A',UA,'-e',BASE+'/','-w','\n%{http_code}',url],capture_output=True,text=True)
        body,code=r.stdout.rsplit('\n',1)
        if code=='200': return body
        time.sleep(5*(i+1))
    print('FAIL',url,code,file=sys.stderr); return ''
albums={}
for cid,name in CATS.items():
    page=1;pages=1
    while page<=pages:
        a=get(f"{BASE}/categories/{cid}?page={page}")
        m=re.search(r'共(\d+)页',a); pages=int(m.group(1)) if m else 1
        for aid,title,cover in re.findall(r'class="album__main"\s+title="([^"]*)"\s+href="/albums/(\d+)[^"]*".*?src="https://photo\.yupoo\.com/jerseyxie/([0-9a-f]+)/',a,re.S) and [(x[1],x[0],x[2]) for x in re.findall(r'class="album__main"\s+title="([^"]*)"\s+href="/albums/(\d+)[^"]*".*?src="https://photo\.yupoo\.com/jerseyxie/([0-9a-f]+)/',a,re.S)] or []:
            e=albums.setdefault(aid,{'id':aid,'title':html.unescape(title).strip(),'cover':cover,'cats':[]})
            if name not in e['cats']: e['cats'].append(name)
        print(name,page,'/',pages,len(albums),flush=True)
        page+=1; time.sleep(0.8)
    json.dump(list(albums.values()),open('albums.json','w'),ensure_ascii=False)
print('DONE',len(albums))
