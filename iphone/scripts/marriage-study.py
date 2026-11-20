"""Offline paired-model evaluation. See docs/marriage-study-protocol.md."""
import argparse
from collections import Counter
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path

import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


CATALOG = Path(__file__).resolve().parents[1] / 'src/compatibility/catalog.json'
catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
CATEGORIES = [c['id'] for c in catalog['categories']]
TOPICS = {d['id']: d['category'] for d in catalog['dimensions']}
PRACTICAL = ['practical', 'practical_available', *CATEGORIES]
ALL = [*PRACTICAL, 'personality_available', 'personality']
TRAIT_CATALOG = CATALOG.with_name('personality-catalog.json')
ITEMS = json.loads(TRAIT_CATALOG.read_text(encoding='utf-8'))
DOMAINS = sorted({item['domain'] for item in ITEMS})
STATES = ['conditional','one_sided','different','missing','inapplicable']
DETAIL = [f'{key}_{status}' for key in TOPICS for status in STATES] + [
    f'{domain}_{field}' for domain in DOMAINS for field in ('self_difference','preference_coverage','mean_gap','worst_gap')]


def instant(value):
    date = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if date.utcoffset() is None:
        raise ValueError('Timestamps must have a timezone')
    return date


def records(path):
    with path.open(encoding='utf-8-sig') as source:
        for line in source:
            if line.strip():
                yield json.loads(line)


def score(value):
    if value is None:
        return [0.5, 0]
    if type(value) not in (int, float) or not 0 <= value <= 100:
        raise ValueError('Score outside [0,100]')
    return [value / 100, 1]


def features(row):
    # Use the existing two-way comparison for each practical topic.
    covered, aligned, ids = Counter(), Counter(), set()
    for topic in row['practical_topics']:
        key, status = topic['id'], topic['status']
        if key in ids or key not in TOPICS or status not in {'aligned','one_sided','different','conditional','missing'}:
            raise ValueError('Unexpected practical topic or version')
        ids.add(key)
        if status != 'missing':
            covered[TOPICS[key]] += 1
            aligned[TOPICS[key]] += status == 'aligned'
    proportions = [aligned[c] / covered[c] if covered[c] else 0.5 for c in CATEGORIES]
    fit, available = score(row['personality_score'])
    return score(row['practical_score']) + proportions + [available, fit]


def load_followup(path):
    result = {}
    if path:
        for record in records(path):
            key = (record['request_id'], record['side'])
            if key in result or key[1] not in {'requester','recipient'} or record['married_by_day365'] not in {'yes','no','unsure'}:
                raise ValueError('Expected one current, valid report per side')
            result[key] = (instant(record['answered_at']), record['married_by_day365'])
    return result


def detail_features(row):
    topics = {topic['id']:topic['status'] for topic in row['practical_topics']}
    detail = [float(topics.get(topic,'inapplicable')==status) for topic in TOPICS for status in STATES]
    profiles = [row['requester_traits'],row['recipient_traits']]
    ranges = {'A':(1,2),'C':(2,4),'E':(4,5)}
    for domain in DOMAINS:
        means = []
        for answers in profiles:
            points = []
            for item in ITEMS:
                if item['domain'] == domain:
                    value = answers[item['id']]
                    if value not in ('A','B','C','D','E'):
                        raise ValueError('Invalid personality response')
                    point = ord(value)-ord('A')+1
                    points.append(6-point if item['reverse'] else point)
            means.append(sum(points)/len(points))
        gaps = []
        for answers,partner in zip(profiles,reversed(means)):
            preference = answers.get('partner_'+domain)
            if preference is not None:
                low,high = ranges[preference]
                gaps.append(max(0,low-partner,partner-high)/3)
        detail.extend([abs(means[0]-means[1])/4,len(gaps)/2,
                       sum(gaps)/len(gaps) if gaps else 0,max(gaps,default=0)])
    return detail


def outcome(row, endpoint, start, close, followup):
    if endpoint == 'week':
        end = start + timedelta(days=14)
        if close and close <= start + timedelta(days=7):
            return None, None
        votes = [row['requester_potential'], row['recipient_potential']]
        if any(v not in (None, 'too_early', 'yes', 'no') for v in votes):
            raise ValueError('Unexpected marriage-potential code')
        label = 0 if 'no' in votes else 1 if votes == ['yes','yes'] else None
        return min(end, close) if close else end, label
    horizon = start + timedelta(days=365)
    end = horizon + timedelta(days=30)
    votes = []
    for side in ('requester', 'recipient'):
        report = followup.get((row['request_id'], side))
        if report:
            when, vote = report
            if not horizon <= when < end:
                raise ValueError('Annual report outside its frozen follow-up window')
            votes.append(vote)
    label = 1 if votes == ['yes','yes'] else 0 if votes == ['no','no'] else None
    return end, label


def metrics(predictions, labels):
    residual = predictions - labels
    groups = np.minimum((predictions*5).astype(int),4)
    calibration = [{'band':int(b), 'n':int(sum(groups==b)), 'predicted':float(predictions[groups==b].mean()),
                    'observed':float(labels[groups==b].mean())} for b in np.unique(groups)]
    return {'brier': float(np.mean(residual ** 2)), 'mean_prediction': float(np.mean(predictions)),
            'observed_rate': float(np.mean(labels)), 'calibration_quintiles_of_scale':calibration,
            'auc': float(roc_auc_score(labels, predictions)) if len(set(labels)) == 2 else None}


