import json,re,html,time,subprocess
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
BASE="https://jerseyxie.x.yupoo.com"
PAT=r'class="album__main"\s+title="([^"]*)"\s+href="/albums/(\d+)[^"]*".*?src="https://photo\.yupoo\.com/jerseyxie/([0-9a-f]+)/'
home=open('home.html').read()
subs=[]
for cid,name in re.findall(r'href="/categories/(\d+)\?isSubCate=true[^"]*"[^>]*>\s*([^<]+)',home):
    if cid not in [s[0] for s in subs]: subs.append((cid,html.unescape(name).strip()))
albums={a['id']:a for a in json.load(open('albums.json'))}
def get(url):
    for i in range(4):
        r=subprocess.run(['curl','-s','-A',UA,'-e',BASE+'/',url],capture_output=True,text=True)
        if 'album__main' in r.stdout or '共' in r.stdout: return r.stdout
        time.sleep(6*(i+1))
    return ''
for n,(cid,name) in enumerate(subs):
    page=1;pages=1
    while page<=pages:
        a=get(f"{BASE}/categories/{cid}?isSubCate=true&page={page}")
        m=re.search(r'共(\d+)页',a); pages=max(pages,int(m.group(1))) if m else pages
        for title,aid,cover in re.findall(PAT,a,re.S):
            e=albums.setdefault(aid,{'id':aid,'title':html.unescape(title).strip(),'cover':cover,'cats':[]})
            tag='sub:'+name
            if tag not in e['cats']: e['cats'].append(tag)
        page+=1; time.sleep(0.7)
    print(n+1,'/',len(subs),name,pages,len(albums),flush=True)
    if n%20==0: json.dump(list(albums.values()),open('albums.json','w'),ensure_ascii=False)
json.dump(list(albums.values()),open('albums.json','w'),ensure_ascii=False)
print('DONE',len(albums))
