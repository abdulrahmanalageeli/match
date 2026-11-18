"""Independent artifact replay and rank-based metric checks for the experiment."""
import hashlib
import importlib.util
import json
import math
import pathlib
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/pairwise-2026-09-18'
spec=importlib.util.spec_from_file_location('recipe',ROOT/'scripts/train-personalized-compatibility.py')
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
read=lambda p:json.loads(p.read_text(encoding='utf8'))


def auc(pos,neg):
    return sum(1 if a>b else .5 if a==b else 0 for a in pos for b in neg)/(len(pos)*len(neg))


def replay(artifact,a,b,semantic,history=True):
    profile=lambda p:{**{f'{q}={t.answer(p,q)}':1. for q in t.QUESTIONS},**{f'focus={f}':1. for f in t.focus_values(p)}}
    features=t.base_pair_features(a,b)
    family=artifact['config']['family']
    if family in ['semantic','personalized']:
        features['semantic:available']=float(semantic is not None)
        for k in ['current_curiosity','hobbies','music','friend_description']:
            features['semantic:'+k]=semantic['values'][k]-.5 if semantic else 0.
    result=sum(features.get(k,0)*w for k,w in zip(artifact['pairFeatures'],artifact['linear']))
    if family!='linear':
        av,bv=profile(a),profile(b)
        x=np.asarray([av.get(k,0) for k in artifact['profileFeatures']])-artifact['profileMean']
        y=np.asarray([bv.get(k,0) for k in artifact['profileFeatures']])-artifact['profileMean']
        u=x@np.asarray(artifact['chooserFactors']);v=y@np.asarray(artifact['candidateFactors'])
        if history and family=='personalized':
            u+=np.asarray(artifact['personalFactors'].get(str(a['assigned_number']),[0]*artifact['config']['rank']))
        result+=float(u@v)
    return result


def main():
    result={}
    old=read(ROOT/'tmp/training-2026-09-17/oof-predictions.json')
    new=read(OUT/'primary-predictions.json')
    assert len(old)==len(new)==1966
    maximum=0.
    for a,b in zip(old,new):
        assert (a['event'],a['ranker'],a['target'])==(b['event_id'],b['ranker_number'],b['ranked_number'])
        maximum=max(maximum,abs(a['strict_events26to28_calibrated']-b['predictions']['expandedK2']['legacy']))
    assert maximum<1e-12,maximum
    result['originalOofBaseline']={'comparisons':len(new),'maxDifference':maximum}
    current=read(ROOT/'.tmp-pairwise-user7-0-personalization.json')
    people={p['assigned_number']:p for p in current}
    semantic=read(OUT/'semantic-evidence.json')['user7']
    report=read(OUT/'user7-report.json')
    maximum=0.;checks=0
    for scope in ['full','purged']:
        artifact=read(OUT/f'candidate-{scope}-artifacts.json')
        for name,model in artifact['models'].items():
            for i,n in enumerate(report['numbers']):
                actual=replay(model,people[7],people[n],semantic[str(n)])
                expected=report['models'][scope]['scores'][name]['raw'][i]
                maximum=max(maximum,abs(actual-expected));checks+=1
                rev=replay(model,people[n],people[7],semantic[str(n)])
                cal=artifact['tuning']['calibrations'][name]
                prob=1/(1+math.exp(-(cal['intercept']+cal['slope']*(rev-cal['mean'])/cal['scale'])))
                maximum=max(maximum,abs(prob-report['models'][scope]['scores'][name]['backward'][i]));checks+=1
                if scope=='purged':assert '7' not in model['personalFactors']
    assert maximum<1e-9,maximum
    result['artifactReplay']={'comparisons':checks,'maxDifference':maximum}
    labels={r['participantNumber']:r['label'] for r in read(ROOT/'tmp/training-2026-09-17/user7-runtime-ai-report.json')['rows']}
    checks=0
    for scope,data in report['models'].items():
        for name,scores in data['scores'].items():
            for kind,values in scores.items():
                pos=[s for n,s in zip(report['numbers'],values) if labels[n]!='disliked']
                neg=[s for n,s in zip(report['numbers'],values) if labels[n]=='disliked']
                assert abs(auc(pos,neg)-data['metrics'][name][kind]['likedVsDisliked'])<1e-12
                checks+=1
    result['independentUser7AucChecks']=checks
    before=json.loads((OUT/'production-before.json').read_text(encoding='utf-8-sig'))
    for entry in before:
        assert hashlib.sha256(pathlib.Path(entry['Path']).read_bytes()).hexdigest().upper()==entry['Hash']
    result['productionUnchanged']=True
    result['passed']=True
    (OUT/'verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
