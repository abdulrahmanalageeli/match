"""Compare k=2 and k=4 on the identical Events 26-28 snapshot and folds."""
import collections
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / 'tmp/training-2026-09-17'
OUT = ROOT / 'tmp/archetypes-2-vs-4-2026-09-17'
spec = importlib.util.spec_from_file_location('previous_experiment', ROOT / 'scripts/retrain-v12-events26-28.py')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
t = previous.t


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf8')


def fit(rows, profiles, k):
    return t.fit_full(rows, profiles, k, 10, 0.1, False)


def cluster_sizes(bundle):
    return [int(sum(bundle['gate'].clusters == k)) for k in range(bundle['gate'].k)]


def config_for(bundle, rows, profiles, incumbent, version):
    gate = bundle['gate']
    names = gate.profile_vectorizer.get_feature_names_out()
    raw = t.raw_predictions(bundle, rows, profiles)
    return {
        'version': version, 'trainedEventIds': [26, 27, 28],
        'calibrationLabel': 'events26-28-all-directions-archetype-ranking-percentile',
        'schema': incumbent['schema'],
        'archetypes': t.aligned_archetypes(bundle, profiles, incumbent),
        'gate': {
            'classes': [int(x) for x in gate.classifier.classes_],
            'intercepts': [round(float(x), 12) for x in gate.classifier.intercept_],
            'coefficients': [{n: round(float(c), 12) for n, c in zip(names, cs) if abs(float(c)) >= 1e-12} for cs in gate.classifier.coef_],
        },
        'score': {'intercept': round(float(bundle['model'].intercept_), 12), 'coefficients': t.coefficient_map(bundle)},
        'calibration': {str(k): [round(float(x), 12) for x in v] for k,v in t.build_calibration(rows, raw, bundle['memberships'], gate.k).items()},
        'training': {'k': gate.k, 'alpha': 10, 'gateC': 0.1, 'seed': 2609, 'includeAutoSaved': True, 'eventBalanced': False, 'ballotBalanced': False, 'directions':len(rows), 'clusterBallotSizes':cluster_sizes(bundle)},
    }


def cv(rows, profiles, k, purge):
    groups = np.asarray([r['ranker_number'] for r in rows])
    predictions = {'raw': np.zeros(len(rows)), 'calibrated': np.zeros(len(rows))}
    folds = []
    for fold,(train_ids,test_ids) in enumerate(GroupKFold(n_splits=6,shuffle=True,random_state=2609).split(np.arange(len(rows)),groups=groups),1):
        held = {rows[i]['ranker_number'] for i in test_ids}
        train = [rows[i] for i in train_ids if not purge or rows[i]['ranked_number'] not in held]
        test = [rows[i] for i in test_ids]
        assert not held.intersection(r['ranker_number'] for r in train)
        if purge:
            assert not held.intersection(r['ranked_number'] for r in train)
        bundle = fit(train,profiles,k)
        predictions['raw'][test_ids] = t.raw_predictions(bundle,test,profiles)
        predictions['calibrated'][test_ids],_ = t.calibrated_predictions(bundle,train,test,profiles)
        folds.append({'fold':fold,'trainingDirections':len(train),'testDirections':len(test),'clusterBallotSizes':cluster_sizes(bundle)})
        print(f'k={k} purge={purge} fold={fold}/6 complete',flush=True)
    return predictions,folds


def impact(rows, baseline, candidate):
    left = t.per_ballot_ndcg3(rows,baseline)
    right = t.per_ballot_ndcg3(rows,candidate)
    people = collections.defaultdict(list)
    for key in left:
        people[key[1]].append(right[key]-left[key])
    results = [{'participantNumber':n,'ballots':len(v),'meanNdcg3Delta':float(np.mean(v))} for n,v in sorted(people.items())]
    return {'improved':sum(p['meanNdcg3Delta']>1e-12 for p in results),
            'declined':sum(p['meanNdcg3Delta'] < -1e-12 for p in results),
            'unchanged':sum(abs(p['meanNdcg3Delta'])<=1e-12 for p in results),
            'improvedAtLeastThreePoints':sum(p['meanNdcg3Delta']>=0.03 for p in results),
            'declinedAtLeastThreePoints':sum(p['meanNdcg3Delta']<=-0.03 for p in results),
            'people':results}


