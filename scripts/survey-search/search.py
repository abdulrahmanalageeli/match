"""Broad, nested, survey-only model search. Offline research; never promotes.

Feature/model search occurs only inside each outer training partition. Temporal
and participant-purged tests are reported separately. User7 labels are loaded
only after selection. Individual outer leaderboard winners are exploratory.
"""
import os
for var in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS']:
    os.environ[var]='1'
import argparse
import collections
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import time
import warnings

import numpy as np
from scipy.stats import rankdata, spearmanr
from sklearn.metrics import roc_auc_score, ndcg_score
from sklearn.model_selection import GroupKFold

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tmp/survey-search-2026-09-23'
OUT.mkdir(parents=True,exist_ok=True)

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[name]=module
    spec.loader.exec_module(module)
    return module

e=load('search_old_experiment',ROOT/'scripts/evaluate-mbti16.py')
f=load('search_feedback',ROOT/'scripts/evaluate-mbti16-feedback.py')
t=e.t
MODULES={name:load('survey_search_'+name,Path(__file__).with_name(name+'.py')) for name in ['nonlinear','retrieval']}
BASE={'name':'v12_refit','module':'baseline','family':'v12'}
CONFIGS=[BASE]+[{**c,'module':name} for name,m in MODULES.items() for c in m.CONFIGS]
CONFIG_BY_NAME={c['name']:c for c in CONFIGS}
assert len(CONFIG_BY_NAME)==len(CONFIGS)
MODEL_SOURCE_HASHES={name:hashlib.sha256(Path(__file__).with_name(name+'.py').read_bytes()).hexdigest() for name in MODULES}
MODEL_SOURCE_HASHES.update({name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in {
    'search_objective':Path(__file__),
    'v12_trainer':ROOT/'scripts/train-personalized-compatibility.py',
    'metric_helper':ROOT/'scripts/evaluate-mbti16.py',
}.items()})


def dump(name,value):
    path=OUT/name
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf8')


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()


def groups(rows):
    result=collections.defaultdict(list)
    for i,r in enumerate(rows):
        result[r['event_id'],r['ranker_number']].append(i)
    return result


def person_metrics(rows,scores):
    persons=collections.defaultdict(lambda:collections.defaultdict(list))
    for (_,person),ids in groups(rows).items():
        actual=np.asarray([rows[i]['y'] for i in ids])
        pred=np.asarray(scores)[ids]
        label=np.asarray([rows[i]['rank']<=3 for i in ids])
        if len(set(label))==2:
            persons[person]['auc'].append(float(roc_auc_score(label,pred)))
        persons[person]['ndcg'].append(float(ndcg_score([actual],[pred],k=3)))
        best=np.flatnonzero(pred==np.max(pred))
        persons[person]['top1_percentile'].append(float(np.mean(actual[best])))
        persons[person]['top1_top3_hit'].append(float(np.mean(label[best])))
    return {int(person):{k:float(np.mean(v)) for k,v in ms.items()} for person,ms in persons.items()}


def objective(rows,scores):
    pm=person_metrics(rows,scores)
    if not pm:
        return -1.
    return float(np.mean([.5*m.get('auc',.5)+.5*m['ndcg'] for m in pm.values()]))


def metrics(rows,scores):
    pm=person_metrics(rows,scores)
    base=e.metrics(rows,scores)
    base.update({f'person_{key}':float(np.mean([v[key] for v in pm.values() if key in v])) for key in ['auc','ndcg','top1_percentile','top1_top3_hit']})
    aucs=sorted(v.get('auc',.5) for v in pm.values())
    base['worst_quarter_person_auc']=float(np.mean(aucs[:max(1,math.ceil(len(aucs)/4))]))
    base['people']=len(pm)
    return base


def ballot_percentiles(rows,scores):
    result=np.zeros(len(rows))
    for ids in groups(rows).values():
        result[ids]=rankdata(np.asarray(scores)[ids],method='average')/(len(ids)+1)
    return result


