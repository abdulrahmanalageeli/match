"""Independent, bounded checks of survey-search split and reported metrics.

Does not refit candidates or modify running research scripts. Recomputes
primary person-level metrics from saved predictions with explicit pair counting
and tie-averaged DCG rather than calling the evaluator's metric implementation.
"""
import collections
import importlib.util
import json
import math
from pathlib import Path
import sys
import warnings

import numpy as np
from scipy.stats import ConstantInputWarning

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tmp/survey-search-2026-09-23'
spec = importlib.util.spec_from_file_location('survey_search_verify_subject', Path(__file__).with_name('search.py'))
s = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = s
spec.loader.exec_module(s)


def close(actual, expected):
    assert math.isclose(float(actual), float(expected), abs_tol=1e-10, rel_tol=1e-10), (actual, expected)


def explicit_auc(labels, scores):
    positives = [v for label, v in zip(labels, scores) if label]
    negatives = [v for label, v in zip(labels, scores) if not label]
    if not positives or not negatives:
        return None
    return sum(float(a > b) + .5 * float(a == b) for a in positives for b in negatives) / (len(positives) * len(negatives))


def explicit_ndcg(labels, scores, k=3):
    discounts = [1 / math.log2(position + 2) for position in range(len(labels))]
    buckets = collections.defaultdict(list)
    for y, score in zip(labels, scores):
        buckets[float(score)].append(float(y))
    dcg = 0.
    offset = 0
    for score in sorted(buckets, reverse=True):
        values = buckets[score]
        occupied = discounts[offset:min(offset + len(values), k)]
        dcg += float(np.mean(values)) * sum(occupied)
        offset += len(values)
    ideal = sum(y * discounts[i] for i, y in enumerate(sorted(labels, reverse=True)[:k]))
    return dcg / ideal if ideal else 0.


def independent_metrics(rows, scores):
    ballots = collections.defaultdict(list)
    for i, row in enumerate(rows):
        ballots[row['event_id'], row['ranker_number']].append(i)
    persons = collections.defaultdict(lambda: collections.defaultdict(list))
    for (_, person), ids in ballots.items():
        actual = [float(rows[i]['y']) for i in ids]
        pred = [float(scores[i]) for i in ids]
        labels = [rows[i]['rank'] <= 3 for i in ids]
        auc = explicit_auc(labels, pred)
        if auc is not None:
            persons[person]['auc'].append(auc)
        persons[person]['ndcg'].append(explicit_ndcg(actual, pred))
        best = [j for j, value in enumerate(pred) if value == max(pred)]
        persons[person]['top1_percentile'].append(float(np.mean([actual[j] for j in best])))
        persons[person]['top1_top3_hit'].append(float(np.mean([labels[j] for j in best])))
    return {
        'people': len(persons),
        'ballots': len(ballots),
        'directions': len(rows),
        **{
            'person_' + key: float(np.mean([np.mean(values[key]) for values in persons.values() if key in values]))
            for key in ['auc', 'ndcg', 'top1_percentile', 'top1_top3_hit']
        },
    }


def synthetic():
    # Returning participants remain a single split group; held targets are
    # removed even from another chooser's training ballot.
    rows = [
        dict(event_id=event, ranker_number=a, ranked_number=b, rank=b + 1, y=(11-b)/11)
        for event in [1, 2] for a in range(12) for b in range(12) if a != b
    ]
    visited = collections.Counter()
    for train_ids, test_ids, held in s.cross_splits(rows, 3):
        for i in train_ids:
            assert rows[i]['ranker_number'] not in held
            assert rows[i]['ranked_number'] not in held
        for i in test_ids:
            visited[int(i)] += 1
            assert rows[i]['ranker_number'] in held
    assert visited == collections.Counter(range(len(rows)))

    # Tied scores must average top-1 outcomes and DCG across the entire tie,
    # including candidates beyond the top-three cutoff.
    tied = [dict(event_id=1, ranker_number=1, ranked_number=i+2, rank=i+1, y=(3-i)/3) for i in range(4)]
    metrics = independent_metrics(tied, [1, 1, 1, 1])
    close(metrics['person_auc'], .5)
    close(metrics['person_top1_percentile'], .5)
    close(metrics['person_top1_top3_hit'], .75)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', ConstantInputWarning)
        subject = s.metrics(tied, [1, 1, 1, 1])
    for key, value in metrics.items():
        close(subject[key], value)

    # Ranking-percentile preprocessing preserves all within-ballot comparisons.
    scores = np.array([.3, .9, .9, -.2])
    transformed = s.ballot_percentiles(tied, scores)
    for a in range(4):
        for b in range(4):
            assert np.sign(scores[a] - scores[b]) == np.sign(transformed[a] - transformed[b])
    reference = [0, 1, 1, 3]
    normalized = s.normalize_global(reference, [-10, 0, 1, 3, 10])
    assert np.all(np.diff(normalized) >= 0) and np.all((normalized > 0) & (normalized < 1))
    return 4


