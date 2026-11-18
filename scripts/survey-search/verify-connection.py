"""Independent arithmetic audit of saved connection experiments; no fitting.

Uses pair-count AUC and independently reconstructs grouped/shortlist/mutual
metrics. Does not import any training script or evaluator metric function.
"""
import ast
import collections
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'tmp/survey-search-2026-09-23'
ERRORS = []
CHECKS = 0
MAXIMUM_ERROR = 0.


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def area(labels, scores):
    """AUC as the fraction of positive-negative score pairs correctly ordered."""
    positive = [score for label,score in zip(labels,scores) if label]
    negative = [score for label,score in zip(labels,scores) if not label]
    if not positive or not negative:
        return None
    total = sum(1. if a>b else .5 if a==b else 0. for a in positive for b in negative)
    return total/(len(positive)*len(negative))


def check(actual, expected, label):
    global CHECKS,MAXIMUM_ERROR
    CHECKS += 1
    if actual is None or expected is None:
        if actual is not expected:
            ERRORS.append(dict(check=label,computed=actual,reported=expected))
        return
    difference = abs(float(actual)-float(expected))
    MAXIMUM_ERROR = max(MAXIMUM_ERROR,difference)
    if not math.isfinite(difference) or difference>1e-10:
        ERRORS.append(dict(check=label,computed=actual,reported=expected))


def within(rows, scores):
    values = collections.defaultdict(list)
    for row,score in zip(rows,scores):
        values[row['event_id'],row['ranker_number']].append((row['wantConnect'],score))
    aucs = [area([x[0] for x in group],[x[1] for x in group]) for group in values.values()]
    aucs = [value for value in aucs if value is not None]
    return (sum(aucs)/len(aucs) if aucs else None),len(aucs)


def shortlist(rows, scores):
    by_direction = collections.defaultdict(list)
    for i,row in enumerate(rows):
        by_direction[row['event_id'],row['ranker_number'],row['ranked_number']].append(i)
    final = [max(ids,key=lambda i:rows[i]['phase']) for ids in by_direction.values()]
    choosers = collections.defaultdict(list)
    for i in final:
        choosers[rows[i]['event_id'],rows[i]['ranker_number']].append(i)
    selected_positives,slots,positive_options,all_options,groups = 0.,0,0,0,0
    for indexes in choosers.values():
        if len(indexes)<2:
            continue
        groups += 1
        count = math.ceil(len(indexes)/5)
        # Score groups make boundary-tie treatment explicit. A boundary tie
        # receives the remaining slots uniformly rather than arbitrary ID order.
        score_groups = collections.defaultdict(list)
        for i in indexes:
            score_groups[scores[i]].append(int(rows[i]['wantConnect']))
        remaining = count
        for score in sorted(score_groups,reverse=True):
            labels = score_groups[score]
            take = min(remaining,len(labels))
            selected_positives += take*sum(labels)/len(labels)
            remaining -= take
            if remaining==0:
                break
        slots += count
        positive_options += sum(rows[i]['wantConnect'] for i in indexes)
        all_options += len(indexes)
    precision = selected_positives/slots if slots else None
    base = positive_options/all_options if all_options else None
    return dict(people_events_with_choice=groups,eligible_partner_options=all_options,
                recommended_options=slots,positive_recommendations_expected_under_ties=selected_positives,
                precision=precision,eligible_base_positive_rate=base,
                precision_lift=precision/base if precision is not None and base else None,
                positive_sample_coverage=selected_positives/positive_options if positive_options else None,
                option_coverage=slots/all_options if all_options else None)


def mutual(rows, scores):
    pairs = collections.defaultdict(dict)
    for i,row in enumerate(rows):
        a,b = row['ranker_number'],row['ranked_number']
        key = row['event_id'],row['phase'],min(a,b),max(a,b)
        if a in pairs[key]:
            raise AssertionError('Duplicate directed response within a pair-phase')
        pairs[key][a] = i
    labels,values = [],[]
    for directions in pairs.values():
        if len(directions)!=2:
            continue
        i,j = list(directions.values())
        labels.append(rows[i]['wantConnect'] and rows[j]['wantConnect'])
        values.append(min(scores[i],scores[j]))
    return dict(fully_observed_pair_phases=len(labels),mutually_positive=sum(labels),mutual_auc=area(labels,values))


def evaluate(rows,scores):
    person_auc,informative = within(rows,scores)
    event_aucs,weights = [],[]
    for event in sorted({row['event_id'] for row in rows}):
        ids = [i for i,row in enumerate(rows) if row['event_id']==event]
        labels = [rows[i]['wantConnect'] for i in ids]
        score = area(labels,[scores[i] for i in ids])
        if score is not None:
            event_aucs.append(score)
            weights.append(sum(labels)*(len(labels)-sum(labels)))
    return dict(directions=len(rows),people=len({row['ranker_number'] for row in rows}),
                positive=sum(row['wantConnect'] for row in rows),
                want_connect_auc=area([row['wantConnect'] for row in rows],scores),
                within_person_auc=person_auc,informative_person_events=informative,
                event_macro_auc=sum(event_aucs)/len(event_aucs) if event_aucs else None,
                event_pair_weighted_auc=sum(a*w for a,w in zip(event_aucs,weights))/sum(weights) if weights else None,
                top20_percent_within_person=shortlist(rows,scores))


