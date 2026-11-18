"""Direct wantConnect model experiment; offline, nested, survey-only.

The fixed candidate set is selected using participant-purged inner CV on past
feedback, then evaluated on later events. Outer candidate leaderboards are
exploratory. Older current-profile snapshots are an explicit sensitivity only.
No participant acquaintance labels are loaded or used. No production writes.
"""
import os
for _env in ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS']:
    os.environ[_env] = '1'
import argparse
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'tmp/survey-search-2026-09-23'
RECENT = ROOT/'.tmp-mbti16-20260923-data-personalization.json'
OLDER = ROOT/'.tmp-survey-search-older-personalization.json'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


nl = load('connection_nonlinear', Path(__file__).with_name('nonlinear.py'))
retrieval = load('connection_retrieval', Path(__file__).with_name('retrieval.py'))
trainer = load('connection_original_trainer', ROOT/'scripts/train-personalized-compatibility.py')

CONFIGS = [
    dict(name='connect_target_ridge100', engine='nonlinear', family='ridge', features='target', alpha=100),
    dict(name='connect_pair_ridge50', engine='nonlinear', family='ridge', features='pair', alpha=50),
    dict(name='connect_semantic_ridge100', engine='nonlinear', family='ridge', features='semantic', alpha=100),
    dict(name='connect_cross_ridge300', engine='nonlinear', family='ridge', features='cross', alpha=300),
    dict(name='connect_pair_logistic_001', engine='pointwise', features='pair', c=.01),
    dict(name='connect_cross_logistic_003', engine='pointwise', features='cross', c=.03),
    dict(name='connect_trees4', engine='nonlinear', family='trees', features='pair', depth=4, min_leaf=15),
    dict(name='connect_tensor_smooth', engine='retrieval', family='survey_tensor_kernel', kind='tensor', kernel='rbf', beta=2., alpha=3., anchors=128),
    dict(name='connect_joint50_pairridge', engine='joint', features='pair', alpha=50, feedback_weight=.5),
    dict(name='connect_joint75_pairridge', engine='joint', features='pair', alpha=50, feedback_weight=.75),
]
BY_NAME = {config['name']: config for config in CONFIGS}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/name).write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False)+'\n', encoding='utf8')


def auc(labels, scores):
    return float(roc_auc_score(labels, scores)) if len(set(labels)) == 2 else None


def key(row):
    return row['event_id'], row['ranker_number']


def balanced_weights(rows):
    counts = collections.Counter(key(r) for r in rows)
    weights = np.asarray([1/counts[key(r)] for r in rows], dtype=float)
    return weights/weights.sum()


def feedback_rows(data, profiles):
    kept, excluded, seen = [], collections.Counter(), set()
    for source in data['one_to_one_feedback']:
        row = dict(source)
        event, chooser, target = [int(row[k]) for k in ['event_id', 'ranker_number', 'ranked_number']]
        identity = (event, chooser, target, int(row.get('phase', 0)))
        if identity in seen:
            excluded['duplicate_response'] += 1
            continue
        seen.add(identity)
        if row.get('partner_in_event_roster') is not True or chooser == target:
            excluded['invalid_partner'] += 1
            continue
        if not all((event, person) in profiles for person in [chooser, target]):
            excluded['missing_survey'] += 1
            continue
        if row.get('meetingOccurred') is False or row.get('meetingStatus') not in [None, 'met']:
            excluded['did_not_meet'] += 1
            continue
        if not isinstance(row.get('wantConnect'), bool):
            excluded['no_boolean_wantConnect'] += 1
            continue
        row.update(event_id=event, ranker_number=chooser, ranked_number=target,
                   phase=identity[-1], y=float(row['wantConnect']),
                   explicit_met=row.get('meetingOccurred') is True or row.get('meetingStatus') == 'met')
        kept.append(row)
    return kept, dict(excluded)


