"""Timing-audited survey-neighbor feedback transfer; offline only.

Primary evidence uses only feedback from PREVIOUS EVENTS, known before the
current event's saved seating creation time. The separate within-event mode
uses an explicitly imperfect earliest-target-round-submission proxy. It never
claims that proxy is a true encounter start. No benchmark labels are loaded.
"""
import argparse
import collections
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, ndcg_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'tmp/survey-search-2026-09-23'
SOURCE = ROOT/'.tmp-survey-search-groups-personalization.json'
OLDER = ROOT/'.tmp-survey-search-groups25-personalization.json'


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


nl = load_module('live_survey_nonlinear', Path(__file__).with_name('nonlinear.py'))
trainer = load_module('live_survey_original', ROOT/'scripts/train-personalized-compatibility.py')
TRAITS = [q for q in nl.QUESTIONS if q not in {
    'match_similarity_preference', 'minimum_partner_religious_commitment',
    'intent_goal', *[f'mbti_{i}' for i in range(1, 5)],
}]
EXPERIENCE = {'uncomfortable': 0., 'neutral': 1., 'good': 2., 'great': 3.}
CONFIGS = [dict(name=f'{mode}_b{beta}_s{shrink}', mode=mode, beta=beta, shrink=shrink)
           for mode in ['peer_residual', 'own_analog', 'combined']
           for beta in [2, 4, 8] for shrink in [1, 5, 10]]
CONFIGS += [dict(name=f'target_prior_b4_s{s}', mode='target_prior', beta=4, shrink=s)
            for s in [1, 5, 10]]
PUBLISHED = 'peer_residual_b8_s10'
BASELINES = [dict(name='unweighted_peer', mode='peer_residual', beta=0, shrink=10),
             dict(name='reviewer_prior', mode='prior', beta=0, shrink=10),
             dict(name='global_prior', mode='global', beta=0, shrink=10)]


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/name).write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False)+'\n', encoding='utf8')


def stamp(value):
    if not value:
        return None
    return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()


def safe_auc(y, values):
    return float(roc_auc_score(y, values)) if len(set(y)) == 2 else None


