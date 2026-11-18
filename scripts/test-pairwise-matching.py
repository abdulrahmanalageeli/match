"""Offline nested evaluation of pairwise, factorized and personalized matchers.

Inputs are ignored, minimized exports. No database writes or production imports
are changed. User 7 labels are consulted only after all model selection finishes.
"""
import os
os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('MKL_NUM_THREADS', '1')
import argparse
import collections
import hashlib
import importlib.util
import json
import math
import pathlib
import time

import numpy as np
import torch
from scipy.optimize import minimize
from scipy.special import expit
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, ndcg_score
from sklearn.model_selection import GroupKFold

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/pairwise-2026-09-18'
SEED = 2609
torch.set_num_threads(1)
torch.set_num_interop_threads(1)
spec = importlib.util.spec_from_file_location('original_trainer', ROOT / 'scripts/train-personalized-compatibility.py')
t = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t)
SEMANTICS = json.loads((OUT / 'semantic-evidence.json').read_text(encoding='utf8'))
FAMILIES = ['linear', 'factor', 'semantic', 'personalized']
CONFIGS = [{'name': f'{family}-{reg}', 'family': family, 'reg': reg, 'rank': 4}
           for family in FAMILIES for reg in [0.003, 0.03]]
BASE = {'name': 'expandedK2', 'family': 'baseline'}