class DirectModel:
    def __init__(self, config, feedback, rankings, profiles):
        self.config, self.profiles = config, profiles
        self.vectorizer = DictVectorizer(sparse=True)
        self.scaler = StandardScaler(with_mean=False)
        train = feedback + rankings if config['engine'] == 'joint' and rankings else feedback
        x = self.scaler.fit_transform(self.vectorizer.fit_transform([self.features(r) for r in train]))
        y = np.asarray([r['y'] for r in train])
        if len(train) > len(feedback):
            lam = config['feedback_weight']
            weights = np.r_[lam*balanced_weights(feedback), (1-lam)*balanced_weights(rankings)] * len(feedback)
        else:
            weights = balanced_weights(feedback) * len(feedback)
        self.constant = float(y.mean()) if len(set(y)) == 1 else None
        if self.constant is not None:
            self.model = None
        elif config['engine'] == 'pointwise':
            self.model = LogisticRegression(C=config['c'], solver='liblinear', max_iter=500,
                                            random_state=260923).fit(x, y, sample_weight=weights)
        else:
            self.model = Ridge(alpha=config['alpha'], solver='lsqr').fit(x, y, sample_weight=weights)

    def features(self, row):
        return nl.feature_dict(self.profiles[(row['event_id'], row['ranker_number'])],
                               self.profiles[(row['event_id'], row['ranked_number'])], self.config['features'])

    def predict(self, rows):
        if not rows:
            return np.zeros(0)
        if self.constant is not None:
            return np.full(len(rows), self.constant)
        x = self.scaler.transform(self.vectorizer.transform([self.features(r) for r in rows]))
        return self.model.predict_proba(x)[:, 1] if self.config['engine'] == 'pointwise' else self.model.predict(x)


def fit(config, feedback, rankings, profiles):
    if config['engine'] in {'joint', 'pointwise'}:
        return DirectModel(config, feedback, rankings, profiles)
    return (nl if config['engine'] == 'nonlinear' else retrieval).fit(config, feedback, profiles)


def normalized(model, train, rows):
    reference = np.sort(np.asarray(model.predict(train)))
    values = np.asarray(model.predict(rows))
    # Percentile scores provide comparable fold scales. They are not calibrated
    # connection probabilities. Both reference and model use past labels only.
    return (np.searchsorted(reference, values, side='left') + np.searchsorted(reference, values, side='right') + 1)/(2*(len(reference)+1))


def inner_select(feedback, rankings, profiles):
    people = np.asarray([r['ranker_number'] for r in feedback])
    nfolds = min(3, len(set(people)))
    if nfolds < 2:
        return dict(selected=CONFIGS[0]['name'], inner_auc={}, folds=[], reason='Too few training people for CV')
    scores = {c['name']: np.zeros(len(feedback)) for c in CONFIGS}
    manifest = []
    for ti, vi in GroupKFold(n_splits=nfolds, shuffle=True, random_state=260923).split(np.arange(len(feedback)), groups=people):
        held = set(people[vi])
        train = [feedback[i] for i in ti if feedback[i]['ranked_number'] not in held]
        ranks = [r for r in rankings if r['ranker_number'] not in held and r['ranked_number'] not in held]
        test = [feedback[i] for i in vi]
        assert all(not (held & {r['ranker_number'], r['ranked_number']}) for r in train+ranks)
        for config in CONFIGS:
            if not train:
                scores[config['name']][vi] = .5
                continue
            model = fit(config, train, ranks, profiles)
            scores[config['name']][vi] = normalized(model, train, test)
        manifest.append(dict(train_feedback=len(train), train_rankings=len(ranks), test_feedback=len(test), held_people=sorted(int(x) for x in held)))
    results = {name: auc([r['wantConnect'] for r in feedback], pred) for name, pred in scores.items()}
    # A train-only no-information baseline is eligible; avoid deploying a model
    # when no candidate beats .5 in its own honest inner selection.
    results['zero_information'] = .5
    selected = sorted(results, key=lambda name: (-(results[name] if results[name] is not None else .5), name))[0]
    return dict(selected=selected, inner_auc=results, folds=manifest)


def group_auc(rows, scores):
    groups = collections.defaultdict(list)
    for i, r in enumerate(rows):
        groups[key(r)].append(i)
    result = []
    for ids in groups.values():
        value = auc([rows[i]['wantConnect'] for i in ids], np.asarray(scores)[ids])
        if value is not None:
            result.append(value)
    return (float(np.mean(result)) if result else None), len(result)


