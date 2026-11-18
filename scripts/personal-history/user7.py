"""Strictly pair-purged user7 audit of locked personal-history models.

No model selection uses benchmark categories. Every 7<->benchmark-participant
training interaction is removed from shared AND personal sources before fitting.
Ranking percentiles are rebuilt after removal. The benchmark is a present-day
survey query represented by synthetic event29, later than all history20–28.
"""
import os
for name in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS']:
    os.environ[name] = '1'
import ast
import argparse
import collections
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
from sklearn.metrics import roc_auc_score

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'tmp/personal-history-2026-09-23'


def load(name,path):
    spec = importlib.util.spec_from_file_location(name,path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


evaluation = load('personal_user7_evaluation',Path(__file__).with_name('evaluate.py'))
connection,personal = evaluation.c,evaluation.p


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(name,value):
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/name).write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf8')


def write_csv(people):
    names = list(people[0]['scores'])
    with (OUT/'user7-scores.csv').open('w',newline='',encoding='utf8') as handle:
        writer = csv.DictWriter(handle,fieldnames=['participant_number','category']+names)
        writer.writeheader()
        for row in people:
            writer.writerow(dict(participant_number=row['participant_number'],category=row['category'],
                                 **{name:value['user7_to_person'] for name,value in row['scores'].items()}))


def history_counts(feedback,rankings):
    own_feedback = [row for row in feedback if row['ranker_number']==7]
    own_rankings = [row for row in rankings if row['ranker_number']==7]
    return dict(feedback_responses=len(own_feedback),
                feedback_distinct_partners=len({row['ranked_number'] for row in own_feedback}),
                feedback_positive=sum(row['wantConnect'] for row in own_feedback),
                feedback_negative=sum(not row['wantConnect'] for row in own_feedback),
                feedback_has_both_labels=len({row['wantConnect'] for row in own_feedback})==2,
                explicit_rankings=len(own_rankings),
                ranking_distinct_partners=len({row['ranked_number'] for row in own_rankings}),
                ranking_has_contrasting_percentiles=len({row['y'] for row in own_rankings})>1,
                events=sorted({row['event_id'] for row in own_feedback+own_rankings}))


def selections():
    primary_path = OUT/'primary-selection.json'
    if not primary_path.exists():
        raise FileNotFoundError('Locked primary-selection.json is not available; finish the earlier-event development selection before running this audit')
    result = {'primary_locked':read(primary_path)}
    inputs = [primary_path]
    for prefix,label in [('primary','primary_no_user7_development'),('event-order','event_order_no_user7_development')]:
        development_path = OUT/f'{prefix}-development.json'
        if development_path.exists():
            development = read(development_path)
            retained = {kind:[row for row in rows if row['ranker_number']!=7] for kind,rows in development.items()}
            result[label] = evaluation.select(retained)
            result[label]['note'] = 'Re-selected only from stored earlier-event development predictions with chooser7 excluded; no refits. Development shared models may include earlier user7 histories, and benchmark categories never enter selection.'
            inputs.append(development_path)
    event_path = OUT/'event-order-selection.json'
    if event_path.exists():
        result['event_order_locked'] = read(event_path)
        inputs.append(event_path)
    return result,inputs