class Experiment:
    def __init__(self, data, older=None):
        self.data = data
        self.profiles = {(int(p['event_id']), int(p['assigned_number'])): p
                         for p in (older or {}).get('profiles', []) + data['profiles']}
        self.answers = {k: nl.answers(p) for k, p in self.profiles.items()}
        self.feedback = []
        for raw in (older or {}).get('group_feedback', []) + data['group_feedback']:
            if raw['experience'] not in EXPERIENCE:
                continue
            r = {**raw, 'event_id': int(raw['event_id']), 'ranker_number': int(raw['reviewer_number']),
                 'ranked_number': int(raw['member_number']), 'round': int(raw['group_round'])}
            r['y'] = float(EXPERIENCE[r['experience']] >= 2)
            r['ordinal'] = EXPERIENCE[r['experience']]
            r['known_at'] = max(stamp(r['submitted_at']) or float('inf'),
                                stamp(r.get('updated_at') or r['submitted_at']) or float('inf'))
            if all((r['event_id'], r[k]) in self.profiles for k in ['ranker_number', 'ranked_number']):
                self.feedback.append(r)
        self.cutoffs = {}
        for e in data['event_ids']:
            times = [stamp(a['created_at']) for a in data['assignments'] if a['event_id'] == e]
            self.cutoffs[e] = min(t for t in times if t is not None)
        self.round_cutoffs = {}
        for e, rd in {(r['event_id'], r['round']) for r in self.feedback}:
            self.round_cutoffs[e, rd] = min(stamp(r['submitted_at']) for r in self.feedback
                                           if r['event_id'] == e and r['round'] == rd)
        self.sim_cache = {}

    def verified(self, key, cutoff):
        # Conservatively decline reconstructed/current mixtures with a later
        # survey update: their whole-profile historical timing is not proven.
        value = stamp(self.profiles[key].get('survey_data_updated_at'))
        return value is not None and value <= cutoff

    def similarity(self, ka, kb):
        cache_key = (ka, kb)
        if cache_key not in self.sim_cache:
            a, b = self.answers[ka], self.answers[kb]
            values = []
            for q in TRAITS:
                if a[q] == 'MISSING' or b[q] == 'MISSING':
                    continue
                ordinal = nl.ORDINAL.get(q)
                if ordinal and a[q] in ordinal and b[q] in ordinal:
                    values.append(1-abs(ordinal[a[q]]-ordinal[b[q]]))
                else:
                    values.append(float(a[q] == b[q]))
            self.sim_cache[cache_key] = float(np.mean(values)) if len(values) >= 12 else 0.
        return self.sim_cache[cache_key]

    def contexts(self, mode, strict=False, lag_minutes=0):
        output = []
        for r in self.feedback:
            e, rd = r['event_id'], r['round']
            if e not in self.data['event_ids'] or (mode == 'within_proxy' and rd <= 1):
                continue
            cutoff = self.cutoffs[e] if mode == 'previous_event' else self.round_cutoffs[e, rd]-lag_minutes*60
            ak, ck = (e, r['ranker_number']), (e, r['ranked_number'])
            endpoint_verified = self.verified(ak, cutoff) and self.verified(ck, cutoff)
            if strict and not endpoint_verified:
                continue
            history = []
            query_pair = {r['ranker_number'], r['ranked_number']}
            for h in self.feedback:
                if h['known_at'] >= cutoff:
                    continue
                if mode == 'previous_event' and h['event_id'] >= e:
                    continue
                if mode == 'within_proxy' and (h['event_id'] != e or h['round'] >= rd):
                    continue
                # A previously rated exact pair is not a novel matching test.
                if {h['ranker_number'], h['ranked_number']} == query_pair:
                    continue
                if strict and not all(self.verified((h['event_id'], h[k]), cutoff)
                                      for k in ['ranker_number', 'ranked_number']):
                    continue
                history.append(h)
            counts = collections.defaultdict(list)
            for h in history:
                counts[h['ranker_number']].append(h['y'])
            prior = (sum(h['y'] for h in history)+.75*10)/(len(history)+10)
            means = {p: (sum(v)+10*prior)/(len(v)+10) for p, v in counts.items()}
            own_prior = means.get(r['ranker_number'], prior)
            peers = [h for h in history if h['ranked_number'] == r['ranked_number']
                     and h['ranker_number'] != r['ranker_number']]
            own = [h for h in history if h['ranker_number'] == r['ranker_number']]
            peer_terms = [(self.similarity(ak, (h['event_id'], h['ranker_number'])),
                           h['y']-means[h['ranker_number']], h['y']) for h in peers]
            own_terms = [(self.similarity(ck, (h['event_id'], h['ranked_number'])),
                          h['y']-own_prior, h['y']) for h in own]
            output.append({'row': r, 'cutoff': cutoff, 'endpoint_profile_time_verified': endpoint_verified,
                           'prior': prior, 'own_prior': own_prior, 'peer_terms': peer_terms,
                           'own_terms': own_terms, 'history_count': len(history),
                           'prior_reviewers': len(counts), 'peer_count': len(peers), 'own_count': len(own)})
        return output


def predict(config, contexts):
    result = []
    for c in contexts:
        if config['mode'] == 'global':
            result.append(c['prior'])
            continue
        score = c['own_prior']
        beta, shrink = config['beta'], config['shrink']
        def correction(terms):
            weights = [s**beta for s, _, _ in terms]
            return sum(w*t[1] for w, t in zip(weights, terms))/(sum(weights)+shrink)
        if config['mode'] in {'peer_residual', 'target_prior', 'combined'}:
            score += correction(c['peer_terms'])*(0.5 if config['mode'] == 'combined' else 1)
        if config['mode'] in {'own_analog', 'combined'}:
            score += correction(c['own_terms'])*(0.5 if config['mode'] == 'combined' else 1)
        if config['mode'] == 'target_prior':
            score += sum(t[2]-c['prior'] for t in c['peer_terms'])/(len(c['peer_terms'])+shrink)
        result.append(float(np.clip(score, .01, .99)))
    return np.asarray(result)