def top_choices(rows, scores):
    # A person can meet the same partner in two phases: use the final phase for
    # shortlist utility, so duplicate encounters cannot occupy multiple slots.
    unique = {}
    for i, r in enumerate(rows):
        pair = (r['event_id'], r['ranker_number'], r['ranked_number'])
        if pair not in unique or r['phase'] > rows[unique[pair]]['phase']:
            unique[pair] = i
    grouped = collections.defaultdict(list)
    for i in unique.values():
        grouped[key(rows[i])].append(i)
    positive, selected_mass, all_positive, eligible = 0., 0., 0., 0
    informative = 0
    for ids in grouped.values():
        if len(ids) < 2:
            continue
        values = np.asarray(scores)[ids]
        labels = np.asarray([rows[i]['wantConnect'] for i in ids], float)
        take = max(1, int(np.ceil(.2*len(ids))))
        threshold = np.partition(values, -take)[-take]
        definite, tied = values > threshold, values == threshold
        remaining = take-int(definite.sum())
        positive += float(labels[definite].sum() + remaining*labels[tied].mean())
        selected_mass += take
        all_positive += labels.sum()
        eligible += len(ids)
        informative += 1
    precision = positive/selected_mass if selected_mass else None
    base = all_positive/eligible if eligible else None
    return dict(people_events_with_choice=informative, eligible_partner_options=eligible,
                recommended_options=selected_mass, positive_recommendations_expected_under_ties=positive,
                precision=precision, eligible_base_positive_rate=base,
                precision_lift=(precision/base if precision is not None and base else None),
                positive_sample_coverage=(positive/all_positive if all_positive else None),
                option_coverage=(selected_mass/eligible if eligible else None))


def metrics(rows, scores):
    within, informative = group_auc(rows, scores)
    event_aucs, event_pair_weights = [], []
    for event in sorted({r['event_id'] for r in rows}):
        ids = [i for i,r in enumerate(rows) if r['event_id']==event]
        labels = [rows[i]['wantConnect'] for i in ids]
        event_auc = auc(labels,np.asarray(scores)[ids])
        if event_auc is not None:
            event_aucs.append(event_auc)
            event_pair_weights.append(sum(labels)*(len(labels)-sum(labels)))
    return dict(directions=len(rows), people=len({r['ranker_number'] for r in rows}),
                positive=sum(r['wantConnect'] for r in rows),
                want_connect_auc=auc([r['wantConnect'] for r in rows], scores),
                event_macro_auc=float(np.mean(event_aucs)) if event_aucs else None,
                event_pair_weighted_auc=float(np.average(event_aucs,weights=event_pair_weights)) if event_aucs else None,
                within_person_auc=within, informative_person_events=informative,
                top20_percent_within_person=top_choices(rows, scores))


def mutual_metrics(rows, scores):
    lookup = {(r['event_id'], r['phase'], r['ranker_number'], r['ranked_number']): i for i,r in enumerate(rows)}
    labels, values = [], []
    for (event, phase, a, b), i in lookup.items():
        if a >= b or (event, phase, b, a) not in lookup:
            continue
        j = lookup[event, phase, b, a]
        labels.append(bool(rows[i]['wantConnect'] and rows[j]['wantConnect']))
        values.append(min(scores[i], scores[j]))
    return dict(fully_observed_pair_phases=len(labels), mutually_positive=sum(labels),
                mutual_auc=auc(labels, values), combining_rule='minimum of both directed survey scores')


def bootstrap(rows, predictions, base, selected, count=2000):
    groups = collections.defaultdict(list)
    for i,r in enumerate(rows):
        groups[r['ranker_number']].append(i)
    groups = list(groups.values())
    labels = np.asarray([r['wantConnect'] for r in rows])
    a, b = np.asarray(predictions[base]), np.asarray(predictions[selected])
    rng, deltas = np.random.default_rng(260923), []
    for _ in range(count):
        ids = np.concatenate([groups[i] for i in rng.integers(0,len(groups),len(groups))])
        if len(set(labels[ids])) == 2:
            deltas.append(roc_auc_score(labels[ids], b[ids])-roc_auc_score(labels[ids], a[ids]))
    return dict(mean_delta=auc(labels,b)-auc(labels,a), bootstrap95=np.quantile(deltas,[.025,.975]).tolist(), valid_resamples=len(deltas))


