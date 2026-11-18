import importlib.util
import json
import pathlib
import math
import numpy as np
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/pairwise-2026-09-18'
spec=importlib.util.spec_from_file_location('verification',ROOT/'scripts/verify-pairwise-matching.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
read=lambda p:json.loads(p.read_text(encoding='utf8'))
people={p['assigned_number']:p for p in read(ROOT/'.tmp-pairwise-user7-0-personalization.json')}
sem=read(OUT/'semantic-evidence.json')['user7']
manual=read(OUT/'manual-user7/user7-report.json')
checks=0;maximum=0.
for scope in ['full','purged']:
    artifacts=read(OUT/f'manual-user7/candidate-{scope}-artifacts.json')
    for name,model in artifacts['models'].items():
        for i,n in enumerate(manual['numbers']):
            actual=v.replay(model,people[7],people[n],sem[str(n)])
            expected=manual['models'][scope]['scores'][name]['raw'][i]
            maximum=max(maximum,abs(actual-expected));checks+=1
            reverse=v.replay(model,people[n],people[7],sem[str(n)])
            cal=artifacts['tuning']['calibrations'][name]
            prob=1/(1+math.exp(-(cal['intercept']+cal['slope']*(reverse-cal['mean'])/cal['scale'])))
            maximum=max(maximum,abs(prob-manual['models'][scope]['scores'][name]['backward'][i]));checks+=1
assert maximum<1e-9
stable_checks=0
for stage in ['primary','manual']:
    rows=read(OUT/f'{stage}-predictions.json')
    report=read(OUT/f'{stage}-stable-mutual-report.json')
    predictions=read(OUT/f'{stage}-stable-mutual-predictions.json')
    for fold,(_,ids) in enumerate(GroupKFold(n_splits=6,shuffle=True,random_state=2609).split(np.arange(len(rows)),groups=[r['ranker_number'] for r in rows])):
        for name,scores in predictions.items():
            choice=report['choices'][fold]['choices'][name]['choice']
            for i in ids:
                a,b=[rows[i]['predictions'][name][kind] for kind in ['forward','backward']]
                expected=math.sqrt(a*b) if choice=='geometric' else (1-choice)*min(a,b)+choice*max(a,b)
                assert abs(expected-scores[i])<1e-12
                stable_checks+=1
    lookup={(r['event_id'],r['ranker_number'],r['ranked_number']):r for r in rows}
    for name,scores in predictions.items():
        labels=[];values=[]
        for i,r in enumerate(rows):
            if r['ranker_number']>r['ranked_number']:continue
            back=lookup.get((r['event_id'],r['ranked_number'],r['ranker_number']))
            if not back:continue
            labels.append(int(r['rank']<=3 and back['rank']<=3));values.append(scores[i])
        assert abs(roc_auc_score(labels,values)-report['models'][name]['allPairs']['learnedAuc'])<1e-12
result={'manualUser7ArtifactChecks':checks,'maxScoreDifference':maximum,'stableMutualScoreChecks':stable_checks,'passed':True}
(OUT/'followup-verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,indent=2))
