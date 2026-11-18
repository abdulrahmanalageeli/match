"""Offline fixed-MBTI archetype experiment. Never changes production models.

Requires the privacy-minimized fresh export; uses the pinned original V12 Python
environment. Parameters and comparisons are fixed before inspecting results.
"""
import collections
import hashlib
import importlib.util
import itertools
import json
import math
import os
from pathlib import Path
import re

os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import numpy as np
from scipy.stats import spearmanr
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import Ridge
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/mbti16-2026-09-23'
DATA = ROOT / '.tmp-mbti16-20260923-data-personalization.json'
USER7 = ROOT / '.tmp-mbti16-20260923-user7-personalization.json'
spec = importlib.util.spec_from_file_location('v12', ROOT / 'scripts/train-personalized-compatibility.py')
t = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t)
TYPES = [''.join(x) for x in itertools.product('EI', 'SN', 'TF', 'JP')]
MODELS = ['v12_recipe_k2', 'mbti16_experts', 'mbti16_types_only']
LABELS = {
    'romantic': [975,1455,1470,1524,1566,1586,1623],
    'friendly': [16,23,122,223,287,325,539,567,1372,1381,1414,1688,1775],
    'disliked': [101,277,312,892,1101,1137,1293,1527,1606,1853],
}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf8')


def mbti(profile):
    answers = profile.get('answers', {})
    values = [t.norm(answers.get(f'mbti_{i}')) for i in range(1,5)]
    if all(x in ['A','B'] for x in values):
        return ''.join(poles[x == 'B'] for poles,x in zip(['EI','SN','TF','JP'],values)), 'answers'
    for key in ['mbti_personality_type', 'mbti_type', 'mbtiType']:
        value = str(profile.get(key) or '').strip().upper()
        if re.fullmatch('[EI][SN][TF][JP]', value):
            return value, 'stored_type'
    return None, 'missing'


def features(a, b, model):
    at, bt = mbti(a)[0], mbti(b)[0]
    if model == 'mbti16_types_only':
        # Global intercept + target preference + directed type pairing. An
        # unknown type is not silently assigned to any of the 16 categories.
        result = {'global': 1.0}
        if bt:
            result['target_type:'+bt] = 0.35
        if at and bt:
            result[f'type_pair:{at}>{bt}'] = 1.0
        return result
    weights = np.zeros(16)
    if at:
        weights[TYPES.index(at)] = 1.0
    return t.pair_features(a, b, weights)


class Model:
    def __init__(self, rows, profiles, kind):
        self.kind, self.profiles = kind, profiles
        if kind == 'v12_recipe_k2':
            self.bundle = t.fit_full(rows, profiles, 2, 10, 0.1, False)
        else:
            self.vectorizer = DictVectorizer(sparse=True)
            x = self.vectorizer.fit_transform([self.feat(r) for r in rows])
            self.model = Ridge(alpha=10, solver='lsqr').fit(x, [r['y'] for r in rows])
        raw = self.raw(rows)
        self.global_reference = sorted(float(x) for x in raw)
        self.references = collections.defaultdict(list)
        for row, score in zip(rows, raw):
            self.references[self.group(row)].append(float(score))

    def feat(self, row):
        return features(self.profiles[(row['event_id'],row['ranker_number'])], self.profiles[(row['event_id'],row['ranked_number'])], self.kind)

    def group(self, row):
        key = (row['event_id'],row['ranker_number'])
        if self.kind == 'v12_recipe_k2':
            return int(np.argmax(self.bundle['memberships'][key]))
        return mbti(self.profiles[key])[0]

    def raw(self, rows):
        if self.kind == 'v12_recipe_k2':
            return t.raw_predictions(self.bundle, rows, self.profiles)
        return self.model.predict(self.vectorizer.transform([self.feat(r) for r in rows]))

    def predict(self, rows):
        return np.asarray([np.clip(t.empirical_percentile(x, self.references.get(self.group(r)) or self.global_reference),0.01,0.99) for r,x in zip(rows,self.raw(rows))])


def auc(labels, values):
    return float(roc_auc_score(labels, values)) if len(set(labels)) == 2 else None


def correlation(actual, predicted):
    if len(actual)<3 or len(set(actual))<2 or len(set(predicted))<2:
        return None
    return float(spearmanr(actual, predicted).statistic)


def metrics(rows, values):
    result = t.metrics(rows, values)
    # Reciprocal scores from chooser-group CV can use different fold models.
    # Do not present that statistic as validated mutual accuracy.
    result.pop('mutual_auc', None)
    result.pop('mutual_labeled_pairs', None)
    return result


