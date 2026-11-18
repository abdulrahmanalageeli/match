"""Exploratory follow-up: select a bounded mutual ranker using inner OOF only.

The initial logistic combiner can collapse toward fold-specific class prevalence
with only 57 positives. This challenger chooses between the geometric mean and
five convex min/max combinations. It does not refit or retune directional scores.
"""
import argparse
import collections
import importlib.util
import json
import pathlib
import numpy as np
from sklearn.metrics import roc_auc_score

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('experiment',ROOT/'scripts/test-pairwise-matching.py')
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
OUT=e.OUT
NAMES=['expandedK2','linear','personalized','selected','blend']
OPTIONS=['geometric',0.,.25,.5,.75,1.]
read=lambda name:json.loads((OUT/name).read_text(encoding='utf8'))


def combine(a,b,choice):
    a,b=np.asarray(a),np.asarray(b)
    if choice=='geometric':return np.sqrt(a*b)
    return (1-choice)*np.minimum(a,b)+choice*np.maximum(a,b)


def choose(rows,pred):
    pairs=e.pair_records(rows,pred['forward'],pred['backward'])
    a,b=np.asarray([p['forward'] for p in pairs]),np.asarray([p['backward'] for p in pairs])
    y=np.asarray([p['positive'] for p in pairs]);counts=collections.Counter(n for p in pairs for n in [p['a'],p['b']])
    weights=np.asarray([.5*(1/counts[p['a']]+1/counts[p['b']]) for p in pairs])
    aucs=[float(roc_auc_score(y,combine(a,b,option),sample_weight=weights)) for option in OPTIONS]
    idx=int(np.argmax(aucs))
    return {'choice':OPTIONS[idx],'innerWeightedAuc':aucs[idx],'allOptionsAuc':aucs,'pairs':len(pairs),'positive':int(y.sum())}


def inner_predictions(rows,profiles,tuning,label):
    choices={name:tuning['choices'][name] for name in NAMES if name!='blend'}
    configs={c['name']:c for c in choices.values()}
    pred={key:{kind:np.zeros(len(rows)) for kind in ['forward','backward']} for key in configs}
    for fold,(train_ids,test_ids) in enumerate(e.splits(rows,3),1):
        train=[rows[i] for i in train_ids];test=[rows[i] for i in test_ids]
        for key,c in configs.items():
            model=e.fit(c,train,profiles)
            pred[key]['forward'][test_ids]=model.predict(test,profiles)
            pred[key]['backward'][test_ids]=model.predict(e.reverse(test),profiles)
        print(f'{label} mutual calibration inner {fold}/3',flush=True)
    result={}
    for name,c in choices.items():
        values=pred[c['name']]
        if name!='selected':
            assert abs(e.objective(rows,values['forward'])-tuning['criteria'][name])<1e-10
        result[name]={kind:e.calibrated(v,tuning['calibrations'][name]) for kind,v in values.items()}
    w=tuning['blendWeight']
    result['blend']={kind:(1-w)*result['expandedK2'][kind]+w*result['selected'][kind] for kind in ['forward','backward']}
    return result


def evaluate(rows,profiles,tag):
    report=read(tag+'-report.json'); saved=read(tag+'-predictions.json')
    result={name:np.zeros(len(rows)) for name in NAMES};folds=[]
    for fold,(train_ids,test_ids) in enumerate(e.splits(rows,6)):
        tuning=report['folds'][fold];train=[rows[i] for i in train_ids]
        pred=inner_predictions(train,profiles,tuning,f'{tag} outer {fold+1}/6')
        choices={name:choose(train,p) for name,p in pred.items()}
        for name in NAMES:
            a,b=[[saved[i]['predictions'][name][kind] for i in test_ids] for kind in ['forward','backward']]
            result[name][test_ids]=combine(a,b,choices[name]['choice'])
        folds.append({'fold':fold+1,'choices':choices})
    metrics={}
    for name in NAMES:
        a,b=[np.asarray([r['predictions'][name][kind] for r in saved]) for kind in ['forward','backward']]
        metrics[name]=e.metrics(rows,a,b,result[name])
    payload={'stage':tag,'exploratoryFollowup':True,'choices':folds,'models':metrics}
    e.dump(tag+'-stable-mutual-report.json',payload)
    e.dump(tag+'-stable-mutual-predictions.json',{name:values.tolist() for name,values in result.items()})
    return payload


