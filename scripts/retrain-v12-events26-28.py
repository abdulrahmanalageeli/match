"""Replay the frozen V12 recipe on Events 26-28; never activate the candidate.

Run with the pinned environment in personalized-compatibility-requirements.txt.
Inputs are local, ignored, privacy-minimized exports. User 7 labels are evaluation
only. The output directory contains candidate artifacts and numerical reports.
"""
import collections
import hashlib
import importlib.util
import json
import math
import pathlib
import platform

import numpy as np
from sklearn.model_selection import GroupKFold
from sklearn.metrics import roc_auc_score

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp' / 'training-2026-09-17'
EVENTS = [26, 27, 28]
METRICS = ['pairwise', 'spearman', 'ndcg3', 'top3_auc', 'mutual_auc']
LABELS = {
    'romantic': [975, 1455, 1470, 1524, 1566, 1586, 1623],
    'friendly': [16, 23, 122, 223, 287, 325, 539, 567, 1372, 1381, 1414, 1688, 1775],
    'disliked': [101, 277, 312, 892, 1101, 1137, 1293, 1527, 1606, 1853],
}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


t = load_module('v12_trainer', ROOT / 'scripts' / 'train-personalized-compatibility.py')


def write(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf8')


def hash_json(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def fit(rows, profiles):
    return t.fit_full(rows, profiles, 2, 10, 0.1, False)


def config_for(bundle, rows, profiles, incumbent, version):
    gate = bundle['gate']
    names = gate.profile_vectorizer.get_feature_names_out()
    raw = t.raw_predictions(bundle, rows, profiles)
    return {
        'version': version,
        'trainedEventIds': sorted({r['event_id'] for r in rows}),
        'calibrationLabel': 'events26-28-all-directions-archetype-ranking-percentile',
        'schema': incumbent['schema'],
        'archetypes': t.aligned_archetypes(bundle, profiles, incumbent),
        'gate': {
            'classes': [int(x) for x in gate.classifier.classes_],
            'intercepts': [round(float(x), 12) for x in gate.classifier.intercept_],
            'coefficients': [{n: round(float(c), 12) for n, c in zip(names, cs) if abs(float(c)) >= 1e-12} for cs in gate.classifier.coef_],
        },
        'score': {'intercept': round(float(bundle['model'].intercept_), 12), 'coefficients': t.coefficient_map(bundle)},
        'calibration': {str(k): [round(float(x), 12) for x in v] for k, v in t.build_calibration(rows, raw, bundle['memberships'], 2).items()},
    }


def paired_cv(rows, profiles, purge_targets):
    """Same test rows/folds for old-data and expanded-data training recipes."""
    groups = np.asarray([r['ranker_number'] for r in rows])
    predictions = {name: {kind: np.zeros(len(rows)) for kind in ['raw', 'calibrated']} for name in ['event26Only', 'events26to28']}
    folds = []
    splitter = GroupKFold(n_splits=6, shuffle=True, random_state=2609)
    for fold, (train_ids, test_ids) in enumerate(splitter.split(np.arange(len(rows)), groups=groups), 1):
        held = {rows[i]['ranker_number'] for i in test_ids}
        training = [rows[i] for i in train_ids if not purge_targets or rows[i]['ranked_number'] not in held]
        test = [rows[i] for i in test_ids]
        record = {'fold': fold, 'testDirections': len(test), 'heldOutPeople': len(held)}
        for name in predictions:
            train = [r for r in training if name == 'events26to28' or r['event_id'] == 26]
            assert not held.intersection(r['ranker_number'] for r in train)
            if purge_targets:
                assert not held.intersection(r['ranked_number'] for r in train)
            bundle = fit(train, profiles)
            predictions[name]['raw'][test_ids] = t.raw_predictions(bundle, test, profiles)
            predictions[name]['calibrated'][test_ids], _ = t.calibrated_predictions(bundle, train, test, profiles)
            record[name + 'TrainingDirections'] = len(train)
        folds.append(record)
        print(f'CV purge_targets={purge_targets} fold={fold}/6 complete', flush=True)
    return predictions, folds


def comparison(rows, left, right):
    a, b = t.metrics(rows, left), t.metrics(rows, right)
    # Resample stable participants, not repeated event ballots independently.
    grouped = collections.defaultdict(list)
    la, lb = t.per_ballot_ndcg3(rows, left), t.per_ballot_ndcg3(rows, right)
    for key in la:
        grouped[key[1]].append(lb[key] - la[key])
    values = np.asarray([np.mean(v) for v in grouped.values()])
    rng = np.random.default_rng(2609)
    boot = np.mean(rng.choice(values, size=(5000, len(values)), replace=True), axis=1)
    return {
        'baseline': a, 'candidate': b,
        'delta': {k: b[k] - a[k] if a[k] is not None and b[k] is not None else None for k in METRICS},
        'participantNdcg3': {
            'people': len(values), 'improved': int(sum(values > 0)), 'declined': int(sum(values < 0)),
            'meanDelta': float(np.mean(values)), 'medianDelta': float(np.median(values)),
            'bootstrap95Ci': [float(x) for x in np.quantile(boot, [0.025, 0.975])],
            'note': 'Participant bootstrap of fixed OOF predictions; does not refit pipeline.',
        },
    }


def slices(rows, left, right, original_people):
    predicates = {
        'all': lambda r: True,
        **{f'event{e}': lambda r, e=e: r['event_id'] == e for e in EVENTS},
        'newEvents27and28': lambda r: r['event_id'] in [27, 28],
        'peopleNotInEvent26': lambda r: r['ranker_number'] not in original_people,
    }
    result = {}
    for name, predicate in predicates.items():
        indices = [i for i, r in enumerate(rows) if predicate(r)]
        result[name] = comparison([rows[i] for i in indices], left[indices], right[indices])
    return result


def user7_eval(rows, profiles, incumbent, candidate, current):
    source = json.loads((ROOT / '.tmp-user7-20260917-personalization.json').read_text(encoding='utf8'))
    user_profiles = {(0, p['assigned_number']): p for p in source}
    profiles = {**profiles, **user_profiles}
    labels = {n: label for label, nums in LABELS.items() for n in nums}
    assert set(labels) | {7} == {p['assigned_number'] for p in source}
    directions = [{'event_id': 0, 'ranker_number': a, 'ranked_number': b} for n in sorted(labels) for a, b in [(7, n), (n, 7)]]
    configs = {'frozenV12': incumbent, 'candidateFull': candidate, 'workingTreeV13': current}
    for name, events in [('v12User7Purged', [26]), ('candidateUser7Purged', EVENTS)]:
        train = [r for r in rows if r['event_id'] in events and 7 not in [r['ranker_number'], r['ranked_number']]]
        bundle = fit(train, profiles)
        configs[name] = config_for(bundle, train, profiles, incumbent, name)
    scores = {}
    for name, config in configs.items():
        # Production rounds gate memberships to six decimals before scoring.
        # Preserve full precision in the original training/CV recipe, but replay
        # this runtime behavior for the operational User 7 score comparison.
        pred = []
        for row in directions:
            a = profiles[(0, row['ranker_number'])]
            b = profiles[(0, row['ranked_number'])]
            memberships = np.round(t.incumbent_memberships(a, config), 6)
            raw = config['score']['intercept'] + t.dot(config['score']['coefficients'], t.pair_features(a, b, memberships))
            reference = config['calibration'][str(int(np.argmax(memberships)))]
            pred.append(round(max(0.01, min(0.99, t.empirical_percentile(raw, reference))) * 100, 6))
        scores[name] = {n: {'directional': float(pred[2*i]), 'mutual': round(math.sqrt(float(pred[2*i] * pred[2*i+1])), 6)} for i, n in enumerate(sorted(labels))}
        if name in ['v12User7Purged', 'candidateUser7Purged']:
            write(name + '-config.json', config)
    genders = {p['assigned_number']: p.get('gender') for p in source}
    tasks = {
        'likedVsDisliked': (LABELS['romantic'] + LABELS['friendly'], LABELS['disliked']),
        'romanticVsDisliked': (LABELS['romantic'], LABELS['disliked']),
        'friendlyVsDisliked': (LABELS['friendly'], LABELS['disliked']),
        'romanticVsFriendly': (LABELS['romantic'], LABELS['friendly']),
        'romanticVsEveryoneElse': (LABELS['romantic'], LABELS['friendly'] + LABELS['disliked']),
    }
    romantic_genders = {genders[n] for n in LABELS['romantic']}
    if len(romantic_genders) == 1 and None not in romantic_genders:
        tasks['romanticVsOthersSameGender'] = (LABELS['romantic'], [n for n in LABELS['friendly'] + LABELS['disliked'] if genders[n] in romantic_genders])
    reports = {}
    for name, values in scores.items():
        reports[name] = {}
        for kind in ['directional', 'mutual']:
            metrics = {}
            for task, (pos, neg) in tasks.items():
                metrics[task] = {'positive': len(pos), 'negative': len(neg), 'auc': float(roc_auc_score([1]*len(pos) + [0]*len(neg), [values[n][kind] for n in pos+neg]))}
            metrics['groupMeans'] = {label: float(np.mean([values[n][kind] for n in nums])) for label, nums in LABELS.items()}
            reports[name][kind] = metrics
    per_person = [{'participantNumber': n, 'label': labels[n], **{name: values[n] for name, values in scores.items()}} for n in sorted(labels)]
    return {
        'labelSource': 'docs/matching-user7-updated-analysis-2026-09-01.md',
        'labelsUsedForTrainingOrSelection': False,
        'excluded': [70, 1778], 'coverage': len(labels),
        'user7IncidentTrainingDirectionsExcludedInPurgedDiagnostic': sum(7 in [r['ranker_number'], r['ranked_number']] for r in rows),
        'note': 'Full fits have prior exposure to User 7 event rankings. Purged fits remove all User 7 incident rows across training events. Labels describe User 7 preferences, not reciprocal outcomes; directional score is the aligned diagnostic.',
        'models': reports, 'people': per_person,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / '.tmp-events26-28-personalization.json').read_text(encoding='utf8'))
    incumbent = t.load_incumbent(None)
    current = json.loads((ROOT / 'server/matching/personalized-model-config.json').read_text(encoding='utf8'))
    profiles = {(p['event_id'], p['assigned_number']): p for p in data['profiles']}
    rows = t.ranking_rows(data, EVENTS, True)
    assert len(profiles) == len(data['profiles'])
    assert len(rows) == len(data['rankings'])
    assert len({(r['event_id'], r['ranker_number'], r['ranked_number']) for r in rows}) == len(rows)
    assert all((r['event_id'], n) in profiles for r in rows for n in [r['ranker_number'], r['ranked_number']])
    original_people = {n for e, n in profiles if e == 26}
    reproduction = t.reproduction_diagnostics(rows, profiles, incumbent)
    assert reproduction['numericallyEquivalentAtEightDecimals'] and reproduction['interceptDelta'] < 1e-8
    print('V12 coefficient reproduction passed', flush=True)
    audit = load_module('v12_audit', ROOT / 'tmp/audit-v12-treatment-events26-27.py')
    reproduction_full, _ = audit.event26_reproduction(t, rows, profiles, incumbent)
    assert reproduction_full['numericallyEquivalentAtEightDecimals']
    assert max(abs(v) for v in reproduction_full['legacyRawCvMetricDeltaFromArtifact'].values()) < 1e-10
    write('reproduction.json', reproduction_full)
    bundle = fit(rows, profiles)
    candidate = config_for(bundle, rows, profiles, incumbent, '2026-09-17-candidate-v12-recipe-events26-28')
    candidate['training'] = {
        'selected': {'k': 2, 'alpha': 10, 'gate_c': 0.1},
        'seed': 2609, 'includeAutoSaved': True, 'eventBalanced': False, 'ballotBalanced': False,
        'uniqueParticipants': len({n for _, n in profiles}), 'participantEventProfiles': len(profiles),
        'directionalRankings': len(rows), 'reciprocalPairs': t.reciprocal_pair_count(rows),
        'datasetSha256': hash_json(data),
        'environment': {'python': platform.python_version(), 'numpy': np.__version__, 'scipy': __import__('scipy').__version__, 'scikitLearn': __import__('sklearn').__version__},
    }
    write('candidate-config.json', candidate)
    primary, primary_folds = paired_cv(rows, profiles, False)
    strict, strict_folds = paired_cv(rows, profiles, True)
    frozen_scores = t.incumbent_predictions(rows, profiles, incumbent)
    new_ids = [i for i, r in enumerate(rows) if r['event_id'] in [27,28]]
    temporal_rows = [r for r in rows if r['event_id'] == 28]
    temporal_train = [r for r in rows if r['event_id'] in [26,27]]
    temporal_bundle = fit(temporal_train, profiles)
    temporal_pred, _ = t.calibrated_predictions(temporal_bundle, temporal_train, temporal_rows, profiles)
    temporal_base = t.incumbent_predictions(temporal_rows, profiles, incumbent)
    report = {
        'recipe': candidate['training'], 'v12Reproduction': reproduction_full,
        'dataset': {
            'events': EVENTS, 'uniqueParticipants': len({n for _, n in profiles}),
            'newPeopleVersusV12': len({n for _, n in profiles} - original_people),
            'perEvent': {str(e): {'people': sum(pe == e for pe, _ in profiles), 'directions': sum(r['event_id'] == e for r in rows), 'manualDirections': sum(r['event_id'] == e and not r['auto_saved'] for r in rows), 'newPeopleRelativeToEarlierIncludedEvents': len({n for pe,n in profiles if pe==e} - {n for pe,n in profiles if pe<e})} for e in EVENTS},
            'surveyHistoryRestorations': t.profile_restoration_counts(data),
        },
        'primaryExactV12RankerGroupedRaw': {'folds': primary_folds, 'comparisons': slices(rows, primary['event26Only']['raw'], primary['events26to28']['raw'], original_people)},
        'strictParticipantPurgedCalibrated': {'folds': strict_folds, 'comparisons': slices(rows, strict['event26Only']['calibrated'], strict['events26to28']['calibrated'], original_people)},
        'frozenV12VsStrictCandidateNewEvents': comparison([rows[i] for i in new_ids], frozen_scores[new_ids], strict['events26to28']['calibrated'][new_ids]),
        'temporalEvent28': {'training': 'baseline Event26; candidate Events26+27; both evaluated on untouched Event28 outcomes', 'comparison': comparison(temporal_rows, temporal_base, temporal_pred)},
        'manualOnlySensitivity': {},
        'productionActivated': False,
    }
    manual = t.ranking_rows(data, EVENTS, False)
    print('Manual-only sensitivity', flush=True)
    manual_cv = t.cross_validate(manual, profiles, 2, 10, 0.1, False)
    manual_base = t.incumbent_predictions(manual, profiles, incumbent)
    mid = [i for i,r in enumerate(manual) if r['event_id'] in [27,28]]
    report['manualOnlySensitivity'] = comparison([manual[i] for i in mid], manual_base[mid], manual_cv['calibrated'][mid])
    report['user7'] = user7_eval(rows, profiles, incumbent, candidate, current)
    write('report.json', report)
    # Save OOF predictions with pseudonymous numeric IDs for audit, no answers.
    write('oof-predictions.json', [{'event': r['event_id'], 'ranker': r['ranker_number'], 'target': r['ranked_number'], 'rank':r['rank'], 'count':r['candidate_count'], **{f'{cv}_{name}_{kind}':float(values[kind][i]) for cv, data_ in [('primary',primary),('strict',strict)] for name,values in data_.items() for kind in ['raw','calibrated']}} for i,r in enumerate(rows)])
    print(json.dumps({
        'dataset': report['dataset'],
        'primary': report['primaryExactV12RankerGroupedRaw']['comparisons']['all'],
        'strictNewEvents': report['strictParticipantPurgedCalibrated']['comparisons']['newEvents27and28'],
        'frozenV12VsCandidate': report['frozenV12VsStrictCandidateNewEvents'],
        'temporalEvent28': report['temporalEvent28'],
        'user7': report['user7']['models'],
    }, indent=2), flush=True)


if __name__ == '__main__':
    main()