def compare(rows, predictions):
    result = {'metrics':{name:metrics(rows,v) for name,v in predictions.items()},'vs_k2':{}}
    base = t.per_ballot_ndcg3(rows,predictions['v12_recipe_k2'])
    for name, values in predictions.items():
        if name == 'v12_recipe_k2':
            continue
        cand = t.per_ballot_ndcg3(rows,values)
        by_person = collections.defaultdict(list)
        for key in base:
            by_person[key[1]].append(cand[key]-base[key])
        changes = np.asarray([np.mean(x) for x in by_person.values()])
        rng = np.random.default_rng(2609)
        boot = np.mean(rng.choice(changes,size=(5000,len(changes))),axis=1)
        result['vs_k2'][name] = {'people':len(changes),'improved':int(sum(changes>1e-12)), 'declined':int(sum(changes < -1e-12)), 'tied':int(sum(abs(changes)<=1e-12)), 'mean_ndcg_delta':float(np.mean(changes)), 'bootstrap95':np.quantile(boot,[.025,.975]).tolist()}
    return result


def coverage(profiles, rows):
    result = {}
    for event in [26,27,28]:
        ps = [p for (e,n),p in profiles.items() if e==event]
        counts = collections.Counter(mbti(p)[0] or 'UNKNOWN' for p in ps)
        rs = [r for r in rows if r['event_id']==event]
        result[str(event)] = {'profiles':len(ps),'known':sum(mbti(p)[0] is not None for p in ps),'types':dict(sorted(counts.items())), 'sources':dict(collections.Counter(mbti(p)[1] for p in ps)), 'directions':len(rs),'known_chooser_directions':sum(mbti(profiles[(event,r['ranker_number'])])[0] is not None for r in rs),'both_known_directions':sum(all(mbti(profiles[(event,r[k])])[0] is not None for k in ['ranker_number','ranked_number']) for r in rs)}
    return result


def rolling(rows, profiles):
    all_rows, all_pred = [], {name:[] for name in [*MODELS,'frozen_v12']}
    events, models = {}, {}
    for event in [27,28]:
        train = [r for r in rows if r['event_id'] < event]
        test = [r for r in rows if r['event_id'] == event]
        assert {r['event_id'] for r in train} == ({26} if event == 27 else {26,27})
        predictions = {}
        models[event] = {}
        for name in MODELS:
            fitted = Model(train,profiles,name)
            predictions[name] = fitted.predict(test)
            all_pred[name].extend(predictions[name])
            models[event][name] = fitted
        predictions['frozen_v12'] = t.incumbent_predictions(test, profiles, read(ROOT/'tmp/training-2026-09-17/frozen-v12-config.json'))
        all_pred['frozen_v12'].extend(predictions['frozen_v12'])
        events[str(event)] = compare(test,predictions)
        if event == 28:
            events[str(event)]['workspace_v13_reference'] = metrics(test,t.incumbent_predictions(test,profiles,read(ROOT/'server/matching/personalized-model-config.json')))
        all_rows.extend(test)
        print(f'Temporal event {event} done: {len(train)} train, {len(test)} test',flush=True)
    result = {'events':events,'pooled':compare(all_rows,all_pred)}
    known = [i for i,r in enumerate(all_rows) if mbti(profiles[(r['event_id'],r['ranker_number'])])[0]]
    if known:
        result['known_choosers'] = compare([all_rows[i] for i in known],{k:np.asarray(v)[known] for k,v in all_pred.items()})
    predictions = [dict(r,scores={name:float(values[i]) for name,values in all_pred.items()}) for i,r in enumerate(all_rows)]
    return result,models,predictions


def strict_cv(rows, profiles):
    groups=np.asarray([r['ranker_number'] for r in rows])
    predictions={name:np.zeros(len(rows)) for name in MODELS}
    folds=[]
    for fold,(train_ids,test_ids) in enumerate(GroupKFold(n_splits=6,shuffle=True,random_state=2609).split(np.arange(len(rows)),groups=groups)):
        held={rows[i]['ranker_number'] for i in test_ids}
        train=[rows[i] for i in train_ids if rows[i]['ranked_number'] not in held]
        test=[rows[i] for i in test_ids]
        assert not any(r['ranker_number'] in held or r['ranked_number'] in held for r in train)
        for name in MODELS:
            predictions[name][test_ids]=Model(train,profiles,name).predict(test)
        folds.append({'fold':fold,'held_people':sorted(held),'train_directions':len(train),'test_directions':len(test)})
        print(f'Strict CV {fold+1}/6 done',flush=True)
    return {'overall':compare(rows,predictions),'folds':folds},[dict(r,scores={n:float(p[i]) for n,p in predictions.items()}) for i,r in enumerate(rows)]