def choice_bootstrap(rows, predictions, base, selected, count=5000):
    """Cluster chooser-level within-event discrimination and shortlist utility."""
    people = sorted({r['ranker_number'] for r in rows})
    local = []
    for person in people:
        ids = [i for i,r in enumerate(rows) if r['ranker_number']==person]
        subset = [rows[i] for i in ids]
        aa,bb = np.asarray(predictions[base])[ids],np.asarray(predictions[selected])[ids]
        ma,na = group_auc(subset,aa)
        mb,nb = group_auc(subset,bb)
        ca,cb = top_choices(subset,aa),top_choices(subset,bb)
        assert na==nb and ca['recommended_options']==cb['recommended_options']
        local.append([((mb-ma)*na if na else 0.),na,
                      cb['positive_recommendations_expected_under_ties']-ca['positive_recommendations_expected_under_ties'],ca['recommended_options']])
    local = np.asarray(local)
    rng = np.random.default_rng(260923)
    totals = local[rng.integers(0,len(local),size=(count,len(local)))].sum(axis=1)
    result = {}
    for name,numerator,denominator in [('within_person_auc',0,1),('shortlist_precision',2,3)]:
        valid = totals[:,denominator]>0
        changes = totals[valid,numerator]/totals[valid,denominator]
        result[name] = dict(mean_delta=float(local[:,numerator].sum()/local[:,denominator].sum()),
                            bootstrap95=np.quantile(changes,[.025,.975]).tolist(),valid_resamples=int(valid.sum()))
    return result


def evaluate_event(event, feedback, rankings, profiles):
    train = [r for r in feedback if r['event_id'] < event]
    ranks = [r for r in rankings if r['event_id'] < event]
    test = [r for r in feedback if r['event_id'] == event]
    tuned = inner_select(train, ranks, profiles)
    predictions = {}
    for config in CONFIGS:
        fitted = fit(config, train, ranks, profiles)
        predictions[config['name']] = normalized(fitted,train,test)
    predictions['zero_information'] = np.full(len(test), .5)
    predictions['nested_selected'] = predictions[tuned['selected']]
    frozen = read(ROOT/'tmp/training-2026-09-17/frozen-v12-config.json')
    predictions['frozen_v12'] = trainer.incumbent_predictions(test,profiles,frozen)
    bundle = trainer.fit_full(ranks,profiles,2,10,.1,False)
    predictions['ranking_v12_refit'] = trainer.calibrated_predictions(bundle,ranks,test,profiles)[0]
    # These saved ranking-only scores were selected independently for ranking
    # quality. Lookup is read-only and cannot affect direct-outcome selection.
    saved_path = OUT/f'temporal-{event}-predictions.json'
    if saved_path.exists():
        saved = read(saved_path)
        prior = {(r['event_id'],r['ranker_number'],r['ranked_number'],r['phase']): r for r in saved['feedback']}
        if all((r['event_id'],r['ranker_number'],r['ranked_number'],r['phase']) in prior for r in test):
            for prior_name in ['selected','selected_blend','top3_ensemble']:
                predictions['ranking_only_'+prior_name] = np.asarray([prior[r['event_id'],r['ranker_number'],r['ranked_number'],r['phase']]['scores'][prior_name] for r in test])
    report = dict(event=event,train_feedback=len(train),train_rankings=len(ranks),tuning=tuned,
                  models={name:metrics(test,pred) for name,pred in predictions.items()},
                  mutual={name:mutual_metrics(test,pred) for name,pred in predictions.items()})
    saved = [dict({k:r[k] for k in ['event_id','ranker_number','ranked_number','phase','wantConnect','explicit_met']},
                  scores={name:float(v[i]) for name,v in predictions.items()}) for i,r in enumerate(test)]
    print(f'connection event{event}: inner-selected {tuned["selected"]}; AUC {report["models"]["nested_selected"]["want_connect_auc"]:.4f}; frozen {report["models"]["frozen_v12"]["want_connect_auc"]:.4f}',flush=True)
    return report, saved