def dump(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf8')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def semantic(row):
    a, b = sorted([row['ranker_number'], row['ranked_number']])
    if row['event_id'] == 0:
        return SEMANTICS['user7'].get(str(b if a == 7 else a))
    return SEMANTICS['events'].get(f"{row['event_id']}:{a}:{b}")


def reverse(rows):
    return [{**r, 'ranker_number': r['ranked_number'], 'ranked_number': r['ranker_number']} for r in rows]


def profile_features(p):
    result = {f'{q}={t.answer(p, q)}': 1. for q in t.QUESTIONS}
    for f in t.focus_values(p):
        result[f'focus={f}'] = 1.
    return result


def ballot_groups(rows):
    groups = collections.defaultdict(list)
    for i, r in enumerate(rows):
        groups[(r['event_id'], r['ranker_number'])].append(i)
    return groups


def row_weights(rows):
    groups = ballot_groups(rows)
    appearances = collections.Counter(k[1] for k in groups)
    w = np.asarray([1 / (len(groups[(r['event_id'], r['ranker_number'])]) * appearances[r['ranker_number']]) for r in rows])
    return w / np.mean(w)


def comparisons(rows):
    """75% top-three ordering, 25% full ordering; equal total weight per person."""
    groups = ballot_groups(rows)
    appearances = collections.Counter(k[1] for k in groups)
    left, right, weights = [], [], []
    for key, ids in groups.items():
        pairs = [(i, j) for i in ids for j in ids if rows[i]['recorded_rank'] < rows[j]['recorded_rank']]
        if not pairs:
            continue
        cross = [(i, j) for i, j in pairs if rows[i]['rank'] <= 3 < rows[j]['rank']]
        for i, j in pairs:
            w = (0.25 / len(pairs) + (0.75 / len(cross) if (i, j) in cross else 0)) if cross else 1 / len(pairs)
            left.append(i)
            right.append(j)
            weights.append(w / appearances[key[1]])
    weights = np.asarray(weights)
    assert len(weights) and np.all(weights > 0)
    return np.asarray(left), np.asarray(right), weights / weights.sum()


class Pairwise:
    def __init__(self, config):
        self.config = config
        self.with_factor = config['family'] != 'linear'
        self.with_semantic = config['family'] in ['semantic', 'personalized']
        self.with_history = config['family'] == 'personalized'

    def pair_features(self, r, profiles):
        a, b = [profiles[(r['event_id'], r[k])] for k in ['ranker_number', 'ranked_number']]
        features = t.base_pair_features(a, b)
        if self.with_semantic:
            evidence = semantic(r)
            features['semantic:available'] = float(evidence is not None)
            for k in ['current_curiosity', 'hobbies', 'music', 'friend_description']:
                features['semantic:' + k] = evidence['values'][k] - 0.5 if evidence else 0.
        return features

    def matrices(self, rows, profiles, fit=False):
        features = [self.pair_features(r, profiles) for r in rows]
        if fit:
            self.pair_encoder = DictVectorizer(sparse=False)
            x = self.pair_encoder.fit_transform(features)
            self.profile_encoder = DictVectorizer(sparse=False)
            keys = sorted({(r['event_id'], r[k]) for r in rows for k in ['ranker_number', 'ranked_number']})
            encoded = self.profile_encoder.fit_transform([profile_features(profiles[k]) for k in keys])
            self.profile_mean = encoded.mean(axis=0)
            self.people = {n: i for i, n in enumerate(sorted({r['ranker_number'] for r in rows}))}
        else:
            x = self.pair_encoder.transform(features)
        a = self.profile_encoder.transform([profile_features(profiles[(r['event_id'], r['ranker_number'])]) for r in rows]) - self.profile_mean
        b = self.profile_encoder.transform([profile_features(profiles[(r['event_id'], r['ranked_number'])]) for r in rows]) - self.profile_mean
        # Unknown people receive exactly zero personal residual.
        ids = np.asarray([self.people.get(r['ranker_number'], len(self.people)) for r in rows])
        return [torch.tensor(m, dtype=torch.float64) for m in [x, a, b]] + [torch.tensor(ids, dtype=torch.long)]

    def score_tensors(self, mats, history=True):
        x, a, b, ids = mats
        scores = x @ self.w
        if self.with_factor:
            tastes = a @ self.u
            if self.with_history and history:
                padded = torch.cat([self.h, torch.zeros((1, self.config['rank']), dtype=torch.float64)], dim=0)
                tastes = tastes + padded[ids]
            scores = scores + (tastes * (b @ self.v)).sum(dim=1)
        return scores

    def fit(self, rows, profiles):
        torch.manual_seed(SEED)
        mats = self.matrices(rows, profiles, True)
        self.w = torch.nn.Parameter(torch.zeros(mats[0].shape[1], dtype=torch.float64))
        params = [self.w]
        if self.with_factor:
            shape = (mats[1].shape[1], self.config['rank'])
            self.u = torch.nn.Parameter(torch.randn(shape, dtype=torch.float64) * 0.025)
            self.v = torch.nn.Parameter(torch.randn(shape, dtype=torch.float64) * 0.025)
            params.extend([self.u, self.v])
        if self.with_history:
            self.h = torch.nn.Parameter(torch.zeros((len(self.people), self.config['rank']), dtype=torch.float64))
            params.append(self.h)
        left, right, weights = comparisons(rows)
        left, right = torch.tensor(left), torch.tensor(right)
        weights = torch.tensor(weights, dtype=torch.float64)
        optimizer = torch.optim.LBFGS(params, lr=1., max_iter=250, max_eval=320, history_size=12,
                                     tolerance_grad=1e-6, tolerance_change=1e-9, line_search_fn='strong_wolfe')
        self.calls = 0
        def closure():
            optimizer.zero_grad()
            scores = self.score_tensors(mats)
            loss = (torch.nn.functional.softplus(-(scores[left] - scores[right])) * weights).sum()
            penalty = self.w.square().sum()
            if self.with_factor:
                penalty = penalty + self.u.square().sum() + self.v.square().sum()
            if self.with_history:
                penalty = penalty + 10 * self.h.square().sum()
            loss = loss + 0.5 * self.config['reg'] * penalty
            loss.backward()
            self.last_loss = float(loss.detach())
            self.calls += 1
            return loss
        optimizer.step(closure)
        self.training_stats = {'comparisons': len(weights), 'loss': self.last_loss, 'evaluations': self.calls,
                               'maxGradient': max(float(p.grad.abs().max()) for p in params),
                               'linearParameters': self.w.numel(), 'factorNorm': float((self.u.square().sum() + self.v.square().sum()).detach()) if self.with_factor else 0.,
                               'personalNorm': float(self.h.square().sum().detach()) if self.with_history else 0.}
        assert np.isfinite(self.last_loss)
        return self

    def predict(self, rows, profiles, history=True):
        with torch.no_grad():
            return self.score_tensors(self.matrices(rows, profiles), history).numpy()

    def artifact(self):
        return {'config': self.config, 'pairFeatures': self.pair_encoder.get_feature_names_out().tolist(),
                'profileFeatures': self.profile_encoder.get_feature_names_out().tolist(), 'profileMean': self.profile_mean.tolist(),
                'linear': self.w.detach().numpy().tolist(),
                'chooserFactors': self.u.detach().numpy().tolist() if self.with_factor else None,
                'candidateFactors': self.v.detach().numpy().tolist() if self.with_factor else None,
                'personalFactors': {str(n): self.h[i].detach().numpy().tolist() for n, i in self.people.items()} if self.with_history else {},
                'training': self.training_stats}


class Baseline:
    def fit(self, rows, profiles):
        self.rows = rows
        self.bundle = t.fit_full(rows, profiles, 2, 10, .1, False)
        return self

    def predict(self, rows, profiles, history=True):
        return t.calibrated_predictions(self.bundle, self.rows, rows, profiles)[0]


def fit(config, rows, profiles):
    return (Baseline() if config['family'] == 'baseline' else Pairwise(config)).fit(rows, profiles)


def splits(rows, n):
    groups = np.asarray([r['ranker_number'] for r in rows])
    for train_ids, test_ids in GroupKFold(n_splits=n, shuffle=True, random_state=SEED).split(np.arange(len(rows)), groups=groups):
        held = {rows[i]['ranker_number'] for i in test_ids}
        train_ids = np.asarray([i for i in train_ids if rows[i]['ranked_number'] not in held])
        assert all(rows[i]['ranker_number'] not in held and rows[i]['ranked_number'] not in held for i in train_ids)
        yield train_ids, test_ids


def person_auc(rows, scores):
    people = collections.defaultdict(list)
    for (_, n), ids in ballot_groups(rows).items():
        labels = np.asarray([rows[i]['rank'] <= 3 for i in ids], dtype=int)
        if len(set(labels)) == 2:
            people[n].append(float(roc_auc_score(labels, np.asarray(scores)[ids])))
    return {n: float(np.mean(v)) for n, v in people.items()}


def objective(rows, scores):
    values = np.asarray(list(person_auc(rows, scores).values()))
    if not len(values):
        return -1.
    lower = np.sort(values)[:max(1, math.ceil(len(values) / 4))]
    return float(.8 * values.mean() + .2 * lower.mean())


def calibrator(rows, scores):
    # OOF scores only. A positive slope preserves each chooser's ordering.
    y = np.asarray([r['rank'] <= 3 for r in rows], dtype=float)
    x = np.asarray(scores)
    mean, scale = float(x.mean()), max(float(x.std()), 1e-6)
    z = (x - mean) / scale
    w = row_weights(rows); w /= w.sum()
    def loss(p):
        logits = p[0] + p[1] * z
        error = (expit(logits) - y) * w
        return float(np.sum(w * (np.logaddexp(0, logits) - y * logits)) + .005 * p[1]**2), np.array([error.sum(), (error * z).sum() + .01*p[1]])
    result = minimize(loss, np.array([-1., .5]), jac=True, method='L-BFGS-B', bounds=[(None, None), (0.01, None)])
    assert result.success
    return {'mean': mean, 'scale': scale, 'intercept': float(result.x[0]), 'slope': float(result.x[1])}


def calibrated(scores, cal):
    return expit(cal['intercept'] + cal['slope'] * (np.asarray(scores) - cal['mean']) / cal['scale'])


def pair_records(rows, forward, backward):
    lookup = {(r['event_id'], r['ranker_number'], r['ranked_number']): r for r in rows}
    result = []
    for i, r in enumerate(rows):
        # The lower-numbered chooser owns the pair's test fold. Both scores for
        # this pair come from that ONE model; neither incident outcome was fitted.
        if r['ranker_number'] > r['ranked_number']:
            continue
        other = lookup.get((r['event_id'], r['ranked_number'], r['ranker_number']))
        if not other:
            continue
        positive = r['rank'] <= 3 and other['rank'] <= 3
        extreme_negative = r['rank'] > r['candidate_count']/2 and other['rank'] > other['candidate_count']/2
        result.append({'event': r['event_id'], 'a': r['ranker_number'], 'b': r['ranked_number'],
                       'positive': int(positive), 'extreme': bool(positive or extreme_negative),
                       'forward': float(forward[i]), 'backward': float(backward[i])})
    return result


def mutual_features(pairs):
    scores = np.asarray([[p['forward'], p['backward']] for p in pairs])
    return np.sort(scores, axis=1)


def fit_mutual(rows, forward, backward):
    pairs = pair_records(rows, forward, backward)
    x = mutual_features(pairs)
    y = np.asarray([p['positive'] for p in pairs], dtype=float)
    counts = collections.Counter(n for p in pairs for n in [p['a'], p['b']])
    w = np.asarray([.5 * (1/counts[p['a']] + 1/counts[p['b']]) for p in pairs]); w /= w.sum()
    def loss(p):
        z = p[0] + x @ p[1:]
        error = w * (expit(z) - y)
        return float(np.sum(w * (np.logaddexp(0,z) - y*z)) + .005*np.sum(p[1:]**2)), np.r_[error.sum(), x.T @ error + .01*p[1:]]
    result = minimize(loss, np.array([-2.,1.,1.]), jac=True, method='L-BFGS-B', bounds=[(None,None),(0,None),(0,None)])
    assert result.success
    return {'intercept':float(result.x[0]),'weights':result.x[1:].tolist(),'pairs':len(pairs),'positives':int(y.sum())}


def mutual_predict(forward, backward, model):
    x = np.sort(np.column_stack([forward, backward]), axis=1)
    return expit(model['intercept'] + x @ np.asarray(model['weights']))


def tune(rows, profiles, label):
    configs = [BASE] + CONFIGS
    inner = {c['name']: {'forward':np.zeros(len(rows)), 'backward':np.zeros(len(rows))} for c in configs}
    for fold, (train_ids, test_ids) in enumerate(splits(rows, 3), 1):
        train = [rows[i] for i in train_ids]; test = [rows[i] for i in test_ids]
        for c in configs:
            model = fit(c, train, profiles)
            inner[c['name']]['forward'][test_ids] = model.predict(test, profiles)
            inner[c['name']]['backward'][test_ids] = model.predict(reverse(test), profiles)
        print(f'{label} inner {fold}/3', flush=True)
    choices = {'expandedK2':BASE}
    for family in FAMILIES:
        options = [c for c in CONFIGS if c['family'] == family]
        choices[family] = max(options, key=lambda c:(objective(rows, inner[c['name']]['forward']), c['reg']))
    criteria = {name:objective(rows, inner[c['name']]['forward']) for name,c in choices.items()}
    winner = max(choices, key=lambda name:criteria[name])
    choices['selected'] = choices[winner]
    calibrations = {name:calibrator(rows, inner[c['name']]['forward']) for name,c in choices.items()}
    combined = {name:{kind:calibrated(values, calibrations[name]) for kind,values in inner[c['name']].items()} for name,c in choices.items()}
    # A small convex blend is a separately evaluated challenger, never an oracle
    # switch chosen using an outer fold or User 7.
    candidates = [0., .25, .5, .75, 1.]
    blend = max(candidates, key=lambda w:(objective(rows, (1-w)*combined['expandedK2']['forward'] + w*combined['selected']['forward']), -w))
    combined['blend'] = {kind:(1-blend)*combined['expandedK2'][kind] + blend*combined['selected'][kind] for kind in ['forward','backward']}
    mutual = {name:fit_mutual(rows, p['forward'], p['backward']) for name,p in combined.items()}
    return {'choices':choices,'criteria':criteria,'winner':winner,'calibrations':calibrations,'blendWeight':blend,'mutual':mutual}


def train_predict(rows, test, profiles, tuning, keep=False):
    predictions, artifacts, cache = {}, {}, {}
    for name, config in tuning['choices'].items():
        if config['name'] not in cache:
            model = fit(config, rows, profiles)
            cache[config['name']] = model
        model = cache[config['name']]
        raw = model.predict(test, profiles)
        raw_back = model.predict(reverse(test), profiles)
        forward, backward = [calibrated(p, tuning['calibrations'][name]) for p in [raw,raw_back]]
        predictions[name] = {'raw':raw,'forward':forward,'backward':backward,
                             'mutualLearned':mutual_predict(forward,backward,tuning['mutual'][name])}
        if name == 'expandedK2':
            predictions[name]['legacy'] = raw
            predictions[name]['legacyBackward'] = raw_back
        if keep and config['family'] != 'baseline':
            artifacts[name] = model.artifact()
    w = tuning['blendWeight']
    predictions['blend'] = {kind:(1-w)*predictions['expandedK2'][kind] + w*predictions['selected'][kind] for kind in ['forward','backward']}
    predictions['blend']['raw'] = predictions['blend']['forward']
    predictions['blend']['mutualLearned'] = mutual_predict(predictions['blend']['forward'],predictions['blend']['backward'],tuning['mutual']['blend'])
    return predictions, artifacts, cache


def metrics(rows, scores, backward=None, learned=None):
    traditional = t.metrics(rows, scores)
    people = person_auc(rows, scores)
    values = np.asarray(list(people.values()))
    result = {**traditional,'personMeanAuc':float(values.mean()),'personMedianAuc':float(np.median(values)),
              'worstQuarterMeanAuc':float(np.sort(values)[:math.ceil(len(values)/4)].mean()),
              'peopleWithAuc':len(values),'perPersonAuc':{str(k):v for k,v in people.items()}}
    if backward is not None:
        pairs = pair_records(rows,scores,backward)
        pair_lookup = {(p['event'],p['a'],p['b']):p for p in pairs}
        if learned is not None:
            for r,s in zip(rows,learned):
                key = (r['event_id'],r['ranker_number'],r['ranked_number'])
                if key in pair_lookup: pair_lookup[key]['learned'] = float(s)
        for scope, subset in [('allPairs',pairs),('extremePairs',[p for p in pairs if p['extreme']])]:
            y = [p['positive'] for p in subset]
            result[scope] = {'pairs':len(y),'positive':sum(y),
                             'geometricAuc':float(roc_auc_score(y,[math.sqrt(max(0,p['forward']*p['backward'])) for p in subset])) if len(set(y))==2 else None,
                             'learnedAuc':float(roc_auc_score(y,[p['learned'] for p in subset])) if learned is not None and len(set(y))==2 else None}
    return result


def impact(rows, baseline, candidate):
    a,b = person_auc(rows,baseline),person_auc(rows,candidate)
    ids = sorted(a.keys() & b.keys()); delta = np.asarray([b[n]-a[n] for n in ids])
    rng = np.random.default_rng(SEED)
    boot = rng.choice(delta, size=(5000,len(delta)),replace=True).mean(axis=1)
    eps=1e-12
    return {'people':len(ids),'improved':int(sum(delta>eps)),'declined':int(sum(delta<-eps)),'unchanged':int(sum(abs(delta)<=eps)),
            'meanDelta':float(delta.mean()),'bootstrap95Ci':np.quantile(boot,[.025,.975]).tolist(),
            'declineAtLeast005':int(sum(delta <= -.05)),
            'participants':[{'number':n,'baseline':a[n],'candidate':b[n],'delta':b[n]-a[n]} for n in ids]}


def evaluate(rows, profiles, tag, outer=6):
    predictions, fold_report = {}, []
    for fold,(train_ids,test_ids) in enumerate(splits(rows,outer),1):
        train=[rows[i] for i in train_ids];test=[rows[i] for i in test_ids]
        tuning=tune(train,profiles,f'{tag} outer {fold}/{outer}')
        pred,_,_=train_predict(train,test,profiles,tuning)
        for name,values in pred.items():
            if name not in predictions:predictions[name]={kind:np.zeros(len(rows)) for kind in values}
            for kind,values_ in values.items():predictions[name][kind][test_ids]=values_
        fold_report.append({'fold':fold,'trainingDirections':len(train),'testDirections':len(test),**tuning})
        print(f'{tag} outer {fold}/{outer} complete; inner winner={tuning["winner"]}',flush=True)
        dump(f'{tag}-progress.json',fold_report)
    reports={}
    for name,p in predictions.items():
        reports[name]=metrics(rows,p['forward'],p['backward'],p['mutualLearned'])
        reports[name]['impactVsExpandedK2']=impact(rows,predictions['expandedK2']['forward'],p['forward'])
    base=predictions['expandedK2']
    reports['expandedK2OriginalCalibration']=metrics(rows,base['legacy'],base['legacyBackward'])
    reports['expandedK2OriginalCalibration']['originalTwoFoldReciprocalAuc']=t.metrics(rows,base['legacy'])['mutual_auc']
    serial=[{**{k:r[k] for k in ['event_id','ranker_number','ranked_number','rank','candidate_count','auto_saved']},
             'predictions':{name:{kind:float(values[i]) for kind,values in p.items()} for name,p in predictions.items()}} for i,r in enumerate(rows)]
    dump(f'{tag}-predictions.json',serial)
    result={'folds':fold_report,'models':reports}
    dump(f'{tag}-report.json',result)
    return result,predictions


def temporal(rows,profiles):
    train=[r for r in rows if r['event_id']<28];test=[r for r in rows if r['event_id']==28]
    tuning=tune(train,profiles,'temporal')
    pred,_,_=train_predict(train,test,profiles,tuning)
    report={'tuning':tuning,'models':{}}
    prior={r['ranker_number'] for r in train}
    for name,p in pred.items():
        report['models'][name]=metrics(test,p['forward'],p['backward'],p['mutualLearned'])
        report['models'][name]['impactVsExpandedK2']=impact(test,pred['expandedK2']['forward'],p['forward'])
        for label,is_known in [('returning',True),('new',False)]:
            ids=[i for i,r in enumerate(test) if (r['ranker_number'] in prior)==is_known]
            if ids:report['models'][name][label]=metrics([test[i] for i in ids],p['forward'][ids])
    dump('temporal-report.json',report)
    return report


def user7(rows,profiles):
    # All choices fixed from event rankings before reading benchmark categories.
    current=json.loads((ROOT/'.tmp-pairwise-user7-0-personalization.json').read_text(encoding='utf8'))
    profiles={**profiles,**{(0,p['assigned_number']):p for p in current}}
    nums=sorted(p['assigned_number'] for p in current if p['assigned_number']!=7)
    test=[{'event_id':0,'ranker_number':7,'ranked_number':n} for n in nums]
    results={}
    for scope in ['full','purged']:
        train=[r for r in rows if scope=='full' or 7 not in [r['ranker_number'],r['ranked_number']]]
        tuning=tune(train,profiles,'user7 '+scope)
        pred,artifacts,models=train_predict(train,test,profiles,tuning,True)
        for name,p in pred.items():
            p['geometric']=np.sqrt(p['forward']*p['backward'])
            p['geometricFixedAI']=np.clip(100*p['geometric']+np.asarray([semantic(r)['adjustment'] for r in test]),0,100)
            if name=='expandedK2':
                p['legacyFinal']=np.clip(100*np.sqrt(p['legacy']*p['legacyBackward'])+np.asarray([semantic(r)['adjustment'] for r in test]),0,100)
        chosen=tuning['choices']['personalized']
        personal=models[chosen['name']]
        nohistory=personal.predict(test,profiles,False)
        pred['personalized']['withoutHistory']=calibrated(nohistory,tuning['calibrations']['personalized'])
        dump(f'user7-{scope}-tuning.json',tuning)
        dump(f'candidate-{scope}-artifacts.json',{'tuning':tuning,'models':artifacts,'offlineOnly':True})
        results[scope]={'tuning':tuning,'scores':{name:{kind:p.tolist() for kind,p in values.items()} for name,values in pred.items()}}
    # Only now read previously documented benchmark labels. They never affect fit.
    old=json.loads((ROOT/'tmp/training-2026-09-17/user7-runtime-ai-report.json').read_text(encoding='utf8'))
    labels={p['participantNumber']:p['label'] for p in old['rows']}
    tasks={'likedVsDisliked':(['romantic','friendly'],['disliked']), 'romanticVsDisliked':(['romantic'],['disliked']),
           'friendlyVsDisliked':(['friendly'],['disliked']), 'romanticVsFriendly':(['romantic'],['friendly'])}
    for scope,result in results.items():
        result['metrics']={}
        for name,scores in result['scores'].items():
            result['metrics'][name]={}
            for kind,values in scores.items():
                result['metrics'][name][kind]={}
                for task,(pos,neg) in tasks.items():
                    ids=[i for i,n in enumerate(nums) if labels[n] in pos+neg]
                    result['metrics'][name][kind][task]=float(roc_auc_score([int(labels[nums[i]] in pos) for i in ids],np.asarray(values)[ids]))
    result={'numbers':nums,'labelsUsedForSelection':False,'models':results,'originalRuntimeBenchmark':old['models'],
            'note':'Benchmark is repeatedly inspected development evidence, not a fresh test. Full fits include historical User 7 event rankings; purged fits exclude every incident row. Directional AUC is aligned to these one-sided labels. Fixed-AI diagnostics use calibrated top-three probabilities, not original percentile scale.'}
    dump('user7-report.json',result)
    return result


def self_test():
    # Verify the implemented low-rank score against its explicit feature formula.
    rng=np.random.default_rng(SEED)
    a=rng.normal(size=(3,5)); b=rng.normal(size=(3,5)); u=rng.normal(size=(5,4)); v=rng.normal(size=(5,4))
    factor=((a@u)*(b@v)).sum(axis=1)
    explicit=np.asarray([a[i]@(u@v.T)@b[i] for i in range(3)])
    assert np.allclose(factor,explicit,atol=1e-10)
    # Pairwise loss decreases as preferred-minus-disliked score increases.
    assert np.logaddexp(0,-2)<np.logaddexp(0,0)<np.logaddexp(0,2)
    m={'intercept':-1,'weights':[1,2]}
    assert np.allclose(mutual_predict([.2,.8],[.6,.3],m),mutual_predict([.6,.3],[.2,.8],m))
    print('Formula, preference direction and mutual symmetry checks passed',flush=True)


def main():
    args=argparse.ArgumentParser();args.add_argument('--stage',choices=['all','primary','manual','temporal','user7','smoke'],default='all');args=args.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    self_test()
    data=json.loads((ROOT/'.tmp-pairwise-events26-28-personalization.json').read_text(encoding='utf8'))
    profiles={(p['event_id'],p['assigned_number']):p for p in data['profiles']}
    rows=t.ranking_rows(data,[26,27,28],True)
    reference=json.loads((ROOT/'tmp/training-2026-09-17/candidate-config.json').read_text(encoding='utf8'))
    assert digest(data)==reference['training']['datasetSha256']
    dump('protocol.json',{'datasetSha256':digest(data),'scriptSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'configs':CONFIGS,'outerFolds':6,'innerFolds':3,'seed':SEED,'selection':'0.8 mean participant top-three AUC + 0.2 worst-quarter mean; ties favor stronger regularization',
        'pairwiseLoss':'75% top-three versus rest, 25% all strict ordering; equal person then ballot weight',
        'mutual':'Nonnegative logistic weights on min/max directional probabilities, trained on inner OOF predictions. Positive=both top three; all other exposed reciprocal pairs negative.',
        'semanticsCoverage':SEMANTICS['coverage'],'productionChanged':False,
        'versions':{'numpy':np.__version__,'torch':torch.__version__,'sklearn':__import__('sklearn').__version__}})
    if args.stage=='smoke':
        ids,testids=next(splits(rows,6));train=[rows[i] for i in ids];test=[rows[i] for i in testids]
        for c in CONFIGS:
            started=time.time();model=fit(c,train,profiles);p=model.predict(test,profiles)
            assert np.isfinite(p).all()
            print(c['name'],round(time.time()-started,2),model.training_stats,flush=True)
        return
    if args.stage in ['all','primary']:evaluate(rows,profiles,'primary')
    if args.stage in ['all','manual']:evaluate(t.ranking_rows(data,[26,27,28],False),profiles,'manual')
    if args.stage in ['all','temporal']:temporal(rows,profiles)
    if args.stage in ['all','user7']:user7(rows,profiles)


if __name__=='__main__':main()