def user7(rows, profiles):
    source=read(USER7)
    if isinstance(source,dict):
        source=source['profiles']
    for p in source:
        profiles[(0,p['assigned_number'])]=p
    labels={n:label for label,ns in LABELS.items() for n in ns}
    assert all((0,n) in profiles for n in [7,*labels])
    directions=[{'event_id':0,'ranker_number':a,'ranked_number':b} for n in sorted(labels) for a,b in [(7,n),(n,7)]]
    ai={r['participantNumber']:r['ai']['adjustment'] for r in read(ROOT/'tmp/training-2026-09-17/user7-runtime-ai-report.json')['rows']}
    output={n:{'participant_number':n,'label':labels[n],'mbti':mbti(profiles[(0,n)])[0],'historical_ai_adjustment':ai[n],'scores':{}} for n in labels}
    scores={}
    for mode in ['full','user7_purged']:
        train=[r for r in rows if mode=='full' or 7 not in [r['ranker_number'],r['ranked_number']]]
        for name in MODELS:
            scores[mode+'_'+name]=Model(train,profiles,name).predict(directions)
    for name,path in [('frozen_v12',ROOT/'tmp/training-2026-09-17/frozen-v12-config.json'),('workspace_v13',ROOT/'server/matching/personalized-model-config.json')]:
        scores[name]=t.incumbent_predictions(directions,profiles,read(path))
    for name,values in scores.items():
        for i,n in enumerate(sorted(labels)):
            direct,reverse=values[2*i]*100,values[2*i+1]*100
            mutual=math.sqrt(direct*reverse)
            output[n]['scores'][name]={'directional':float(direct),'mutual':float(mutual),'final_fixed_historical_ai':float(np.clip(mutual+ai[n],0,100))}
    tasks={'liked_vs_disliked':(['friendly','romantic'],['disliked']),'romantic_vs_disliked':(['romantic'],['disliked']),'friendly_vs_disliked':(['friendly'],['disliked']),'romantic_vs_friendly':(['romantic'],['friendly'])}
    results={}
    for name in scores:
        results[name]={}
        for task,(pos,neg) in tasks.items():
            ns=[n for n in labels if labels[n] in pos+neg]
            results[name][task]={kind:auc([labels[n] in pos for n in ns],[output[n]['scores'][name][kind] for n in ns]) for kind in ['directional','mutual','final_fixed_historical_ai']}
    return {'user7_type':mbti(profiles[(0,7)]),'coverage':len(output),'purged_directions':sum(7 in [r['ranker_number'],r['ranked_number']] for r in rows),'metrics':results,'rows':[output[n] for n in sorted(output)]}


def main():
    data=read(DATA)
    profiles={(int(p['event_id']),int(p['assigned_number'])):p for p in data['profiles']}
    rows=t.ranking_rows(data,[26,27,28],True)
    protocol={'date':'2026-09-23','models':MODELS,'alpha':10,'seed':2609,'primary':'Train 26 test 27; train 26+27 test 28. No future outcomes in training.','strict':'Six stable participant folds; purge held people as chooser and target.','mbti':'Four valid binary legacy survey answers, else regex-valid stored type, else unknown with shared features only. Unknown choosers have their own calibration reference, with global fallback if absent from training. No imputed MBTI.','types_only':'Ridge directed 16x16 type-pair and target-type features.','experts':'Same V12 shared features, fixed one-hot 16-type experts replacing learned two-way gate.','sensitivity':'Repeat temporal and strict checks excluding auto-saved ranking rows.','user7':'30 existing acquaintance labels, evaluation only; full and user7 incident-row-purged fits.','ai':'User7 fixed historical Sept17 AI adjustments, not claimed freshly hash-verified.','productionChanged':False,'dataset_sha256':hashlib.sha256(DATA.read_bytes()).hexdigest()}
    write('protocol.json',protocol)
    report={'protocol':protocol,'coverage':coverage(profiles,rows),'source_metadata':{k:data[k] for k in ['exported_at','event_ids','metadata','provenance'] if k in data}}
    report['temporal'],models,predictions=rolling(rows,profiles)
    write('temporal-predictions.json',predictions)
    report['strict_cv'],predictions=strict_cv(rows,profiles)
    write('strict-predictions.json',predictions)
    write('interim-report.json',report)
    manual=t.ranking_rows(data,[26,27,28],False)
    report['manual_temporal'],_,predictions=rolling(manual,profiles)
    write('manual-temporal-predictions.json',predictions)
    report['manual_strict'],predictions=strict_cv(manual,profiles)
    write('manual-strict-predictions.json',predictions)
    report['user7']=user7(rows,profiles)
    write('report.json',report)
    print(json.dumps({'coverage':report['coverage'],'temporal':report['temporal']['pooled'],'strict':report['strict_cv']['overall']},indent=2))


if __name__=='__main__':
    main()