class Baseline:
    def __init__(self,rows,profiles):
        self.profiles=profiles
        self.bundle=t.fit_full(rows,profiles,2,10,.1,False)
        self.rows=rows
    def predict(self,rows):
        # Runtime-style per-archetype calibrated baseline, matching prior test.
        return t.calibrated_predictions(self.bundle,self.rows,rows,self.profiles)[0]


def fit(config,rows,profiles):
    if config['module']=='baseline':
        return Baseline(rows,profiles)
    return MODULES[config['module']].fit(config,rows,profiles)


def predict(model,rows):
    if not rows:
        return np.asarray([],dtype=float)
    values=np.asarray(model.predict(rows),dtype=float).reshape(-1)
    assert values.shape==(len(rows),) and np.isfinite(values).all()
    return values


def cross_splits(rows,n=3):
    persons=np.asarray([r['ranker_number'] for r in rows])
    for train_ids,test_ids in GroupKFold(n_splits=n,shuffle=True,random_state=2609).split(np.arange(len(rows)),groups=persons):
        held=set(persons[test_ids])
        train_ids=np.asarray([i for i in train_ids if rows[i]['ranked_number'] not in held],dtype=int)
        assert all(held.isdisjoint([rows[i]['ranker_number'],rows[i]['ranked_number']]) for i in train_ids)
        yield train_ids,test_ids,held


def tuning(rows,profiles,tag):
    cache=OUT/f'{tag}-tuning.json'
    key=digest({'rows':rows,'configs':CONFIGS,'profiles':profiles_digest,'model_sources':MODEL_SOURCE_HASHES})
    if cache.exists():
        saved=json.loads(cache.read_text())
        if saved.get('key')==key:
            return saved
    all_predictions={c['name']:np.zeros(len(rows)) for c in CONFIGS}
    fold_manifest=[]
    for fold,(ti,vi,held) in enumerate(cross_splits(rows,3),1):
        train=[rows[i] for i in ti]; test=[rows[i] for i in vi]
        start=time.time()
        for config in CONFIGS:
            model=fit(config,train,profiles)
            all_predictions[config['name']][vi]=ballot_percentiles(test,predict(model,test))
        fold_manifest.append({'held_people':sorted(int(x) for x in held),'train':len(train),'test':len(test)})
        print(f'{tag} inner {fold}/3: {len(CONFIGS)} models in {time.time()-start:.1f}s',flush=True)
    performance={name:objective(rows,scores) for name,scores in all_predictions.items()}
    order=sorted(performance,key=lambda n:(-performance[n],n))
    selected=order[0]
    # A second fixed strategy blends the selected model with incumbent. Weight
    # selection uses inner predictions only, including the safe zero weight.
    blend_scores={weight:objective(rows,(1-weight)*all_predictions['v12_refit']+weight*all_predictions[selected]) for weight in [0,.25,.5,.75,1]}
    blend_weight=max(blend_scores,key=lambda w:(blend_scores[w],-w))
    top3=order[:3]
    result={'key':key,'model_source_hashes':MODEL_SOURCE_HASHES,'selected':selected,'blend_weight':blend_weight,'top3_ensemble':top3,'inner_objective':performance,'folds':fold_manifest,'ranking_objective':'Equal mean-person top3 AUC and NDCG@3'}
    dump(cache.name,result)
    return result


def normalize_global(train_scores,values):
    reference=np.sort(train_scores)
    return (np.searchsorted(reference,values,side='right')+.5)/(len(reference)+1)