def refresh_ranking_references(mode):
    """Attach completed independent ranking experiment scores without refitting."""
    summary_path = OUT/f'connection-{mode}-summary.json'
    if not summary_path.exists():
        return False
    saved = read(OUT/f'connection-{mode}-predictions.json')
    summary = read(summary_path)
    lookup = {}
    for event in [27,28]:
        path = OUT/f'temporal-{event}-predictions.json'
        if not path.exists():
            return False
        for r in read(path)['feedback']:
            lookup[(r['event_id'],r['ranker_number'],r['ranked_number'],r['phase'])] = r
    if not all((r['event_id'],r['ranker_number'],r['ranked_number'],r['phase']) in lookup for r in saved):
        return False
    for row in saved:
        prior = lookup[row['event_id'],row['ranker_number'],row['ranked_number'],row['phase']]
        for name in ['selected','selected_blend','top3_ensemble']:
            row['scores']['ranking_only_'+name] = prior['scores'][name]
    names = list(saved[0]['scores'])
    for name in names:
        values = np.asarray([r['scores'][name] for r in saved])
        summary['pooled'][name] = metrics(saved,values)
        summary['mutual_pooled'][name] = mutual_metrics(saved,values)
        summary['explicit_met'][name] = metrics([r for r in saved if r['explicit_met']],
                                               [v for r,v in zip(saved,values) if r['explicit_met']])
        for event in [27,28]:
            ids = [i for i,r in enumerate(saved) if r['event_id']==event]
            subset = [saved[i] for i in ids]
            summary['events'][str(event)]['models'][name] = metrics(subset,values[ids])
            summary['events'][str(event)]['mutual'][name] = mutual_metrics(subset,values[ids])
    predictions = {name:np.asarray([r['scores'][name] for r in saved]) for name in names}
    summary['nested_selected_vs_baselines']['ranking_only_selected'] = bootstrap(saved,predictions,'ranking_only_selected','nested_selected')
    summary['choice_bootstrap_vs_baselines'] = {base:choice_bootstrap(saved,predictions,base,'nested_selected') for base in ['frozen_v12','ranking_v12_refit','zero_information','ranking_only_selected']}
    summary['protocol']['ranking_only_reference'] = 'Independent ranking search recent-event27/28 out-of-event predictions, with its own ranking-only inner selection. Attached after direct-model fitting; not used for tuning. These references always use recent26–28 training even in older sensitivity.'
    summary['protocol']['event_scale_caution'] = 'Pooled AUC compares scores from distinct event-trained models and can reflect between-event score distribution shifts. Event-macro/pair-weighted AUC and within-person AUC avoid between-event score comparisons.'
    write(f'connection-{mode}-summary.json',summary)
    write(f'connection-{mode}-predictions.json',saved)
    for event in [27,28]:
        write(f'connection-{mode}-event{event}.json',summary['events'][str(event)])
    return True