def metrics(contexts, scores):
    if not contexts:
        return {'rows': 0}
    rows = [c['row'] for c in contexts]
    y = np.asarray([r['y'] for r in rows])
    scores = np.asarray(scores)
    groups = collections.defaultdict(list)
    for i, r in enumerate(rows):
        groups[r['event_id'], r['ranker_number']].append(i)
    aucs, ndcgs, top1 = [], [], []
    for ids in groups.values():
        value = safe_auc(y[ids], scores[ids])
        if value is not None:
            aucs.append(value)
        if len(ids) > 1:
            ndcgs.append(float(ndcg_score([[rows[i]['ordinal'] for i in ids]], [scores[ids]], k=3)))
        best = np.asarray(ids)[scores[ids] == np.max(scores[ids])]
        top1.append(float(np.mean(y[best])))
    return {'rows': len(rows), 'reviewers': len(groups), 'positive': int(sum(y)),
            'negative': int(len(y)-sum(y)), 'positive_rate': float(np.mean(y)),
            'auc': safe_auc(y, scores), 'brier': float(brier_score_loss(y, scores)),
            'within_reviewer_auc': float(np.mean(aucs)) if aucs else None,
            'reviewers_with_both_classes': len(aucs),
            'ordinal_ndcg3': float(np.mean(ndcgs)) if ndcgs else None,
            'top1_positive_rate': float(np.mean(top1)),
            'mean_predicted_probability': float(np.mean(scores)),
            'peer_supported_rows': sum(c['peer_count'] > 0 for c in contexts),
            'own_history_rows': sum(c['own_count'] > 0 for c in contexts),
            'both_endpoint_profile_time_verified': sum(c['endpoint_profile_time_verified'] for c in contexts)}


def selective(contexts, scores):
    scores = np.asarray(scores)
    result = {}
    for label, threshold in [(f'probability_at_least_{x}', x) for x in [.85, .9, .95]] + [
        (f'top_fraction_{f}_including_ties', float(np.quantile(scores, 1-f))) for f in [.1, .25]
    ]:
        ids = np.flatnonzero(scores >= threshold)
        result[label] = {'threshold': threshold, 'coverage': len(ids)/max(1, len(scores)),
                         **metrics([contexts[i] for i in ids], scores[ids])}
    return result


def choose(contexts, candidates):
    # This is exclusively development-event selection. No event27/28 labels.
    eligible = [c for c in contexts if c['peer_count'] or c['own_count']]
    if len(eligible) < 15 or len(set(c['row']['y'] for c in eligible)) < 2:
        return PUBLISHED, {'reason': 'Insufficient development history; published formula frozen.'}
    evaluations = {cfg['name']: metrics(eligible, predict(cfg, eligible)) for cfg in candidates}
    selected = min(evaluations, key=lambda name: (evaluations[name]['brier'], name))
    return selected, {'criterion': 'minimum development Brier on history-supported rows',
                      'metrics': evaluations}


def paired_bootstrap(contexts, left, right, iterations=1200):
    if not contexts:
        return None
    y = np.asarray([c['row']['y'] for c in contexts])
    groups = collections.defaultdict(list)
    for i, c in enumerate(contexts):
        groups[c['row']['ranker_number']].append(i)
    ids = list(groups)
    rng = np.random.default_rng(260923)
    auc_delta, brier_delta = [], []
    left, right = np.asarray(left), np.asarray(right)
    for _ in range(iterations):
        selected = np.concatenate([groups[ids[j]] for j in rng.integers(0, len(ids), len(ids))])
        yy = y[selected]
        if len(set(yy)) == 2:
            auc_delta.append(float(roc_auc_score(yy, left[selected])-roc_auc_score(yy, right[selected])))
        brier_delta.append(float(np.mean((left[selected]-yy)**2-(right[selected]-yy)**2)))
    return {'method': 'paired reviewer-cluster bootstrap; pooled event27/28', 'iterations': iterations,
            'auc_delta95': np.quantile(auc_delta, [.025, .975]).tolist() if auc_delta else None,
            'brier_delta95': np.quantile(brier_delta, [.025, .975]).tolist()}