def temporal(rows,profiles):
    train=[r for r in rows if r['event_id']<28];test=[r for r in rows if r['event_id']==28]
    tuning=read('temporal-report.json')['tuning']
    inner=inner_predictions(train,profiles,tuning,'temporal')
    choices={name:choose(train,p) for name,p in inner.items()}
    pred,_,_=e.train_predict(train,test,profiles,tuning)
    metrics={}
    for name in NAMES:
        a,b=pred[name]['forward'],pred[name]['backward']
        metrics[name]=e.metrics(test,a,b,combine(a,b,choices[name]['choice']))
    e.dump('temporal-stable-mutual-report.json',{'choices':choices,'models':metrics,'exploratoryFollowup':True})


def user7(rows,profiles):
    old=read('user7-report.json');models={}
    labels={r['participantNumber']:r['label'] for r in json.loads((ROOT/'tmp/training-2026-09-17/user7-runtime-ai-report.json').read_text(encoding='utf8'))['rows']}
    tasks={'likedVsDisliked':(['romantic','friendly'],['disliked']),'romanticVsDisliked':(['romantic'],['disliked']),
           'friendlyVsDisliked':(['friendly'],['disliked']),'romanticVsFriendly':(['romantic'],['friendly'])}
    for scope in ['full','purged']:
        train=[r for r in rows if scope=='full' or 7 not in [r['ranker_number'],r['ranked_number']]]
        tuning=old['models'][scope]['tuning']
        inner=inner_predictions(train,profiles,tuning,'user7 '+scope)
        choices={name:choose(train,p) for name,p in inner.items()}
        metrics={};scores={}
        for name in NAMES:
            source=old['models'][scope]['scores'][name]
            score=combine(source['forward'],source['backward'],choices[name]['choice']);scores[name]=score.tolist()
            metrics[name]={}
            for task,(pos,neg) in tasks.items():
                ids=[i for i,n in enumerate(old['numbers']) if labels[n] in pos+neg]
                metrics[name][task]=float(roc_auc_score([int(labels[old['numbers'][i]] in pos) for i in ids],score[ids]))
        models[scope]={'choices':choices,'metrics':metrics,'scores':scores}
    e.dump('user7-stable-mutual-report.json',{'models':models,'exploratoryFollowup':True})


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--stage',choices=['primary','manual','temporal','user7','remaining','manual-user7'],required=True);args=parser.parse_args()
    data=json.loads((ROOT/'.tmp-pairwise-events26-28-personalization.json').read_text(encoding='utf8'))
    profiles={(p['event_id'],p['assigned_number']):p for p in data['profiles']}
    rows=e.t.ranking_rows(data,[26,27,28],args.stage!='manual')
    e.dump('stable-mutual-protocol.json',{'options':OPTIONS,'selection':'Equal-endpoint-weighted inner OOF AUC for both-top-three versus all other reciprocal pairs. Geometric mean wins ties.',
                                       'exploratoryFollowup':True,'reason':'Initial logistic probabilities were dominated by fold-specific prevalence. Bounded ranking combinations remove intercept and scale instability.',
                                       'directionalParametersUnchanged':True,'user7LabelsUsedForSelection':False})
    if args.stage=='remaining':
        evaluate(e.t.ranking_rows(data,[26,27,28],False),profiles,'manual')
        temporal(rows,profiles)
        user7(rows,profiles)
    elif args.stage=='manual-user7':
        e.OUT=OUT/'manual-user7';e.OUT.mkdir(exist_ok=True)
        e.user7(e.t.ranking_rows(data,[26,27,28],False),profiles)
    elif args.stage in ['primary','manual']:evaluate(rows,profiles,args.stage)
    elif args.stage=='temporal':temporal(rows,profiles)
    else:user7(rows,profiles)


if __name__=='__main__':main()