def user7_benchmark():
    """Select/refit four protocols before reading acquaintance labels."""
    fitted, training, selections, profile_maps = {}, {}, {}, {}
    for history in ['recent','expanded']:
        datasets = [read(RECENT)]+([read(OLDER)] if history=='expanded' else [])
        profiles = {(int(p['event_id']),int(p['assigned_number'])):p for data in datasets for p in data['profiles']}
        data = {key:sum([d[key] for d in datasets],[]) for key in ['profiles','rankings','one_to_one_feedback']}
        feedback,_ = feedback_rows(data,profiles)
        ranks = trainer.ranking_rows(data,sorted({r['event_id'] for r in feedback}),True)
        for mode in ['full','user7_purged']:
            name = history+'_'+mode
            ff = [r for r in feedback if mode=='full' or 7 not in [r['ranker_number'],r['ranked_number']]]
            rr = [r for r in ranks if mode=='full' or 7 not in [r['ranker_number'],r['ranked_number']]]
            selected = inner_select(ff,rr,profiles)
            model = fit(BY_NAME[selected['selected']],ff,rr,profiles) if selected['selected']!='zero_information' else None
            selections[name] = dict(tuning=selected,training_feedback=len(ff),training_rankings=len(rr),
                                    removed_feedback=len(feedback)-len(ff),removed_rankings=len(ranks)-len(rr),
                                    personalized_to_chooser_survey=selected['selected'] not in ['zero_information','connect_target_ridge100'])
            fitted[name],training[name],profile_maps[name] = model,ff,profiles
            print(f'user7 pre-label selection {name}: {selected["selected"]}',flush=True)
    # Label definitions enter only here, after all model selection and fitting.
    benchmark = load('connection_benchmark_definitions',ROOT/'scripts/evaluate-mbti16.py')
    source = read(ROOT/'.tmp-mbti16-20260923-user7-personalization.json')
    if isinstance(source,dict):
        source = source['profiles']
    new_profiles = {(0,int(p['assigned_number'])):p for p in source}
    labels = {int(n):label for label,ns in benchmark.LABELS.items() for n in ns}
    candidates = sorted(labels)
    directions = [dict(event_id=0,ranker_number=a,ranked_number=b) for n in candidates for a,b in [(7,n),(n,7)]]
    scores = {}
    for name,model in fitted.items():
        profile_maps[name].update(new_profiles)
        scores[name] = normalized(model,training[name],directions) if model is not None else np.full(len(directions),.5)
    frozen = read(ROOT/'tmp/training-2026-09-17/frozen-v12-config.json')
    scores['frozen_v12'] = trainer.incumbent_predictions(directions,new_profiles,frozen)
    category_tasks = {
        'liked_vs_disliked':({'romantic','friendly'},{'disliked'}),
        'romantic_vs_disliked':({'romantic'},{'disliked'}),
        'friends_vs_disliked':({'friendly'},{'disliked'}),
        'romantic_vs_friends':({'romantic'},{'friendly'}),
    }
    metrics_by_model = {}
    for name,values in scores.items():
        metrics_by_model[name] = {}
        for task,(positive,negative) in category_tasks.items():
            ids = [i for i,n in enumerate(candidates) if labels[n] in positive|negative]
            truth = [labels[candidates[i]] in positive for i in ids]
            metrics_by_model[name][task] = auc(truth,[values[2*i] for i in ids])
    report = dict(protocol=dict(label_use='All four pipelines selected and fitted before benchmark labels are loaded. Labels evaluate only, never tune/select.',
                                 candidate_configs=CONFIGS,selection_seed=260923,
                                 inputs={str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [RECENT,OLDER,ROOT/'.tmp-mbti16-20260923-user7-personalization.json',ROOT/'tmp/training-2026-09-17/frozen-v12-config.json']},
                                 no_best_benchmark_selection=True,
                                 purging='User7 removed from BOTH endpoints of BOTH ranking and feedback training before inner CV selection and final refit.',
                                 directional='Category AUC uses only user7 -> other score; reverse scores lack counterpart labels and are descriptive only.',
                                 expanded_caution='Older-event current profile snapshots may differ from event-time answers; expanded is sensitivity, not definitive chronological validation.',
                                 baseline='Frozen original V12 artifact, directional and no AI adjustment.',
                                 target_only_caution='A target-only winner uses candidate survey answers but ignores chooser survey answers; marked personalized_to_chooser_survey=false.'),
                  selection=selections,category_metrics=metrics_by_model,
                  people=[dict(participant_number=n,category=labels[n],scores={name:dict(user7_to_person=float(values[2*i]),person_to_user7=float(values[2*i+1]),minimum_bidirectional=float(min(values[2*i],values[2*i+1]))) for name,values in scores.items()}) for i,n in enumerate(candidates)])
    write('connection-user7-report.json',report)
    print(json.dumps(metrics_by_model,indent=2),flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--older',action='store_true')
    parser.add_argument('--refresh-ranking-references',action='store_true')
    parser.add_argument('--user7',action='store_true')
    args = parser.parse_args()
    if args.refresh_ranking_references:
        print(json.dumps({mode:refresh_ranking_references(mode) for mode in ['recent','older-sensitivity']}))
        return
    if args.user7:
        user7_benchmark()
        return
    paths = [RECENT]+([OLDER] if args.older else [])
    datasets = [read(path) for path in paths]
    profiles = {(int(p['event_id']),int(p['assigned_number'])):p for data in datasets for p in data['profiles']}
    data = {key:sum([d[key] for d in datasets],[]) for key in ['profiles','rankings','one_to_one_feedback']}
    feedback, exclusions = feedback_rows(data,profiles)
    rankings = trainer.ranking_rows(data, sorted({r['event_id'] for r in feedback}), True)
    mode = 'older-sensitivity' if args.older else 'recent'
    protocol = dict(configs=CONFIGS, purpose='Directly predict actual wantConnect from surveys',
                    selection='3-fold chooser-group CV purges held people from both endpoints of past feedback AND past rankings; chooses AUC, then predicts later event.',
                    outer='Train earlier events, test27; train earlier events, test28. Test labels never used in feature/scaler/model/selection fit.',
                    caveat='This is a follow-up analysis after inspecting earlier event results; prospective evidence is still required. Outer per-candidate results are exploratory.',
                    score='Train-reference empirical percentiles, not probabilities of connection.',
                    event_scale_caution='Pooled AUC compares scores from distinct event-trained models and can reflect between-event score distribution shifts. Event-macro/pair-weighted AUC and within-person AUC avoid between-event score comparisons.',
                    history='No identity embeddings or identity-based memory. Survey pair features only.',
                    response_policy='Boolean wantConnect and verified roster partner required; explicit did-not-meet excluded; legacy missing meeting flags assumed met. Compatibility rating is not required.',
                    older_caution='Historical snapshot sensitivity: current profile answers may postdate events20–25. Exact feedback timestamps unknown. Event21 has feedback but no rankings.' if args.older else None,
                    bootstrap='Paired stable-chooser cluster bootstrap; fixed fitted predictions, does not capture all shared-partner dependence or model-selection uncertainty.',
                    inputs={str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths},production_changed=False)
    results, saved = {}, []
    for event in [27,28]:
        report, predictions = evaluate_event(event,feedback,rankings,profiles)
        results[str(event)] = report
        saved.extend(predictions)
        write(f'connection-{mode}-event{event}.json',report)
    common = set.intersection(*(set(r['scores']) for r in saved))
    predictions = {name:np.asarray([r['scores'][name] for r in saved]) for name in sorted(common)}
    summary = dict(protocol=protocol,coverage=dict(excluded=exclusions,events={str(event):dict(directions=sum(r['event_id']==event for r in feedback),positive=sum(r['wantConnect'] for r in feedback if r['event_id']==event)) for event in sorted({r['event_id'] for r in feedback})}),
                   events=results,pooled={name:metrics(saved,values) for name,values in predictions.items()},
                   mutual_pooled={name:mutual_metrics(saved,values) for name,values in predictions.items()},
                   nested_selected_vs_baselines={base:bootstrap(saved,predictions,base,'nested_selected') for base in ['frozen_v12','ranking_v12_refit','zero_information']},
                   choice_bootstrap_vs_baselines={base:choice_bootstrap(saved,predictions,base,'nested_selected') for base in ['frozen_v12','ranking_v12_refit','zero_information']},
                   explicit_met={name:metrics([r for r in saved if r['explicit_met']],[value for r,value in zip(saved,values) if r['explicit_met']]) for name,values in predictions.items()})
    summary['exploratory_outer_leaderboard'] = sorted(BY_NAME,key=lambda name:-summary['pooled'][name]['want_connect_auc'])
    write(f'connection-{mode}-summary.json',summary)
    write(f'connection-{mode}-predictions.json',saved)
    print(json.dumps({'mode':mode,'pooled_nested_selected':summary['pooled']['nested_selected'],'vs_baselines':summary['nested_selected_vs_baselines']},indent=2),flush=True)


if __name__ == '__main__':
    main()