def user7(configs):
    source = json.loads((ROOT/'.tmp-user7-20260917-personalization.json').read_text(encoding='utf8'))
    profiles = {p['assigned_number']:p for p in source}
    labels = {n:label for label,numbers in previous.LABELS.items() for n in numbers}
    old = json.loads((OLD/'user7-runtime-ai-report.json').read_text(encoding='utf8'))
    ai = {p['participantNumber']:p['ai'] for p in old['rows']}
    rows = []
    for n,label in sorted(labels.items()):
        record = {'participantNumber':n,'label':label,'ai':ai[n],'scores':{}}
        for name,config in configs.items():
            directional=[]
            for a,b in [(profiles[7],profiles[n]),(profiles[n],profiles[7])]:
                memberships=np.round(t.incumbent_memberships(a,config),6)
                raw=config['score']['intercept']+t.dot(config['score']['coefficients'],t.pair_features(a,b,memberships))
                reference=config['calibration'][str(int(np.argmax(memberships)))]
                directional.append(round(max(0.01,min(0.99,t.empirical_percentile(raw,reference)))*100,6))
            base=round(math.sqrt(directional[0]*directional[1]),6)
            record['scores'][name]={'directional':directional[0],'base':base,'final':max(0,min(100,base+ai[n]['adjustment']))}
        rows.append(record)
    tasks={
        'likedVsDisliked':(['romantic','friendly'],['disliked']),
        'romanticVsDisliked':(['romantic'],['disliked']),
        'friendlyVsDisliked':(['friendly'],['disliked']),
        'romanticVsFriendly':(['romantic'],['friendly']),
        'romanticVsEveryoneElse':(['romantic'],['friendly','disliked']),
    }
    reports={}
    for name in configs:
        reports[name]={}
        for task,(pos,neg) in tasks.items():
            selected=[p for p in rows if p['label'] in pos+neg]
            reports[name][task]={kind:float(roc_auc_score([p['label'] in pos for p in selected],[p['scores'][name][kind] for p in selected])) for kind in ['directional','base','final']}
    return {'coverage':len(rows),'models':reports,'rows':rows,'aiPolicy':'Identical fixed AI evidence from the immediately preceding current-hash-verified run; labels are evaluation only.'}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    d=json.loads((ROOT/'.tmp-events26-28-personalization.json').read_text(encoding='utf8'))
    profiles={(p['event_id'],p['assigned_number']):p for p in d['profiles']}
    rows=t.ranking_rows(d,[26,27,28],True)
    old_config=json.loads((OLD/'candidate-config.json').read_text(encoding='utf8'))
    assert previous.hash_json(d)==old_config['training']['datasetSha256'],'Dataset changed: cannot reuse paired baseline'
    manifest=json.loads((OLD/'provenance.json').read_text(encoding='utf8'))
    for name in ['scripts/train-personalized-compatibility.py','.tmp-user7-20260917-personalization.json']:
        wanted=manifest['sources'].get(name) or manifest['inputFileHashes'].get(name)
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==wanted, f'Changed dependency: {name}'
    oof=json.loads((OLD/'oof-predictions.json').read_text(encoding='utf8'))
    assert len(rows)==len(oof)
    for r,p in zip(rows,oof):
        assert (r['event_id'],r['ranker_number'],r['ranked_number'],r['rank'],r['candidate_count'])==(p['event'],p['ranker'],p['target'],p['rank'],p['count'])
    print('Identical snapshot, trainer and row order verified; reusing k=2 predictions',flush=True)
    predictions={}
    report={'datasetSha256':previous.hash_json(d),'people':len({n for _,n in profiles}),'directions':len(rows),'onlyChange':'archetypes 2 to 4; all other V12 settings unchanged','productionChanged':False}
    original_people={n for e,n in profiles if e==26}
    for mode,purge in [('primary',False),('strict',True)]:
        candidate,folds=cv(rows,profiles,4,purge)
        kind='raw' if mode=='primary' else 'calibrated'
        baseline=np.asarray([p[f'{mode}_events26to28_{kind}'] for p in oof])
        predictions[mode]=candidate
        report[mode]={'folds':folds,'comparisons':previous.slices(rows,baseline,candidate[kind],original_people),'individualImpact':impact(rows,baseline,candidate[kind])}
    write('interim-report.json',report)
    # Genuine time-order split: fit each recipe on 26+27, evaluate 28 outcomes.
    train=[r for r in rows if r['event_id'] in [26,27]]
    test=[r for r in rows if r['event_id']==28]
    temporal={}
    for k in [2,4]:
        b=fit(train,profiles,k)
        temporal[k],_=t.calibrated_predictions(b,train,test,profiles)
    report['temporalEvent28']=previous.comparison(test,temporal[2],temporal[4])
    report['temporalEvent28']['individualImpact']=impact(test,temporal[2],temporal[4])
    # Check whether the result survives removing timer auto-saved directions.
    manual=t.ranking_rows(d,[26,27,28],False)
    sensitivity={}
    for k in [2,4]:
        sensitivity[k],_=cv(manual,profiles,k,True)
    report['manualOnlyStrict']=previous.slices(manual,sensitivity[2]['calibrated'],sensitivity[4]['calibrated'],original_people)
    report['manualOnlyIndividualImpact']=impact(manual,sensitivity[2]['calibrated'],sensitivity[4]['calibrated'])
    incumbent=json.loads((OLD/'frozen-v12-config.json').read_text(encoding='utf8'))
    bundle=fit(rows,profiles,4)
    candidate=config_for(bundle,rows,profiles,incumbent,'2026-09-17-experiment-v12-events26-28-k4')
    candidate['training']['datasetSha256']=previous.hash_json(d)
    write('candidate-k4-config.json',candidate)
    report['fourArchetypeFit']={'clusterBallotSizes':cluster_sizes(bundle),'scoreFeatures':len(candidate['score']['coefficients']),'calibrationSizes':{k:len(v) for k,v in candidate['calibration'].items()}}
    purged_rows=[r for r in rows if 7 not in [r['ranker_number'],r['ranked_number']]]
    purged=config_for(fit(purged_rows,profiles,4),purged_rows,profiles,incumbent,'2026-09-17-experiment-v12-events26-28-k4-user7-purged')
    write('candidate-k4-user7-purged-config.json',purged)
    configs={'k2':old_config,'k4':candidate,'k2User7Purged':json.loads((OLD/'candidateUser7Purged-config.json').read_text(encoding='utf8')),'k4User7Purged':purged,'frozenV12':incumbent}
    report['user7']=user7(configs)
    write('report.json',report)
    write('k4-oof-predictions.json',[{'event':r['event_id'],'ranker':r['ranker_number'],'target':r['ranked_number'],**{f'{mode}_{kind}':float(values[kind][i]) for mode,values in predictions.items() for kind in ['raw','calibrated']}} for i,r in enumerate(rows)])
    print(json.dumps({'strict':report['strict']['comparisons']['all'],'primary':report['primary']['comparisons']['all'],'temporal':report['temporalEvent28'],'user7':report['user7']['models'],'clusters':report['fourArchetypeFit']},indent=2),flush=True)


if __name__=='__main__':
    main()