def compare_nested(computed,reported,prefix):
    for name,value in computed.items():
        if name not in reported:
            ERRORS.append(dict(check=prefix+'.'+name,error='Missing reported metric'))
        elif isinstance(value,dict):
            compare_nested(value,reported[name],prefix+'.'+name)
        else:
            check(value,reported[name],prefix+'.'+name)


def verify_experiment(mode):
    rows = read(OUT/f'connection-{mode}-predictions.json')
    report = read(OUT/f'connection-{mode}-summary.json')
    models = {}
    for name,reported in report['pooled'].items():
        scores = [row['scores'][name] for row in rows]
        if not all(math.isfinite(value) for value in scores):
            raise AssertionError('Nonfinite saved prediction')
        computed = evaluate(rows,scores)
        compare_nested(computed,reported,f'{mode}.pooled.{name}')
        mutual_computed = mutual(rows,scores)
        compare_nested(mutual_computed,report['mutual_pooled'][name],f'{mode}.mutual.{name}')
        for event,event_report in report['events'].items():
            ids = [i for i,row in enumerate(rows) if row['event_id']==int(event)]
            if name in event_report['models']:
                compare_nested(evaluate([rows[i] for i in ids],[scores[i] for i in ids]),event_report['models'][name],f'{mode}.event{event}.{name}')
        explicit = [i for i,row in enumerate(rows) if row['explicit_met']]
        if name in report['explicit_met']:
            compare_nested(evaluate([rows[i] for i in explicit],[scores[i] for i in explicit]),report['explicit_met'][name],f'{mode}.explicit_met.{name}')
        models[name] = dict(pooled_auc=computed['want_connect_auc'],event_macro_auc=computed['event_macro_auc'],
                            within_person_auc=computed['within_person_auc'],shortlist=computed['top20_percent_within_person'],mutual=mutual_computed)
    if mode=='recent':
        for name,positives in [('nested_selected',48),('frozen_v12',41),('ranking_v12_refit',45)]:
            top = models[name]['shortlist']
            check(top['recommended_options'],66,'headline.'+name+'.options')
            check(top['positive_recommendations_expected_under_ties'],positives,'headline.'+name+'.positive')
    return dict(directions=len(rows),models_checked=len(models),models=models)


def verify_user7():
    report = read(OUT/'connection-user7-report.json')
    people = report['people']
    # Read the original label literal without importing or executing evaluator
    # code, then verify the saved benchmark category assignments themselves.
    tree = ast.parse((ROOT/'scripts/evaluate-mbti16.py').read_text(encoding='utf8'))
    labels = None
    for node in tree.body:
        if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='LABELS' for target in node.targets):
            labels = ast.literal_eval(node.value)
            break
    expected = {number:category for category,numbers in labels.items() for number in numbers}
    actual = {row['participant_number']:row['category'] for row in people}
    if actual!=expected or len(people)!=30:
        ERRORS.append(dict(check='user7.category_assignment',error='Benchmark IDs/categories differ from original definitions'))
    tasks = {'liked_vs_disliked':({'romantic','friendly'},{'disliked'}),
             'romantic_vs_disliked':({'romantic'},{'disliked'}),
             'friends_vs_disliked':({'friendly'},{'disliked'}),
             'romantic_vs_friends':({'romantic'},{'friendly'})}
    recomputed = {}
    for name,reported in report['category_metrics'].items():
        recomputed[name] = {}
        for task,(positive,negative) in tasks.items():
            subset = [row for row in people if row['category'] in positive|negative]
            value = area([row['category'] in positive for row in subset],[row['scores'][name]['user7_to_person'] for row in subset])
            recomputed[name][task] = value
            check(value,reported[task],f'user7.{name}.{task}')
        for row in people:
            scores = row['scores'][name]
            check(min(scores['user7_to_person'],scores['person_to_user7']),scores['minimum_bidirectional'],f'user7.{name}.minimum_bidirectional')
    return dict(people=len(people),category_counts=dict(collections.Counter(row['category'] for row in people)),models_checked=len(recomputed),category_auc=recomputed)


def main():
    modes = ['recent','older-sensitivity','manual']
    experiments = {mode:verify_experiment(mode) for mode in modes}
    user7 = verify_user7()
    inputs = [OUT/f'connection-{mode}-{kind}.json' for mode in modes for kind in ['predictions','summary']]+[OUT/'connection-user7-report.json']
    result = dict(passed=not ERRORS,checks=CHECKS,maximum_absolute_metric_error=MAXIMUM_ERROR,
                  method='Independent positive-negative pair-count AUC; explicit score-group boundary ties; final-phase deduplicated chooser shortlists; fully observed same-phase reciprocal pairs. No evaluator metric functions, fitting or model selection.',
                  inputs={path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs},
                  experiments=experiments,user7=user7,errors=ERRORS)
    (OUT/'verification-connection.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf8')
    print(json.dumps(dict(passed=result['passed'],checks=CHECKS,maximum_absolute_metric_error=MAXIMUM_ERROR,errors=ERRORS),indent=2))
    if ERRORS:
        raise SystemExit(1)


if __name__=='__main__':
    main()
