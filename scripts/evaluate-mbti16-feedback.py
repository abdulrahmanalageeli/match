"""Offline one-to-one outcome test for the fixed MBTI16 experiment.

Only previous-event outcomes train each model. No database writes, production
changes, acquaintance-label training, or feedback-driven parameter selection.
"""
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mbti_experiment', ROOT / 'scripts/evaluate-mbti16.py')
e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e)
np, Ridge, DictVectorizer = e.np, e.Ridge, e.DictVectorizer


def feedback_rows(data, profiles):
    kept, excluded = [], collections.Counter()
    seen = set()
    for source in data['one_to_one_feedback']:
        row = dict(source)
        event, chooser, target = [int(row[k]) for k in ['event_id', 'ranker_number', 'ranked_number']]
        key = (event, chooser, target, int(row['phase']))
        assert key not in seen, f'Duplicate directed phase response: {key}'
        seen.add(key)
        if event not in [26, 27, 28]:
            excluded['other_event'] += 1
            continue
        if row.get('partner_in_event_roster') is not True or chooser == target:
            excluded['invalid_partner'] += 1
            continue
        if not all((event, n) in profiles for n in [chooser, target]):
            excluded['missing_profile'] += 1
            continue
        if row.get('meetingOccurred') is False or row.get('meetingStatus') not in [None, 'met']:
            excluded['explicit_did_not_meet'] += 1
            continue
        value = row.get('compatibilityRate')
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value) or not 0 <= value <= 100:
            excluded['missing_or_invalid_rating'] += 1
            continue
        if not isinstance(row.get('wantConnect'), bool):
            excluded['missing_connect_outcome'] += 1
            continue
        row.update(event_id=event, ranker_number=chooser, ranked_number=target,
                   y=float(value) / 100, explicit_met=row.get('meetingOccurred') is True or row.get('meetingStatus') == 'met')
        kept.append(row)
    return kept, dict(excluded)


class JointModel(e.Model):
    """Fixed 50/50 source weighting; k2 gate still learns from rankings only."""
    def __init__(self, rankings, feedback, profiles, kind):
        assert rankings and feedback
        self.kind, self.profiles = kind, profiles
        rows = rankings + feedback
        # Keep total effective weight equal to ranking-only, preserving Ridge
        # regularization strength while giving each source one half of mass.
        weights = np.r_[np.full(len(rankings), .5), np.full(len(feedback), len(rankings) / (2 * len(feedback)))]
        if kind == 'v12_recipe_k2':
            instances = {(r['event_id'], r['ranker_number']) for r in rankings}
            gate = e.t.fit_gate(instances, rankings, profiles, 2, .1)
            memberships = e.t.memberships_for(profiles, gate)
            vectorizer = DictVectorizer(sparse=True)
            x = vectorizer.fit_transform([
                e.t.pair_features(profiles[(r['event_id'], r['ranker_number'])],
                                  profiles[(r['event_id'], r['ranked_number'])],
                                  memberships[(r['event_id'], r['ranker_number'])])
                for r in rows])
            model = Ridge(alpha=10, solver='lsqr').fit(x, [r['y'] for r in rows], sample_weight=weights)
            self.bundle = dict(gate=gate, memberships=memberships, vectorizer=vectorizer, model=model)
        else:
            self.vectorizer = DictVectorizer(sparse=True)
            x = self.vectorizer.fit_transform([self.feat(r) for r in rows])
            self.model = Ridge(alpha=10, solver='lsqr').fit(x, [r['y'] for r in rows], sample_weight=weights)
        # Same reference population as ranking-only: past ranking exposures.
        raw = self.raw(rankings)
        self.global_reference = sorted(float(x) for x in raw)
        self.references = collections.defaultdict(list)
        for row, score in zip(rankings, raw):
            self.references[self.group(row)].append(float(score))


def outcome_metrics(rows, scores):
    if not rows:
        return dict(directions=0, people=0, positive=0, negative=0, want_connect_auc=None,
                    compatibility_spearman=None, within_person_spearman=None, informative_people=0)
    labels = [r['wantConnect'] for r in rows]
    ratings = [r['compatibilityRate'] for r in rows]
    grouped = collections.defaultdict(list)
    for row, score in zip(rows, scores):
        grouped[row['ranker_number']].append((row['compatibilityRate'], float(score)))
    correlations = [e.correlation([x[0] for x in values], [x[1] for x in values]) for values in grouped.values()]
    correlations = [x for x in correlations if x is not None]
    return dict(directions=len(rows), people=len(grouped), positive=sum(labels), negative=len(labels)-sum(labels),
                want_connect_auc=e.auc(labels, scores), compatibility_spearman=e.correlation(ratings, scores),
                within_person_spearman=float(np.mean(correlations)) if correlations else None,
                informative_people=len(correlations))