def refresh_selections():
    # Selection is recomputed/read before opening any benchmark result. Every
    # variant was already fitted; only locked aliases and their summaries change.
    selected,selection_paths = selections()
    output = read(OUT/'user7-report.json')
    current_models_hash = hashlib.sha256(Path(__file__).with_name('models.py').read_bytes()).hexdigest()
    if output['source_sha256']['models.py']!=current_models_hash:
        raise ValueError('Personal model source changed since these scores were fitted; refresh refused')
    people = output['people']
    for protocol,choice in selected.items():
        for objective,model_name in choice['selected'].items():
            alias = 'personal_selected_'+objective if protocol=='primary_locked' else protocol+'_'+objective
            for row in people:
                row['scores'][alias] = dict(row['scores'][model_name])
    tasks = {'liked_vs_disliked':({'romantic','friendly'},{'disliked'}),
             'romantic_vs_disliked':({'romantic'},{'disliked'}),
             'friends_vs_disliked':({'friendly'},{'disliked'}),
             'romantic_vs_friends':({'romantic'},{'friendly'})}
    names = list(people[0]['scores'])
    metric = {}
    for name in names:
        metric[name] = {}
        for task,(positive,negative) in tasks.items():
            subset = [row for row in people if row['category'] in positive|negative]
            metric[name][task] = float(roc_auc_score([row['category'] in positive for row in subset],[row['scores'][name]['user7_to_person'] for row in subset]))
    main_names = ['frozen_v12','shared','personal_selected_connection','personal_selected_ranking']
    fixed_names = [config['name'] for config in personal.CONFIGS]
    output['primary_category_auc'] = {name:metric[name] for name in main_names}
    output['sensitivity_category_auc'] = {name:metric[name] for name in names if name not in main_names+fixed_names}
    output['primary_personal_minus_shared'] = {name:{task:metric[name][task]-metric['shared'][task] for task in tasks} for name in ['personal_selected_connection','personal_selected_ranking']}
    output['max_user7_score_adjustment'] = {name:max(abs(row['scores'][name]['user7_to_person']-row['scores']['shared']['user7_to_person']) for row in people) for name in names if name!='frozen_v12'}
    output['selections'] = selected
    output['protocol']['sensitivity_refresh'] = 'Uses already fitted and saved scores for the fixed10 variants. Later-available development choices are attached without any fitting, or benchmark-dependent selection.'
    output['protocol']['frozen_reference_limit'] = 'FrozenV12 is an immutable descriptive original artifact; unlike shared/personal models in this audit, its original training history cannot be retrospectively benchmark-pair purged.'
    output['input_sha256'].update({path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in selection_paths})
    output['sensitivity_refresh_source_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    write('user7-report.json',output)
    write_csv(people)
    print(json.dumps(dict(selections={name:value['selected'] for name,value in selected.items()},sensitivity_category_auc=output['sensitivity_category_auc']),indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh-selections',action='store_true')
    args = parser.parse_args()
    if args.refresh_selections:
        refresh_selections()
        return
    # Read current surveys and IDs for pair exclusion. Category labels are not
    # read until all preselected/exploratory fixed models have been scored.
    benchmark_path = ROOT/'.tmp-mbti16-20260923-user7-personalization.json'
    current = read(benchmark_path)
    if isinstance(current,dict):
        current = current['profiles']
    candidate_ids = sorted({int(profile['assigned_number']) for profile in current}-{7})
    if len(candidate_ids)!=30:
        raise ValueError('Expected user7 and the existing 30 benchmark surveys')
    benchmark_ids = set(candidate_ids)
    def prohibited(row):
        a,b = int(row['ranker_number']),int(row['ranked_number'])
        return (a==7 and b in benchmark_ids) or (b==7 and a in benchmark_ids)

    selected,selection_inputs = selections()
    input_paths = [ROOT/'.tmp-survey-search-older-personalization.json',ROOT/'.tmp-mbti16-20260923-data-personalization.json']
    datasets = [read(path) for path in input_paths]
    profiles = {(int(profile['event_id']),int(profile['assigned_number'])):profile for dataset in datasets for profile in dataset['profiles']}
    raw = {key:[row for dataset in datasets for row in dataset[key]] for key in ['rankings','one_to_one_feedback']}
    all_feedback,_ = connection.feedback_rows(raw,profiles)
    all_feedback = [row for row in all_feedback if 20<=row['event_id']<=28]
    prior_manual = connection.trainer.ranking_rows(raw,list(range(20,29)),False)
    prior_all_rankings = connection.trainer.ranking_rows(raw,list(range(20,29)),True)
    feedback = [row for row in all_feedback if not prohibited(row)]
    purged_raw = {'rankings':[row for row in raw['rankings'] if not prohibited(row)]}
    # Rebuild ballots after purge, so removed benchmark rank positions cannot
    # indirectly change the normalized labels of retained, unrelated partners.
    manual = connection.trainer.ranking_rows(purged_raw,list(range(20,29)),False)
    rankings = connection.trainer.ranking_rows(purged_raw,list(range(20,29)),True)
    assert not any(prohibited(row) for row in feedback+manual+rankings)
    current_profiles = {(29,int(profile['assigned_number'])):profile for profile in current}
    profiles.update(current_profiles)
    queries = [dict(event_id=29,ranker_number=a,ranked_number=b) for number in candidate_ids for a,b in [(7,number),(number,7)]]
    base = connection.fit(connection.BY_NAME['connect_joint75_pairridge'],feedback,rankings,profiles)
    scores = {'shared':np.asarray(base.predict(queries))}
    for config in personal.CONFIGS:
        fitted = personal.fit(config,feedback,manual,profiles,base)
        scores[config['name']] = fitted.predict(queries)
    primary = selected['primary_locked']['selected']
    scores['personal_selected_connection'] = scores[primary['connection']]
    scores['personal_selected_ranking'] = scores[primary['ranking']]
    for protocol,selection in selected.items():
        if protocol=='primary_locked':
            continue
        for objective,model_name in selection['selected'].items():
            scores[f'{protocol}_{objective}'] = scores[model_name]
    frozen_path = ROOT/'tmp/training-2026-09-17/frozen-v12-config.json'
    scores['frozen_v12'] = connection.trainer.incumbent_predictions(queries,profiles,read(frozen_path))

    # Category labels enter only now, after selection, pair purge, fit and score.
    source_tree = ast.parse((ROOT/'scripts/evaluate-mbti16.py').read_text(encoding='utf8'))
    benchmark_categories = None
    for node in source_tree.body:
        if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='LABELS' for target in node.targets):
            benchmark_categories = ast.literal_eval(node.value)
            break
    labels = {int(number):category for category,numbers in benchmark_categories.items() for number in numbers}
    if set(labels)!=benchmark_ids:
        raise AssertionError('Survey roster differs from the original benchmark definition')
    tasks = {'liked_vs_disliked':({'romantic','friendly'},{'disliked'}),
             'romantic_vs_disliked':({'romantic'},{'disliked'}),
             'friends_vs_disliked':({'friendly'},{'disliked'}),
             'romantic_vs_friends':({'romantic'},{'friendly'})}
    metric = {}
    for name,values in scores.items():
        metric[name] = {}
        for task,(positive,negative) in tasks.items():
            ids = [i for i,number in enumerate(candidate_ids) if labels[number] in positive|negative]
            metric[name][task] = float(roc_auc_score([labels[candidate_ids[i]] in positive for i in ids],[values[2*i] for i in ids]))
    main_names = ['frozen_v12','shared','personal_selected_connection','personal_selected_ranking']
    sensitivity_names = [name for name in scores if name not in main_names and not name.startswith('personal_kernel_') and not name.startswith('personal_ridge_')]
    people = [dict(participant_number=number,category=labels[number],scores={
        name:dict(user7_to_person=float(values[2*i]),person_to_user7=float(values[2*i+1]),minimum_bidirectional=float(min(values[2*i],values[2*i+1])))
        for name,values in scores.items()}) for i,number in enumerate(candidate_ids)]
    output = dict(protocol=dict(purpose='Does user7 history about unrelated earlier partners improve over the exact same shared model?',
                    query_event=29,history_events=list(range(20,29)),
                    purge='Every ranking/feedback direction for unordered pair (7, any of the 30 benchmark IDs) is removed from both global and personal training. Ranking percentiles rebuilt after purge.',
                    primary_selection='Previously locked development-event23–26 selection, with no benchmark category use. Its development histories may contain some event interactions with benchmark participants; this limitation is disclosed.',
                    selection_sensitivity='Chooser7-excluded selection reuses stored development predictions, without refitting their shared models. It removes direct user7 development objectives but is not a wholly benchmark-purged nested development experiment.',
                    global_model='Fixed joint75 model on all available historical20–28 feedback and rankings including auto-saved.',
                    personal='Only explicit/manual earlier rankings plus wantConnect feedback, exact-target exclusion retained, sparse-history shrinkage and no-history global fallback.',
                    outcome_labels='Static benchmark categories read only after every selection, fit and prediction. No benchmark-driven model choice.',
                    exploratory='All 10 fixed personal variants are shown separately for transparency and must not be selected by benchmark performance.',
                    score='Raw uncalibrated directed utility; reverse scores and min-bidirectional are descriptive without partner benchmark labels.',
                    frozen_reference_limit='FrozenV12 is an immutable descriptive original artifact; unlike shared/personal models in this audit, its original training history cannot be retrospectively benchmark-pair purged.',
                    currentness='Uses restored current benchmark surveys; old event surveys may contain reconstructed/current fields. Present-day audit, not a historical holdout.',
                    production_changed=False),
                  selections=selected,own_history_before=history_counts(all_feedback,prior_manual),own_history_after=history_counts(feedback,manual),
                  training_counts=dict(feedback_before=len(all_feedback),feedback_after=len(feedback),
                                       global_ranking_before=len(prior_all_rankings),global_ranking_after=len(rankings),
                                       personal_manual_before=len(prior_manual),personal_manual_after=len(manual)),
                  primary_category_auc={name:metric[name] for name in main_names},
                  sensitivity_category_auc={name:metric[name] for name in sensitivity_names},
                  exploratory_all10_category_auc={config['name']:metric[config['name']] for config in personal.CONFIGS},
                  primary_personal_minus_shared={name:{task:metric[name][task]-metric['shared'][task] for task in tasks} for name in ['personal_selected_connection','personal_selected_ranking']},
                  max_user7_score_adjustment={name:float(np.max(np.abs(scores[name][::2]-scores['shared'][::2]))) for name in scores if name!='frozen_v12'},
                  people=people,
                  input_sha256={path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in input_paths+[benchmark_path,frozen_path]+selection_inputs},
                  source_sha256={path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__),Path(__file__).with_name('models.py')]})
    write('user7-report.json',output)
    write_csv(people)
    print(json.dumps({key:output[key] for key in ['own_history_before','own_history_after','primary_category_auc','primary_personal_minus_shared']},indent=2))


if __name__=='__main__':
    main()
