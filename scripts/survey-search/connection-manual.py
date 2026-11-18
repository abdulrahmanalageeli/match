"""Prespecified sensitivity: direct connection search with manual rankings only.

Imports the unchanged connection experiment, retaining its candidates, labels,
folds, metrics, and temporal protocol. Only auto-saved secondary ranking targets
are removed. This is a sensitivity, not another opportunity to pick a winner.
"""
import hashlib
import importlib.util
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('connection_manual_base', HERE/'connection.py')
c = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = c
spec.loader.exec_module(c)
import numpy as np


def identity(row):
    return tuple(row[k] for k in ['event_id', 'ranker_number', 'ranked_number', 'phase'])


def main():
    data = c.read(c.RECENT)
    profiles = {(int(p['event_id']), int(p['assigned_number'])): p for p in data['profiles']}
    feedback, exclusions = c.feedback_rows(data, profiles)
    events = sorted({r['event_id'] for r in feedback})
    manual = c.trainer.ranking_rows(data, events, False)
    original = c.trainer.ranking_rows(data, events, True)
    assert manual and all(not r.get('auto_saved') for r in manual)
    assert len(manual) < len(original)
    primary = c.read(c.OUT/'connection-recent-summary.json')
    primary_rows = c.read(c.OUT/'connection-recent-predictions.json')
    assert primary['protocol']['configs'] == c.CONFIGS
    results, saved = {}, []
    for event in [27, 28]:
        report, rows = c.evaluate_event(event, feedback, manual, profiles)
        results[str(event)] = report
        saved.extend(rows)
        c.write(f'connection-manual-event{event}.json', report)
    lookup = {identity(r): r for r in primary_rows}
    assert len(lookup) == len(primary_rows) == len(saved)
    assert set(lookup) == {identity(r) for r in saved}
    assert all(r['wantConnect'] == lookup[identity(r)]['wantConnect'] for r in saved)
    names = sorted(set.intersection(*(set(r['scores']) for r in saved)))
    predictions = {name: np.asarray([r['scores'][name] for r in saved]) for name in names}
    for name in ['nested_selected', 'ranking_v12_refit', 'frozen_v12']:
        predictions['original_all_rankings_'+name] = np.asarray([lookup[identity(r)]['scores'][name] for r in saved])
    # Candidates that do not consume ranking labels must remain unchanged. This
    # verifies that the sensitivity actually isolates the secondary target.
    invariant_checks = {}
    for config in c.CONFIGS:
        if config['engine'] != 'joint':
            old = np.asarray([lookup[identity(r)]['scores'][config['name']] for r in saved])
            delta = float(np.max(np.abs(old-predictions[config['name']])))
            invariant_checks[config['name']] = delta
            assert delta < 1e-8, (config['name'], delta)
    assert np.allclose(predictions['frozen_v12'], predictions['original_all_rankings_frozen_v12'])
    protocol = dict(primary['protocol'],
        purpose='Sensitivity: remove auto-saved secondary ranking targets; preserve direct wantConnect labels.',
        status='Exploratory sensitivity; not used to select a preferred outer-result pipeline.',
        primary_reference='connection-recent-summary.json',
        change='ranking_rows(include_auto_saved=False) instead of True; no new hyperparameters or candidates.',
        inputs={str(c.RECENT.relative_to(c.ROOT)): hashlib.sha256(c.RECENT.read_bytes()).hexdigest()},
        auto_saved_rankings_excluded=len(original)-len(manual),
        ranking_rows_before=len(original), ranking_rows_after=len(manual),
        feedback_unchanged=True,
        implementation=str(Path(__file__).relative_to(c.ROOT)),
        production_changed=False)
    summary = dict(protocol=protocol,
        coverage=dict(excluded=exclusions, feedback=len(feedback),
                      rankings_by_event={str(e):dict(original=sum(r['event_id']==e for r in original),
                                                     manual=sum(r['event_id']==e for r in manual)) for e in events}),
        invariants=dict(nonjoint_max_score_change=invariant_checks, frozen_unchanged=True,
                        identical_feedback_keys_and_labels=True),
        events=results,
        pooled={name:c.metrics(saved,values) for name,values in predictions.items()},
        mutual_pooled={name:c.mutual_metrics(saved,values) for name,values in predictions.items()},
        earlier_primary=dict(pooled=primary['pooled']['nested_selected'],
            selections={e:report['tuning']['selected'] for e,report in primary['events'].items()}),
        selected_against_baselines={base:c.choice_bootstrap(saved,predictions,base,'nested_selected')
            for base in ['frozen_v12','ranking_v12_refit','zero_information','original_all_rankings_nested_selected']},
        explicit_met={name:c.metrics([r for r in saved if r['explicit_met']],
                                     [v for r,v in zip(saved,values) if r['explicit_met']])
                      for name,values in predictions.items()})
    for i,row in enumerate(saved):
        for name,values in predictions.items():
            row['scores'][name] = float(values[i])
    c.write('connection-manual-summary.json', summary)
    c.write('connection-manual-predictions.json', saved)
    print(c.json.dumps(dict(rankings_before=len(original), rankings_after=len(manual),
        selections={e:r['tuning']['selected'] for e,r in results.items()},
        pooled_selected=summary['pooled']['nested_selected'],
        earlier_primary=summary['earlier_primary']['pooled'],
        comparison=summary['selected_against_baselines']), indent=2), flush=True)


if __name__ == '__main__':
    main()