def bootstrap(rows, predictions, count=2000):
    """Paired stable-chooser cluster bootstrap, holding fitted models fixed."""
    by_person = collections.defaultdict(list)
    for i, row in enumerate(rows):
        by_person[row['ranker_number']].append(i)
    if len(by_person) < 2:
        return {}
    groups = list(by_person.values())
    rng = np.random.default_rng(2609)
    labels = np.asarray([r['wantConnect'] for r in rows])
    ratings = np.asarray([r['compatibilityRate'] for r in rows])
    boot = {name: collections.defaultdict(list) for name in predictions if name != 'v12_recipe_k2'}
    for _ in range(count):
        ids = np.concatenate([groups[i] for i in rng.integers(0, len(groups), len(groups))])
        base = np.asarray(predictions['v12_recipe_k2'])[ids]
        base_auc, base_corr = e.auc(labels[ids].tolist(), base), e.correlation(ratings[ids].tolist(), base.tolist())
        for name in boot:
            values = np.asarray(predictions[name])[ids]
            auc, corr = e.auc(labels[ids].tolist(), values), e.correlation(ratings[ids].tolist(), values.tolist())
            if auc is not None and base_auc is not None:
                boot[name]['want_connect_auc_delta'].append(auc-base_auc)
            if corr is not None and base_corr is not None:
                boot[name]['compatibility_spearman_delta'].append(corr-base_corr)
    return {name:{metric:{'bootstrap95':np.quantile(values,[.025,.975]).tolist(),'valid_resamples':len(values)}
                  for metric,values in metrics.items()} for name,metrics in boot.items()}


def compare(rows, predictions, with_bootstrap=True):
    result = {'models':{name:outcome_metrics(rows, scores) for name,scores in predictions.items()}}
    if rows and with_bootstrap:
        result['vs_k2'] = bootstrap(rows, predictions)
    return result


def add_frozen_reference(report, saved, feedback, profiles):
    """Cheap deterministic artifact replay; also usable after an earlier run."""
    config = e.read(ROOT / 'tmp/training-2026-09-17/frozen-v12-config.json')
    values = e.t.incumbent_predictions(saved, profiles, config)
    report['protocol']['frozen_reference'] = {
        'version':config['version'],
        'description':'Original frozen V12 Event26 artifact evaluated directionally on the same Event27/28 feedback; no refitting and no fixed AI correction.',
    }
    for row, value in zip(saved, values):
        row['reference_scores'] = {'frozen_v12_directional':float(value)}
    report['ranking_only']['pooled']['models']['frozen_v12_directional'] = outcome_metrics(saved,values)
    for event in [27,28]:
        ids = [i for i,r in enumerate(saved) if r['event_id']==event]
        report['ranking_only']['events'][str(event)]['models']['frozen_v12_directional'] = outcome_metrics([saved[i] for i in ids],values[ids])
        explicit = [i for i in ids if saved[i]['explicit_met']]
        report['ranking_only']['events'][str(event)]['explicit_met_only']['models']['frozen_v12_directional'] = outcome_metrics([saved[i] for i in explicit],values[explicit])
    for subset,predicate in [
        ('explicit_met_only',lambda r:r['explicit_met']),
        ('known_chooser_mbti',lambda r:e.mbti(profiles[(r['event_id'],r['ranker_number'])])[0] is not None),
    ]:
        ids = [i for i,r in enumerate(saved) if predicate(r)]
        report['ranking_only'][subset]['models']['frozen_v12_directional'] = outcome_metrics([saved[i] for i in ids],values[ids])
    report['recorded_operational_score_availability'] = {
        'events27_28_present':sum(isinstance(r.get('assigned_score'),(int,float)) for r in feedback if r['event_id'] in [27,28]),
        'note':'The export contains assigned scores only for Event26 (V7). No recorded operational score comparison is possible on the Event27/28 temporal test.',
    }


def references_only():
    data = e.read(e.DATA)
    profiles = {(int(p['event_id']),int(p['assigned_number'])):p for p in data['profiles']}
    feedback,_ = feedback_rows(data,profiles)
    report,saved = e.read(e.OUT/'feedback-report.json'),e.read(e.OUT/'feedback-predictions.json')
    add_frozen_reference(report,saved,feedback,profiles)
    e.write('feedback-predictions.json',saved)
    e.write('feedback-report.json',report)
    print(json.dumps(report['ranking_only']['pooled'],indent=2))