def evaluate_split(train,test,feedback,profiles,tag):
    tuned=tuning(train,profiles,tag)
    rank_scores={}; feedback_scores={}; raw_scores={}
    for c in CONFIGS:
        model=fit(c,train,profiles)
        rs=predict(model,test)
        raw_scores[c['name']]=rs
        rank_scores[c['name']]=ballot_percentiles(test,rs)
        tr=predict(model,train)
        feedback_scores[c['name']]=normalize_global(tr,predict(model,feedback))
    rank_scores['selected']=rank_scores[tuned['selected']]
    feedback_scores['selected']=feedback_scores[tuned['selected']]
    weight=tuned['blend_weight']
    for scores in [rank_scores,feedback_scores]:
        scores['selected_blend']=(1-weight)*scores['v12_refit']+weight*scores['selected']
        scores['top3_ensemble']=np.mean([scores[name] for name in tuned['top3_ensemble']],axis=0)
    result={'tuning':tuned,'training_directions':len(train),'test_directions':len(test),'models':{name:metrics(test,values) for name,values in rank_scores.items()},'feedback':{name:f.outcome_metrics(feedback,values) for name,values in feedback_scores.items()} if feedback else {}}
    dump(f'{tag}-report.json',result)
    dump(f'{tag}-predictions.json',{'rankings':[dict(r,scores={name:float(s[i]) for name,s in rank_scores.items()}) for i,r in enumerate(test)],'feedback':[dict({k:r[k] for k in ['event_id','ranker_number','ranked_number','phase','wantConnect','compatibilityRate']},scores={name:float(s[i]) for name,s in feedback_scores.items()}) for i,r in enumerate(feedback)]})
    print(f'{tag}: chose {tuned["selected"]}; test AUC {result["models"]["selected"]["person_auc"]:.4f}, baseline {result["models"]["v12_refit"]["person_auc"]:.4f}',flush=True)
    return result


def bootstrap(rows,base,values):
    a=person_metrics(rows,base); b=person_metrics(rows,values)
    result={}
    for metric in ['auc','ndcg','top1_percentile','top1_top3_hit']:
        delta=np.asarray([b[k][metric]-a[k][metric] for k in a if metric in a[k]])
        boot=np.mean(np.random.default_rng(2609).choice(delta,size=(5000,len(delta))),axis=1)
        result[metric]={'mean_delta':float(np.mean(delta)),'bootstrap95':np.quantile(boot,[.025,.975]).tolist(),'improved':int(sum(delta>1e-10)),'declined':int(sum(delta < -1e-10)),'tied':int(sum(abs(delta)<=1e-10))}
    return result


def summarize(tags,name):
    rank_rows=[]; feedback=[]
    for tag in tags:
        saved=json.loads((OUT/f'{tag}-predictions.json').read_text())
        rank_rows+=saved['rankings']; feedback+=saved['feedback']
    scores={n:np.asarray([r['scores'][n] for r in rank_rows]) for n in rank_rows[0]['scores']}
    result={'models':{n:metrics(rank_rows,s) for n,s in scores.items()},'validated_procedures':{},'feedback':{n:f.outcome_metrics(feedback,[r['scores'][n] for r in feedback]) for n in scores} if feedback else {}}
    for n in ['selected','selected_blend','top3_ensemble']:
        result['validated_procedures'][n]=bootstrap(rank_rows,scores['v12_refit'],scores[n])
    result['exploratory_family_leaderboard']=sorted([n for n in scores if n not in ['selected','selected_blend','top3_ensemble']],key=lambda n:-result['models'][n]['person_auc'])
    dump(name,result)
    return result


