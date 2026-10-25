import json,re,html,time,subprocess
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
BASE="https://jerseyxie.x.yupoo.com"
albums={a['id']:a for a in json.load(open('albums.json'))}
PAT=r'class="album__main"\s+title="([^"]*)"\s+href="/albums/(\d+)[^"]*".*?src="https://photo\.yupoo\.com/jerseyxie/([0-9a-f]+)/'
for page in range(5,15):
    for attempt in range(4):
        r=subprocess.run(['curl','-s','-A',UA,'-e',BASE+'/',f"{BASE}/categories/4717652?page={page}"],capture_output=True,text=True)
        x=re.findall(PAT,r.stdout,re.S)
        if x: break
        time.sleep(8*(attempt+1))
    for title,aid,cover in x:
        e=albums.setdefault(aid,{'id':aid,'title':html.unescape(title).strip(),'cover':cover,'cats':[]})
        if 'Premier League' not in e['cats']: e['cats'].append('Premier League')
    print(page,len(x),len(albums),flush=True); time.sleep(1)
json.dump(list(albums.values()),open('albums.json','w'),ensure_ascii=False)
