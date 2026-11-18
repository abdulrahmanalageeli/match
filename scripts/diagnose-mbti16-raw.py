"""Temporal raw-score sensitivity for the fixed, unchanged MBTI16 protocol."""
import collections
import hashlib
import importlib.util
from pathlib import Path
import warnings

import numpy as np

SPEC = importlib.util.spec_from_file_location(
    'mbti16_experiment', Path(__file__).with_name('evaluate-mbti16.py'))
e = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(e)


def key(row):
    return row['event_id'], row['ranker_number'], row['ranked_number']


def ties(rows, predictions):
    ballots = collections.defaultdict(list)
    for row, score in zip(rows, predictions):
        ballots[row['event_id'], row['ranker_number']].append(float(score))
    tied_pairs, total_pairs, ballots_with_ties, all_tied = 0, 0, 0, 0
    for scores in ballots.values():
        counts = collections.Counter(scores)
        tied = sum(n * (n - 1) // 2 for n in counts.values())
        tied_pairs += tied
        total_pairs += len(scores) * (len(scores) - 1) // 2
        ballots_with_ties += int(tied > 0)
        all_tied += int(len(counts) == 1)
    return {'ballots': len(ballots), 'candidate_pairs': total_pairs,
            'tied_candidate_pairs': tied_pairs,
            'tied_pair_fraction': tied_pairs / total_pairs if total_pairs else None,
            'ballots_with_ties': ballots_with_ties, 'all_tied_ballots': all_tied}


def describe(rows, predictions):
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        report = e.compare(rows, predictions)
    report['ties'] = {name: ties(rows, scores) for name, scores in predictions.items()}
    return report


def main():
    data = e.read(e.DATA)
    profiles = {(int(p['event_id']), int(p['assigned_number'])): p for p in data['profiles']}
    rows = e.t.ranking_rows(data, [26, 27, 28], True)
    saved = {key(row): row for row in e.read(e.OUT / 'temporal-predictions.json')}
    report = {
        'purpose': 'Isolate raw ranking from additional ties caused by archetype percentile calibration.',
        'parameters_changed': False, 'alpha': 10, 'models': e.MODELS,
        'dataset_sha256': hashlib.sha256(e.DATA.read_bytes()).hexdigest(),
        'protocol': 'Train event26 test27; train26+27 test28; includes auto-saved rankings.',
        'events': {}, 'saved_calibrated_prediction_replay': {},
    }
    all_rows = []
    all_raw = {name: [] for name in e.MODELS}
    all_calibrated = {name: [] for name in e.MODELS}
    for event in [27, 28]:
        train = [row for row in rows if row['event_id'] in ([26] if event == 27 else [26, 27])]
        test = [row for row in rows if row['event_id'] == event]
        raw, calibrated = {}, {}
        for name in e.MODELS:
            fitted = e.Model(train, profiles, name)
            raw[name], calibrated[name] = fitted.raw(test), fitted.predict(test)
            all_raw[name].extend(raw[name])
            all_calibrated[name].extend(calibrated[name])
            expected = np.asarray([saved[key(row)]['scores'][name] for row in test])
            difference = np.abs(calibrated[name] - expected)
            report['saved_calibrated_prediction_replay'][f'{event}:{name}'] = {
                'directions': len(test), 'max_absolute_difference': float(np.max(difference)),
                'differences_over_1e_10': int(np.sum(difference > 1e-10)),
                'exactly_changed_scores': int(np.sum(difference > 0)),
                'old_ties': ties(test, expected), 'current_ties': ties(test, calibrated[name]),
                'passed_1e_10': bool(np.all(difference <= 1e-10)),
            }
        report['events'][str(event)] = {
            'train_directions': len(train), 'raw': describe(test, raw),
            'calibrated': describe(test, calibrated),
        }
        known = [i for i, row in enumerate(test)
                 if e.mbti(profiles[row['event_id'], row['ranker_number']])[0]]
        if known:
            known_rows = [test[i] for i in known]
            report['events'][str(event)]['known_choosers'] = {
                'raw': describe(known_rows, {name: scores[known] for name, scores in raw.items()}),
                'calibrated': describe(known_rows, {name: scores[known] for name, scores in calibrated.items()}),
            }
        all_rows.extend(test)
        print(f'Raw sensitivity event {event}: {len(train)} train, {len(test)} test', flush=True)
    report['pooled'] = {'raw': describe(all_rows, all_raw),
                        'calibrated': describe(all_rows, all_calibrated)}
    known = [i for i, row in enumerate(all_rows)
             if e.mbti(profiles[row['event_id'], row['ranker_number']])[0]]
    known_rows = [all_rows[i] for i in known]
    report['known_choosers'] = {
        'raw': describe(known_rows, {name: np.asarray(scores)[known] for name, scores in all_raw.items()}),
        'calibrated': describe(known_rows, {name: np.asarray(scores)[known] for name, scores in all_calibrated.items()}),
    }
    report['replay_passed'] = all(result['passed_1e_10']
                                 for result in report['saved_calibrated_prediction_replay'].values())
    e.write('raw-temporal-report.json', report)
    e.write('raw-temporal-predictions.json', [
        dict(row, raw={name: float(scores[i]) for name, scores in all_raw.items()},
             calibrated={name: float(scores[i]) for name, scores in all_calibrated.items()})
        for i, row in enumerate(all_rows)])
    print(e.json.dumps({
        'replay_passed': report['replay_passed'],
        'pooled_raw': report['pooled']['raw'],
        'known_raw': report['known_choosers']['raw'],
    }, indent=2))


if __name__ == '__main__':
    main()