def user7(rows,profiles,tuned,prefix=''):
    source=e.read(e.USER7)
    if isinstance(source,dict):source=source['profiles']
    profiles.update({(0,p['assigned_number']):p for p in source})
    labels={n:label for label,ns in e.LABELS.items() for n in ns}
    directions=[{'event_id':0,'ranker_number':a,'ranked_number':b} for n in sorted(labels) for a,b in [(7,n),(n,7)]]
    selected_names=list(dict.fromkeys(['v12_refit',tuned['selected'],*tuned['top3_ensemble']]))
    scores={}
    for mode in ['full','user7_purged']:
        train=[r for r in rows if mode=='full' or 7 not in [r['ranker_number'],r['ranked_number']]]
        for name in selected_names:
            model=fit(CONFIG_BY_NAME[name],train,profiles)
            scores[mode+'_'+name]=normalize_global(predict(model,train),predict(model,directions))
    scores['frozen_v12']=t.incumbent_predictions(directions,profiles,e.read(ROOT/'tmp/training-2026-09-17/frozen-v12-config.json'))
    tasks={'liked_vs_disliked':(['friendly','romantic'],['disliked']),'romantic_vs_disliked':(['romantic'],['disliked']),'friendly_vs_disliked':(['friendly'],['disliked']),'romantic_vs_friendly':(['romantic'],['friendly'])}
    metrics_out={}
    for name,values in scores.items():
        metrics_out[name]={}
        for task,(pos,neg) in tasks.items():
            indices=[i for i,n in enumerate(sorted(labels)) if labels[n] in pos+neg]
            metrics_out[name][task]=e.auc([labels[sorted(labels)[i]] in pos for i in indices],[values[2*i] for i in indices])
    result={'selected_scheme':tuned,'metrics':metrics_out,'rows':[{'number':n,'label':labels[n],'scores':{name:{'directional':float(values[2*i]),'reverse':float(values[2*i+1])} for name,values in scores.items()}} for i,n in enumerate(sorted(labels))],'note':'Survey-only diagnostic; no benchmark label used in selection or fit. No AI corrections. Purged models use unchanged selected config, never retune on User7.'}
    dump(prefix+'user7-report.json',result)


def main():
    global profiles_digest
    parser=argparse.ArgumentParser()
    parser.add_argument('--mode',choices=['temporal','nested','user7','all'],default='all')
    parser.add_argument('--older',action='store_true',help='Add earlier20-25 outcomes as exploratory historical training sensitivity.')
    args=parser.parse_args()
    data=e.read(e.DATA)
    prefix='expanded-' if args.older else ''
    if args.older:
        old=e.read(ROOT/'.tmp-survey-search-older-personalization.json')
        data={**data,'profiles':old['profiles']+data['profiles'],'rankings':old['rankings']+data['rankings']}
    profiles={(p['event_id'],p['assigned_number']):p for p in data['profiles']}
    profiles_digest=digest({str(k):v for k,v in profiles.items()})
    rows=t.ranking_rows(data,[20,21,22,23,24,25,26,27,28] if args.older else [26,27,28],False)
    feedback,_=f.feedback_rows(data,profiles)
    protocol={'data_sha256':hashlib.sha256(e.DATA.read_bytes()).hexdigest(),'manual_rankings_only':True,'configs':CONFIGS,'primary_selection':'3 inner folds grouped by stable participant; held participant purged as chooser and target; maximize equal mean-person top3 AUC and NDCG','outer':'5 participant-purged folds; chronological26->27 and26+27->28 separately','user7':'Evaluation only after model selection; full and incident-row purged','all_predictors':'survey-only; no names, contact, gender, age, IDs/event as features','multiple_testing':'Only selected procedures are evaluated selection-honestly; fixed-family outer leaderboard is exploratory. Events have been examined in previous research; future event required for confirmation.','productionChanged':False}
    protocol['expanded_history_sensitivity']=args.older
    dump(prefix+'protocol.json',protocol)
    if args.mode in ['temporal','all']:
        tags=[]
        for event in [27,28]:
            tag=f'{prefix}temporal-{event}';tags.append(tag)
            evaluate_split([r for r in rows if r['event_id']<event],[r for r in rows if r['event_id']==event],[r for r in feedback if r['event_id']==event],profiles,tag)
        summarize(tags,prefix+'temporal-summary.json')
    if args.mode in ['nested','all']:
        tags=[]
        for fold,(ti,vi,held) in enumerate(cross_splits(rows,5),1):
            tag=f'{prefix}outer-{fold}';tags.append(tag)
            evaluate_split([rows[i] for i in ti],[rows[i] for i in vi],[r for r in feedback if r['ranker_number'] in held],profiles,tag)
        summarize(tags,prefix+'nested-summary.json')
    if args.mode in ['user7','all']:
        tuned=tuning(rows,profiles,prefix+'all-data')
        user7(rows,profiles,tuned,prefix)


if __name__=='__main__':
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',category=DeprecationWarning)
        main()