def run():
    data = read(SOURCE)
    older = read(OLDER) if OLDER.exists() else None
    # Older group exports can reuse the already minimized historical profiles.
    if older and not older.get('profiles'):
        older['profiles'] = read(ROOT/'.tmp-survey-search-older-personalization.json')['profiles']
    exp = Experiment(data, older)
    frozen = read(ROOT/'tmp/training-2026-09-17/frozen-v12-config.json')
    all_main = exp.contexts('previous_event')
    dev = [c for c in all_main if c['row']['event_id'] == 26]
    selected, selection = choose(dev, CONFIGS)
    active = {c['name']: c for c in CONFIGS+BASELINES}
    # Fit a probability mapping for frozen V12 on event26 only. Its raw score
    # is a percentile, not a positive-conversation probability.
    dv = trainer.incumbent_predictions([c['row'] for c in dev], exp.profiles, frozen)
    calibration = LogisticRegression(C=1, random_state=260923).fit(dv[:, None], [c['row']['y'] for c in dev])
    report = {'purpose': 'survey-based transfer of observed conversation reactions, not romance prediction',
              'primary': 'Previous-event feedback only, strictly before event seating creation; exact past pair excluded.',
              'within_event_caveat': 'Earliest target-round feedback is AFTER some interactions; this is an exploratory upper-bound timing proxy, never prospective validation.',
              'profile_caveat': data.get('profile_reconstruction'),
              'strict_profile_rule': 'Both query profiles and all used historical survey profiles have survey_data_updated_at <= cutoff; reconstructed later mixtures excluded.',
              'traits': TRAITS, 'config_count': len(CONFIGS), 'configs': CONFIGS,
              'selected_config': selected, 'selection': selection,
              'frozen_v12_calibration': {'training_event':26, 'coefficient':float(calibration.coef_[0,0]),
                                        'intercept':float(calibration.intercept_[0])},
              'feedback_counts': dict(collections.Counter(str(r['event_id']) for r in exp.feedback)),
              'exposure_counts': dict(collections.Counter(str(r['event_id']) for r in data.get('exposures', []))),
              'outcome_selection_caveat': 'Only submitted feedback is observed. Missing feedback is not a negative. No randomized assignment or unobserved-candidate outcome exists.',
              'timing_audit': {'all_feedback_submitted_equal_updated': all(r['submitted_at']==r['updated_at'] for r in exp.feedback),
                               'event_cutoffs_utc': {str(e): dt.datetime.fromtimestamp(t, dt.timezone.utc).isoformat() for e,t in exp.cutoffs.items()}},
              'analyses': {}}
    output_rows = []
    for mode, strict, lag in [('previous_event', False, 0), ('previous_event', True, 0),
                              ('within_proxy', False, 0), ('within_proxy', True, 0),
                              ('within_proxy', False, 10)]:
        tag = f'{mode}_'+('strict_profiles' if strict else 'all_profiles')+f'_lag{lag}'
        contexts = exp.contexts(mode, strict, lag)
        # Within-event variants may tune solely on26; primary config is frozen
        # from the prior-event26 test, independently of all later-event labels.
        chosen = selected
        mode_dev = [c for c in contexts if c['row']['event_id']==26]
        mode_selection = selection
        if mode == 'within_proxy' or strict:
            chosen, mode_selection = choose(mode_dev, CONFIGS)
        mode_calibration = calibration
        if strict and len(set(c['row']['y'] for c in mode_dev)) == 2:
            mode_dv = trainer.incumbent_predictions([c['row'] for c in mode_dev], exp.profiles, frozen)
            mode_calibration = LogisticRegression(C=1, random_state=260923).fit(
                mode_dv[:, None], [c['row']['y'] for c in mode_dev])
        holdout = [c for c in contexts if c['row']['event_id'] in [27,28]]
        if not holdout:
            report['analyses'][tag] = {'rows': 0}
            continue
        predictions = {name: predict(cfg, holdout) for name,cfg in active.items()}
        v12 = trainer.incumbent_predictions([c['row'] for c in holdout], exp.profiles, frozen)
        predictions['frozen_v12'] = mode_calibration.predict_proba(v12[:,None])[:,1]
        # Choose the pure peer baseline's shrinkage to match the selected model
        # so a weighting comparison does not accidentally compare shrinkage.
        matched_peer = {**active[chosen], 'mode':'peer_residual', 'beta':0}
        predictions['unweighted_peer_matched_shrink'] = predict(matched_peer, holdout)
        predictions['unweighted_transfer_matched'] = predict({**active[chosen], 'beta':0}, holdout)
        names = list(dict.fromkeys([chosen, PUBLISHED, 'unweighted_peer', 'unweighted_peer_matched_shrink',
                                   'unweighted_transfer_matched', 'reviewer_prior', 'global_prior', 'frozen_v12']))
        result = {'selected_config': chosen, 'development_selection': mode_selection,
                  'frozen_v12_calibration_coefficient': float(mode_calibration.coef_[0,0]),
                  'frozen_v12_raw_order_auc': safe_auc([c['row']['y'] for c in holdout], v12),
                  'all_candidates_exploratory': {name: metrics(holdout, values) for name,values in predictions.items()},
                  'pooled': {name: metrics(holdout, predictions[name]) for name in names},
                  'events': {}, 'supported_subsets': {}}
        for event in [27,28]:
            ids = [i for i,c in enumerate(holdout) if c['row']['event_id']==event]
            result['events'][str(event)] = {name: metrics([holdout[i] for i in ids], predictions[name][ids]) for name in names}
        for subset, ids in [('peer_supported', [i for i,c in enumerate(holdout) if c['peer_count']>0]),
                            ('peer_at_least3', [i for i,c in enumerate(holdout) if c['peer_count']>=3]),
                            ('own_supported', [i for i,c in enumerate(holdout) if c['own_count']>0])]:
            result['supported_subsets'][subset] = {name: metrics([holdout[i] for i in ids], predictions[name][ids]) for name in names}
        result['selective'] = {name: selective(holdout, predictions[name]) for name in [chosen, 'frozen_v12', 'global_prior']}
        if mode == 'previous_event':
            result['selected_vs_v12_uncertainty'] = paired_bootstrap(holdout, predictions[chosen], predictions['frozen_v12'])
            result['selected_vs_peer_uncertainty'] = paired_bootstrap(holdout, predictions[chosen], predictions['unweighted_peer_matched_shrink'])
            result['selected_vs_same_model_without_survey_weighting_uncertainty'] = paired_bootstrap(
                holdout, predictions[chosen], predictions['unweighted_transfer_matched'])
        report['analyses'][tag] = result
        for i,c in enumerate(holdout):
            output_rows.append({'analysis':tag, 'event_id':c['row']['event_id'], 'round':c['row']['round'],
                'ranker_number':c['row']['ranker_number'], 'ranked_number':c['row']['ranked_number'],
                'positive':c['row']['y'], 'ordinal':c['row']['ordinal'],
                'cutoff_utc':dt.datetime.fromtimestamp(c['cutoff'],dt.timezone.utc).isoformat(),
                'peer_count':c['peer_count'], 'own_count':c['own_count'],
                'endpoint_profile_time_verified':c['endpoint_profile_time_verified'],
                'scores':{name:float(predictions[name][i]) for name in names}})
        print(tag, 'selected', chosen, 'rows', len(holdout), 'selected_metrics', json.dumps(result['pooled'][chosen]), flush=True)
    write('live-learning-report.json', report)
    write('live-learning-predictions.json', output_rows)
    return report


