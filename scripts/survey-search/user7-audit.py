"""Complete User7 benchmark audit after independent survey-only selection.

The strict branch excludes every incident-7 ranking before BOTH configuration
selection and final fitting. Existing acquaintance labels are consulted only
after selection. Cohort-rank ensembles match the ranking-search procedure;
global-percentile ensembles are a separate single-pair scoring sensitivity.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('user7_pipeline_search', Path(__file__).with_name('search.py'))
s = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = s
spec.loader.exec_module(s)


def metrics(labels, numbers, scores):
    tasks = {
        'liked_vs_disliked': (['friendly', 'romantic'], ['disliked']),
        'romantic_vs_disliked': (['romantic'], ['disliked']),
        'friendly_vs_disliked': (['friendly'], ['disliked']),
        'romantic_vs_friendly': (['romantic'], ['friendly']),
    }
    result = {}
    for task, (positive, negative) in tasks.items():
        indices = [i for i, n in enumerate(numbers) if labels[n] in positive + negative]
        result[task] = s.e.auc([labels[numbers[i]] in positive for i in indices], [float(scores[i]) for i in indices])
    result['group_means'] = {
        label: float(np.mean([scores[i] for i, n in enumerate(numbers) if labels[n] == label]))
        for label in ['friendly', 'romantic', 'disliked']
    }
    return result


def combine(scores, tuned):
    result = dict(scores)
    result['selected'] = result[tuned['selected']]
    weight = tuned['blend_weight']
    result['selected_blend'] = (1-weight) * result['v12_refit'] + weight * result['selected']
    result['top3_ensemble'] = np.mean([result[name] for name in tuned['top3_ensemble']], axis=0)
    return result


def run(mode, all_rows, event_profiles):
    train = [r for r in all_rows if mode == 'full' or 7 not in [r['ranker_number'], r['ranked_number']]]
    if mode != 'full':
        assert all(7 not in [r['ranker_number'], r['ranked_number']] for r in train)
    # Same pre-benchmark digest and source-fingerprinted cache rules as search.py.
    s.profiles_digest = s.digest({str(key): value for key, value in event_profiles.items()})
    tuned = s.tuning(train, event_profiles, 'all-data' if mode == 'full' else 'user7-purged')
    # No benchmark labels participate in configuration/ensemble selection.
    source = s.e.read(s.e.USER7)
    if isinstance(source, dict):
        source = source['profiles']
    profiles = {**event_profiles, **{(0, p['assigned_number']): p for p in source}}
    labels = {n: label for label, numbers in s.e.LABELS.items() for n in numbers}
    numbers = sorted(labels)
    assert set(numbers) | {7} == {p['assigned_number'] for p in source}
    outbound = [dict(event_id=0, ranker_number=7, ranked_number=n) for n in numbers]
    reverse = [dict(event_id=0, ranker_number=n, ranked_number=7) for n in numbers]
    directions = outbound + reverse
    names = list(dict.fromkeys(['v12_refit', tuned['selected'], *tuned['top3_ensemble']]))
    cohort, global_scores = {}, {}
    for name in names:
        model = s.fit(s.CONFIG_BY_NAME[name], train, profiles)
        raw = s.predict(model, directions)
        cohort[name] = s.ballot_percentiles(outbound, raw[:len(numbers)])
        global_scores[name] = s.normalize_global(s.predict(model, train), raw)
    cohort = combine(cohort, tuned)
    global_scores = combine(global_scores, tuned)
    frozen = s.t.incumbent_predictions(directions, profiles, s.e.read(ROOT/'tmp/training-2026-09-17/frozen-v12-config.json'))
    cohort['frozen_v12'] = s.ballot_percentiles(outbound, frozen[:len(numbers)])
    global_scores['frozen_v12'] = np.asarray(frozen)
    result = {
        'mode': mode,
        'training_directions': len(train),
        'excluded_incident_user7_directions': len(all_rows) - len(train),
        'purged_before_configuration_selection': mode != 'full',
        'selection': tuned,
        'cohort_rank_procedure': {name: metrics(labels, numbers, values) for name, values in cohort.items()},
        'global_percentile_sensitivity': {
            name: {
                'directional': metrics(labels, numbers, values[:len(numbers)]),
                'mutual': metrics(labels, numbers, np.sqrt(values[:len(numbers)] * values[len(numbers):])),
            }
            for name, values in global_scores.items()
        },
        'rows': [
            {
                'participant_number': n,
                'label': labels[n],
                'cohort_rank_scores': {name: float(values[i]) for name, values in cohort.items()},
                'global_percentile_scores': {
                    name: {'directional': float(values[i]), 'reverse': float(values[len(numbers)+i]),
                           'mutual': float(np.sqrt(values[i] * values[len(numbers)+i]))}
                    for name, values in global_scores.items()
                },
            }
            for i, n in enumerate(numbers)
        ],
        'limitations': [
            'Thirty familiar-person labels are a small secondary diagnostic, not an untouched deployment test.',
            'Cohort-rank ensembles compare User7 candidate ordering within this 30-person benchmark; reverse cohort scores are undefined without each other persons candidate pool.',
            'Global-percentile blending matches the survey-search single-pair feedback sensitivity, not the cohort-ranking normalization.',
            'Scores are model-relative utilities/percentiles, not calibrated probabilities of liking or romance.',
            'Frozen V12 is a historical reference and is not retrained or User7-purged.',
        ],
    }
    s.dump(f'user7-{mode}-pipeline-audit.json', result)
    print(json.dumps({
        'mode': mode, 'training_directions': len(train), 'excluded_incident_user7_directions': result['excluded_incident_user7_directions'],
        'selected': tuned['selected'], 'blend_weight': tuned['blend_weight'],
        'primary_auc': {name: {k: v for k, v in result['cohort_rank_procedure'][name].items() if k != 'group_means'}
                        for name in ['v12_refit', 'selected', 'selected_blend', 'top3_ensemble', 'frozen_v12']},
    }, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['full', 'purged', 'all'], default='all')
    args = parser.parse_args()
    data = s.e.read(s.e.DATA)
    profiles = {(p['event_id'], p['assigned_number']): p for p in data['profiles']}
    rows = s.t.ranking_rows(data, [26, 27, 28], False)
    for mode in (['purged', 'full'] if args.mode == 'all' else [args.mode]):
        run(mode, rows, profiles)


if __name__ == '__main__':
    main()