def saved_checks():
    checked_files, model_metric_checks, feedback_auc_checks, user7_auc_checks = [], 0, 0, 0
    for prediction_path in sorted(OUT.glob('*-predictions.json')):
        report_path = prediction_path.with_name(prediction_path.name.replace('-predictions.json', '-report.json'))
        if not report_path.exists():
            continue
        saved, report = json.loads(prediction_path.read_text()), json.loads(report_path.read_text())
        if 'rankings' not in saved or not saved['rankings'] or 'models' not in report:
            continue
        rows = saved['rankings']
        for model, expected in report['models'].items():
            scores = [row['scores'][model] for row in rows]
            assert np.isfinite(scores).all()
            independent = independent_metrics(rows, scores)
            for key, value in independent.items():
                close(expected[key], value)
                model_metric_checks += 1
        feedback = saved.get('feedback') or []
        for model, expected in report.get('feedback', {}).items():
            auc = explicit_auc([row['wantConnect'] for row in feedback], [row['scores'][model] for row in feedback])
            if auc is not None:
                close(expected['want_connect_auc'], auc)
                feedback_auc_checks += 1
        tuning = report.get('tuning', {})
        if tuning:
            best = sorted(tuning['inner_objective'], key=lambda name: (-tuning['inner_objective'][name], name))
            assert tuning['selected'] == best[0]
            assert tuning['top3_ensemble'] == best[:3]
            assert tuning['blend_weight'] in [0, .25, .5, .75, 1]
        checked_files.append(prediction_path.name)
    # Verify completed pooled temporal and nested summaries without summarize(),
    # which would rewrite reports while another process might be running.
    summaries = [(prefix + 'temporal-summary.json',
                  [OUT / f'{prefix}temporal-{event}-predictions.json' for event in [27, 28]])
                 for prefix in ['', 'expanded-']]
    summaries.append(('nested-summary.json', [OUT / f'outer-{fold}-predictions.json' for fold in range(1, 6)]))
    for summary_name, paths in summaries:
        summary_path = OUT / summary_name
        if summary_path.exists() and all(path.exists() for path in paths):
            report = json.loads(summary_path.read_text())
            rows = [row for path in paths for row in json.loads(path.read_text())['rankings']]
            for model, expected in report['models'].items():
                actual = independent_metrics(rows, [row['scores'][model] for row in rows])
                for key, value in actual.items():
                    close(expected[key], value)
                    model_metric_checks += 1
            checked_files.append(summary_path.name)
    tasks = {
        'liked_vs_disliked': (['friendly', 'romantic'], ['disliked']),
        'romantic_vs_disliked': (['romantic'], ['disliked']),
        'friendly_vs_disliked': (['friendly'], ['disliked']),
        'romantic_vs_friendly': (['romantic'], ['friendly']),
    }
    for path in sorted(OUT.glob('user7-*-pipeline-audit.json')):
        saved = json.loads(path.read_text())
        rows = saved['rows']
        assert collections.Counter(row['label'] for row in rows) == {'romantic': 7, 'friendly': 13, 'disliked': 10}
        if saved['mode'] == 'purged':
            assert saved['purged_before_configuration_selection'] is True
            assert saved['excluded_incident_user7_directions'] > 0
            assert all(7 not in fold['held_people'] for fold in saved['selection']['folds'])
        for task, (pos, neg) in tasks.items():
            eligible = [row for row in rows if row['label'] in pos + neg]
            labels = [row['label'] in pos for row in eligible]
            for model, expected in saved['cohort_rank_procedure'].items():
                close(expected[task], explicit_auc(labels, [row['cohort_rank_scores'][model] for row in eligible]))
                user7_auc_checks += 1
            for model, expected in saved['global_percentile_sensitivity'].items():
                for direction in ['directional', 'mutual']:
                    values = [row['global_percentile_scores'][model][direction] for row in eligible]
                    close(expected[direction][task], explicit_auc(labels, values))
                    user7_auc_checks += 1
        checked_files.append(path.name)
    return dict(files=checked_files, independentMetricChecks=model_metric_checks,
                independentFeedbackAucChecks=feedback_auc_checks, independentUser7AucChecks=user7_auc_checks)


def main():
    result = {'syntheticChecks': synthetic(), **saved_checks(), 'passed': True,
              'scope': 'Independent arithmetic, held-person purging, score monotonicity, saved inner selections; no candidate refits.'}
    (OUT / 'verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