def selftest():
    # Deliberately include future edits and same-round information: neither may
    # enter the historical profile-neighbor terms.
    answers = {q:'A' for q in TRAITS}
    profiles = [{'event_id':e, 'assigned_number':p, 'answers':answers,
                 'survey_data_updated_at':'2026-01-01T00:00:00Z'} for e in [25,26] for p in [1,2,3,4]]
    def fb(e,a,b,rd,when,updated=None):
        return dict(event_id=e,reviewer_number=a,member_number=b,group_round=rd,
                    experience='good',submitted_at=when,updated_at=updated or when)
    data = {'profiles':profiles,'event_ids':[26],
            'assignments':[{'event_id':26,'created_at':'2026-02-01T00:00:00Z'}],
            'group_feedback':[fb(25,3,2,1,'2026-01-20T00:00:00Z'),
                              fb(25,4,2,1,'2026-01-20T00:00:00Z','2026-02-05T00:00:00Z'),
                              fb(26,1,2,1,'2026-02-02T00:00:00Z'),
                              fb(26,1,3,2,'2026-02-02T01:00:00Z')]}
    exp=Experiment(data)
    context=exp.contexts('previous_event')[0]
    assert context['peer_count']==1 and context['history_count']==1
    assert exp.contexts('within_proxy')[0]['history_count']==1
    assert np.isfinite(predict(CONFIGS[0],[context])).all()
    assert all('intent' not in q and 'religious' not in q for q in TRAITS)
    print('Timing, later-edit exclusion, and survey-input smoke tests passed.',flush=True)


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--selftest',action='store_true')
    args=parser.parse_args()
    selftest() if args.selftest else run()