def component_interval(pairs, known, differences):
    # Pairs sharing either member belong to the same resampling unit.
    parent = {}
    def root(person):
        parent.setdefault(person,person)
        while parent[person] != person:
            parent[person] = parent[parent[person]]
            person = parent[person]
        return person
    for a,b in pairs:
        parent[root(a)] = root(b)
    totals, counts = Counter(), Counter()
    for pair,diff in zip((p for p,k in zip(pairs,known) if k),differences):
        key = root(pair[0]); totals[key] += float(diff); counts[key] += 1
    keys = sorted(counts)
    result = {'independent_test_components':len(keys),'largest_share':max(counts.values())/sum(counts.values()),'ci95':None}
    if len(keys) >= 20 and result['largest_share'] <= 0.25:
        rng = np.random.default_rng(20261120)
        sums = np.array([totals[k] for k in keys]); sizes = np.array([counts[k] for k in keys])
        draws = []
        for _ in range(2000):
            i = rng.integers(len(keys),size=len(keys)); draws.append(sums[i].sum()/sizes[i].sum())
        result['ci95'] = np.quantile(draws,[.025,.975]).tolist()
    return result


def evaluate(rows, followup, endpoint, cutoff, as_of, exploratory=False):
    if as_of <= cutoff:
        raise ValueError('as-of must follow cutoff')
    flow, seen, earlier_members, training, later = Counter(), set(), set(), [], []
    for row in rows:
        key = row['request_id']
        if key in seen or row['requester_group'] == row['recipient_group']:
            raise ValueError('Duplicate introduction or self-pair')
        seen.add(key)
        members = (row['requester_group'], row['recipient_group'])
        if not all(isinstance(m,str) and m for m in members):
            raise ValueError('Missing member group')
        start = instant(row['connected_at'])
        close = instant(row['closed_at']) if row['closed_at'] else None
        if close and close < start:
            raise ValueError('Closure before connection')
        if start >= as_of:
            flow['after_data_lock'] += 1
            continue
        if start < cutoff:
            earlier_members.update(members)
        end, label = outcome(row, endpoint, start, close, followup)
        if end is None:
            flow['closed_before_week_window'] += 1
        elif start < cutoff and end > cutoff:
            flow['straddles_cutoff'] += 1
        elif end > as_of:
            flow['immature'] += 1
        elif start < cutoff:
            flow['train_unknown' if label is None else 'train_resolved'] += 1
            if label is not None:
                training.append((features(row) + (detail_features(row) if exploratory else []),label))
        else:
            later.append((members,features(row) + (detail_features(row) if exploratory else []),label))
    if {key for key, _ in followup} - seen:
        raise ValueError('Annual report without eligible baseline in this export')
    test, test_members = [], []
    for members, x, label in later:
        if earlier_members.intersection(members):
            flow['test_returning_excluded'] += 1
        else:
            flow['test_unknown' if label is None else 'test_resolved'] += 1
            test.append((x,label))
            test_members.append(members)
    result = {'flow':dict(flow), 'training_outcomes':dict(Counter(y for _,y in training)),
              'test_outcomes':dict(Counter(y for _,y in test if y is not None))}
    if len(result['training_outcomes']) < 2 or not flow['test_resolved']:
        return {**result,'status':'insufficient observed outcomes for evaluation'}
    x = np.asarray([v for v,_ in training]); y = np.asarray([v for _,v in training])
    xt = np.asarray([v for v,_ in test]); yt = np.asarray([float(v) if v is not None else np.nan for _,v in test])
    known = np.isfinite(yt)
    predictions = {'base_rate': np.full(len(test),np.mean(y))}
    models = [('practical',PRACTICAL),('with_availability',ALL[:-1]),('with_personality',ALL)]
    if exploratory:
        models.append(('exploratory_topic_and_trait_detail',ALL+DETAIL))
    for name, cols in models:
        model = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, solver='lbfgs', max_iter=1000))
        model.fit(x[:,:len(cols)], y)
        predictions[name] = model.predict_proba(xt[:,:len(cols)])[:,1]
    base, full = predictions['with_availability'], predictions['with_personality']
    dif0, dif1 = base**2-full**2, (1-base)**2-(1-full)**2
    resolved = (base[known]-yt[known])**2-(full[known]-yt[known])**2
    bounds = [(resolved.sum()+f(dif0[~known],dif1[~known]).sum())/len(test) for f in (np.minimum,np.maximum)]
    return {**result, 'status':'descriptive held-out evaluation',
            'metrics':{name:metrics(p[known],yt[known]) for name,p in predictions.items()},
            'brier_gain_from_personality':float(resolved.mean()),
            'paired_uncertainty':component_interval(test_members,known,resolved),
            'gain_bounds_including_unknowns':list(map(float,bounds))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('--endpoint',choices=['week','marriage365'],required=True)
    parser.add_argument('--followup',type=Path)
    parser.add_argument('--cutoff',required=True)
    parser.add_argument('--exploratory',action='store_true',help='Also evaluate the detailed questionnaire model')
    parser.add_argument('--as-of',required=True)
    args = parser.parse_args()
    if (args.endpoint == 'marriage365') != bool(args.followup):
        parser.error('Supply --followup only and always for marriage365 (an empty file records zero replies).')
    report = evaluate(records(args.baseline),load_followup(args.followup),args.endpoint,instant(args.cutoff),instant(args.as_of),args.exploratory)
    report.update(endpoint=args.endpoint,cutoff=args.cutoff,as_of=args.as_of,features=ALL+DETAIL if args.exploratory else ALL,
                  sklearn=sklearn.__version__,numpy=np.__version__)
    report['sha256'] = {}
    for name,path in [('baseline',args.baseline),('followup',args.followup),('catalog',CATALOG),('trait_catalog',TRAIT_CATALOG),('analysis',Path(__file__))]:
        if path:
            with path.open('rb') as source:
                report['sha256'][name] = hashlib.file_digest(source,'sha256').hexdigest()
    print(json.dumps(report,indent=2,allow_nan=False))


if __name__ == '__main__':
    main()
