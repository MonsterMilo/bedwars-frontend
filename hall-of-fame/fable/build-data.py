import json, base64, urllib.request, sys
d=json.load(open('/tmp/claude-0/sweats.json'))
live=[s for s in d if not s.get('deletedAt')]
def idx(s): return (float(s.get('fkdr') or 0)**2)*float(s.get('star') or 0)
roster=['milo','potat','aballs','zoiv','max','sqoz','kermit','ssent','key']
by={}
for s in sorted(live,key=idx,reverse=True):
    k=(s.get('uuid') or s['username'].lower())
    if k not in by:
        o={k2:s.get(k2) for k2 in ['username','uuid','star','fkdr','wlr','bblr','kdr','finals','finalDeaths','beds','bedsLost','kills','deaths']}
        o['index']=round(idx(s)); o['beatenBy']=[]; o['notes']=[]; o['dates']=[]; o['times']=0; o['cheating']=False; o['boosting']=False
        by[k]=o
    o=by[k]; o['times']+=1
    o['cheating']=o['cheating'] or bool(s.get('cheating')); o['boosting']=o['boosting'] or bool(s.get('boosting'))
    o['dates'].append((s.get('dateAdded') or s.get('createdAt') or '')[:10])
    for r in roster:
        if s.get(r) and r not in o['beatenBy']: o['beatenBy'].append(r)
    for n in s.get('notes',[]):
        o['notes'].append({'text':n['text'],'author':n.get('author',''),'at':(n.get('createdAt') or '')[:10]})
old={o['uuid']:o.get('skin') for o in json.load(open('hof-data.json'))['top']}
top=sorted(by.values(),key=lambda o:o['index'],reverse=True)[:20]
for o in top:
    o['dates']=sorted(set(o['dates'])); o['firstBeaten']=o['dates'][0]; o['lastBeaten']=o['dates'][-1]
    if old.get(o['uuid']): o['skin']=old[o['uuid']]; continue
    try:
        png=urllib.request.urlopen(f"https://mc-heads.net/skin/{o['uuid']}",timeout=20).read()
        o['skin']='data:image/png;base64,'+base64.b64encode(png).decode()
    except Exception as e: print('SKIN FAIL',o['username'],e); o['skin']=None
    print('fetched',o['username'])
for o in top: print(o['index'],o['username'],'CHEATER' if o['cheating'] else '',o['beatenBy'])
json.dump({'generatedAt':'2026-11-02','totalSweats':len(live),'cheaters':sum(1 for o in top if o['cheating']),'top':top},open('hof-data.json','w'))