def main():
    data = e.read(e.DATA)
    profiles = {(int(p['event_id']),int(p['assigned_number'])):p for p in data['profiles']}
    rankings = e.t.ranking_rows(data, [26,27,28], True)
    feedback, excluded = feedback_rows(data, profiles)
    report = {
        'protocol': {
            'dataset_sha256':hashlib.sha256(e.DATA.read_bytes()).hexdigest(),
            'temporal':'Train events 26, test 27; train 26+27, test 28. No test-event labels enter any fit or calibration.',
            'primary':'Fit only previous event rankings; evaluate directed actual one-to-one outcomes.',
            'joint_sensitivity':'Fixed exploratory 50/50 ranking-percentile and compatibilityRate/100 Ridge training. Gate learns past rankings only. Total training weight equals ranking-only; references are past rankings only. wantConnect is evaluation-only.',
            'meeting_policy':'Exclude explicit did-not-meet; legacy missing meeting flags with valid submitted ratings assumed met. Also report explicit-met subset.',
            'scores':'Directional per-group empirical percentiles, not liking probabilities; no historical AI generated or applied.',
            'timing_limit':'Event-order retrospective test. Exact feedback submission timestamps unavailable; match_row_updated_at belongs to whole match row and cannot prove the stored outcome was available before the next event.',
            'bootstrap':'2000 paired stable-chooser cluster resamples, fixed predictions. Accounts for repeated responses by chooser but not all shared-partner dependence or model-training uncertainty.',
            'user7':'Acquaintance labels are never loaded or used.',
            'production_changed':False,
        },
        'coverage':{'source_directions':len(data['one_to_one_feedback']),'retained':len(feedback),'excluded':excluded,'events':{}},
        'ranking_only':{'events':{}}, 'joint_50_50':{'events':{}},
    }
    for event in [26,27,28]:
        rows = [r for r in feedback if r['event_id']==event]
        report['coverage']['events'][str(event)] = {
            'directions':len(rows),'people':len({r['ranker_number'] for r in rows}),
            'explicit_met':sum(r['explicit_met'] for r in rows),'legacy_assumed_met':sum(not r['explicit_met'] for r in rows),
            'positive':sum(r['wantConnect'] for r in rows),'negative':sum(not r['wantConnect'] for r in rows),
            'known_chooser_mbti':sum(e.mbti(profiles[(event,r['ranker_number'])])[0] is not None for r in rows),
        }
    pooled_rows = []
    pooled = {mode:{name:[] for name in e.MODELS} for mode in ['ranking_only','joint_50_50']}
    saved = []
    for event in [27,28]:
        train_rankings = [r for r in rankings if r['event_id']<event]
        train_feedback = [r for r in feedback if r['event_id']<event]
        test = [r for r in feedback if r['event_id']==event]
        assert all(r['event_id'] < event for r in train_rankings + train_feedback)
        event_predictions = {}
        for mode in pooled:
            predictions = {}
            for name in e.MODELS:
                model = e.Model(train_rankings,profiles,name) if mode=='ranking_only' else JointModel(train_rankings,train_feedback,profiles,name)
                predictions[name] = model.predict(test)
                pooled[mode][name].extend(predictions[name].tolist())
            event_predictions[mode] = predictions
            report[mode]['events'][str(event)] = compare(test,predictions)
            report[mode]['events'][str(event)]['training'] = {'ranking_directions':len(train_rankings),'feedback_directions':len(train_feedback) if mode=='joint_50_50' else 0}
            explicit = [i for i,r in enumerate(test) if r['explicit_met']]
            report[mode]['events'][str(event)]['explicit_met_only'] = compare([test[i] for i in explicit],{k:v[explicit] for k,v in predictions.items()},False)
            print(f'Feedback {mode} train <{event}, test {len(test)} directions complete',flush=True)
        for i,row in enumerate(test):
            saved.append({k:row[k] for k in ['event_id','ranker_number','ranked_number','phase','compatibilityRate','wantConnect','explicit_met']} | {
                'scores':{mode:{name:float(values[i]) for name,values in predictions.items()} for mode,predictions in event_predictions.items()}})
        pooled_rows.extend(test)
        e.write('feedback-interim-report.json',report)
    for mode,predictions in pooled.items():
        report[mode]['pooled'] = compare(pooled_rows,predictions)
        for subset, predicate in [
            ('explicit_met_only',lambda r:r['explicit_met']),
            ('known_chooser_mbti',lambda r:e.mbti(profiles[(r['event_id'],r['ranker_number'])])[0] is not None),
        ]:
            ids = [i for i,r in enumerate(pooled_rows) if predicate(r)]
            report[mode][subset] = compare([pooled_rows[i] for i in ids],{k:np.asarray(v)[ids] for k,v in predictions.items()},False)
    add_frozen_reference(report,saved,feedback,profiles)
    e.write('feedback-predictions.json',saved)
    e.write('feedback-report.json',report)
    print(json.dumps({'coverage':report['coverage'],'ranking_only':report['ranking_only']['pooled'],'joint_50_50':report['joint_50_50']['pooled']},indent=2),flush=True)


if __name__=='__main__':
    references_only() if sys.argv[1:]==['--references-only'] else main()
