"""Offline personal-taste ablation: earlier own feedback only; no production edits.

Choose fixed personal-layer parameters on events23–26, then lock for27–28.
The same global fit is used with/without personal adaptation. Timestamp-based
availability is conservative because feedback has row updates, not submissions.
"""
import os
for var in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS']:
    os.environ[var]='1'
import argparse
import collections
from datetime import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import warnings
import numpy as np
from scipy.stats import ConstantInputWarning

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tmp/personal-history-2026-09-23'
OUT.mkdir(parents=True,exist_ok=True)

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);sys.modules[name]=module
    spec.loader.exec_module(module);return module

c=load('ph_connection',ROOT/'scripts/survey-search/connection.py')
s=load('ph_ranking',ROOT/'scripts/survey-search/search.py')
p=load('ph_models',Path(__file__).with_name('models.py'))

def read(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def write(name,value):
    (OUT/name).write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf8')
def when(value):return datetime.fromisoformat(value.replace('Z','+00:00')) if value else None

def inputs():
    paths=[ROOT/'.tmp-survey-search-older-personalization.json',ROOT/'.tmp-mbti16-20260923-data-personalization.json']
    sources=[read(path) for path in paths]
    profiles={(int(x['event_id']),int(x['assigned_number'])):x for d in sources for x in d['profiles']}
    data={k:[x for d in sources for x in d[k]] for k in ['rankings','one_to_one_feedback']}
    feedback,excluded=c.feedback_rows(data,profiles)
    rawranks={(int(r['event_id']),int(r['ranker_number']),int(r['ranked_number'])):r for r in data['rankings']}
    def ranks(auto):
        rows=c.trainer.ranking_rows(data,list(range(20,29)),auto)
        for row in rows:row['submitted_at']=rawranks[row['event_id'],row['ranker_number'],row['ranked_number']]['submitted_at']
        return rows
    return profiles,feedback,ranks(True),ranks(False),dict(excluded=excluded,input_sha256={x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in paths})

def available(rows,event,cutoffs,mode,source):
    earlier=[r for r in rows if r['event_id']<event]
    if mode=='event_order':return earlier
    cutoff=when(cutoffs[str(event)]['cutoff_utc'])
    field='match_row_updated_at' if source=='feedback' else 'submitted_at'
    return [r for r in earlier if r.get(field) and when(r[field])<cutoff]

def fit_shared(feedback,rankings,profiles):
    if feedback:
        return c.fit(c.BY_NAME['connect_joint75_pairridge'],feedback,rankings,profiles),'joint75'
    if not rankings:raise ValueError('No earlier training outcomes')
    return c.nl.fit(dict(name='ranking_only_fallback',family='ridge',features='pair',alpha=50),rankings,profiles),'ranking_only_fallback_no_timestamp_confirmed_connection_labels'

def history_details(query,feedback,rankings,profiles):
    a,b=query['ranker_number'],query['ranked_number']
    ownf=[r for r in feedback if r['ranker_number']==a]
    ownr=[r for r in rankings if r['ranker_number']==a]
    own=ownf+ownr
    usable=[r for r in own if r['ranked_number']!=b]
    partners={r['ranked_number'] for r in usable}
    known=any({r['ranker_number'],r['ranked_number']}=={a,b} for r in feedback+rankings)
    return dict(history_events=len({r['event_id'] for r in usable}),history_partners=len(partners),
                history_feedback=len([r for r in ownf if r['ranked_number']!=b]),
                history_rankings=len([r for r in ownr if r['ranked_number']!=b]),
                history_has_both_connection_labels=len({r['wantConnect'] for r in ownf if r['ranked_number']!=b})==2,
                known_partner=known,
                recorded_prior_attendances=sum(e<query['event_id'] and person==a for e,person in profiles),
                raw_own_history_events=len({r['event_id'] for r in own}))

def shuffled(rows,seed):
    rng=np.random.default_rng(seed);result=[dict(r) for r in rows]
    groups=collections.defaultdict(list)
    for i,r in enumerate(result):groups[r['event_id'],r['ranker_number']].append(i)
    for ids in groups.values():
        values=rng.permutation([result[i]['y'] for i in ids])
        for i,value in zip(ids,values):
            result[i]['y']=float(value)
            if 'wantConnect' in result[i]:result[i]['wantConnect']=bool(value)
    return result

def evaluate_fold(event,mode,profiles,feedback,allranks,manual,cutoffs,selected=None,recent_base=False):
    hf=available(feedback,event,cutoffs,mode,'feedback')
    hr=available(manual,event,cutoffs,mode,'ranking')
    gr=available(allranks,event,cutoffs,mode,'ranking')
    gf=hf
    if recent_base:gf=[r for r in hf if r['event_id']>=26];gr=[r for r in gr if r['event_id']>=26]
    base,recipe=fit_shared(gf,gr,profiles)
    tf=[dict(r) for r in feedback if r['event_id']==event]
    tr=[dict(r) for r in manual if r['event_id']==event]
    # Development outcomes used for hyperparameter selection must themselves be
    # available by the first final-test cutoff. Later edits are not backdated.
    if event<27 and mode!='event_order':
        selection_cutoff=when(cutoffs['27']['cutoff_utc'])
        tf=[r for r in tf if r.get('match_row_updated_at') and when(r['match_row_updated_at'])<selection_cutoff]
        tr=[r for r in tr if r.get('submitted_at') and when(r['submitted_at'])<selection_cutoff]
    queries=tf+tr
    scores={'shared':base.predict(queries),'random':np.full(len(queries),.5)}
    for config in p.CONFIGS:
        scores[config['name']]=p.fit(config,hf,hr,profiles,base).predict(queries)
    if selected:
        for outcome,name in selected.items():scores['personal_selected_'+outcome]=scores[name]
        chosen=selected['connection']
        scores['shuffled_personal']=(p.fit(next(x for x in p.CONFIGS if x['name']==chosen),shuffled(hf,13),shuffled(hr,17),profiles,base).predict(queries)
                                      if chosen!='shared' else scores['shared'].copy())
        frozen=read(ROOT/'tmp/training-2026-09-17/frozen-v12-config.json')
        scores['frozen_v12']=c.trainer.incumbent_predictions(queries,profiles,frozen)
        bundle=c.trainer.fit_full(gr,profiles,2,10,.1,False)
        scores['ranking_v12_refit']=c.trainer.calibrated_predictions(bundle,gr,queries,profiles)[0]
    saved=[]
    for i,q in enumerate(queries):
        keep={k:q[k] for k in ['event_id','ranker_number','ranked_number','phase','wantConnect','explicit_met','rank','candidate_count','recorded_rank','y','submitted_at','match_row_updated_at'] if k in q}
        saved.append(dict(keep,**history_details(q,hf,hr,profiles),scores={name:float(v[i]) for name,v in scores.items()}))
    manifest=dict(event=event,mode=mode,cutoff=cutoffs[str(event)],global_recipe=recipe,global_recent_only=recent_base,
        global_feedback=len(gf),global_rankings=len(gr),personal_feedback=len(hf),personal_manual_rankings=len(hr),
        query_feedback=len(tf),query_manual_rankings=len(tr),max_history_event=max(r['event_id'] for r in hf+hr),
        max_feedback_updated_at=max((r['match_row_updated_at'] for r in hf if r.get('match_row_updated_at')),default=None),
        max_ranking_submitted_at=max((r['submitted_at'] for r in gr if r.get('submitted_at')),default=None),
        history_feedback_keys=[[r['event_id'],r['ranker_number'],r['ranked_number'],r['phase'],r.get('match_row_updated_at')] for r in hf],
        history_ranking_keys=[[r['event_id'],r['ranker_number'],r['ranked_number'],r.get('submitted_at')] for r in hr])
    return dict(feedback=saved[:len(tf)],rankings=saved[len(tf):]),manifest

def rank_metrics(rows,values):
    if not rows:return None
    groups=collections.Counter((r['event_id'],r['ranker_number']) for r in rows)
    ids=[i for i,r in enumerate(rows) if groups[r['event_id'],r['ranker_number']]>=2]
    if not ids:return None
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',ConstantInputWarning)
        return s.metrics([rows[i] for i in ids],np.asarray(values)[ids])

def f_metrics(rows,values):return c.metrics(rows,values) if rows else None

def summary(saved,names):
    result={}
    for name in names:
        f,r=saved['feedback'],saved['rankings']
        result[name]=dict(connection=f_metrics(f,[x['scores'][name] for x in f]),
                          ranking=rank_metrics(r,[x['scores'][name] for x in r]),
                          mutual=c.mutual_metrics(f,[x['scores'][name] for x in f]) if f else None)
    return result

def select(development):
    # Separate predeclared objectives: wanting contact vs questionnaire ranking.
    f=[r for r in development['feedback'] if r['history_partners']>=2 and not r['known_partner']]
    r=[r for r in development['rankings'] if r['history_partners']>=2 and not r['known_partner']]
    candidates=['shared']+[x['name'] for x in p.CONFIGS]
    metrics=summary(dict(feedback=f,rankings=r),candidates)
    chosen={}
    for outcome in ['connection','ranking']:
        key='within_person_auc' if outcome=='connection' else 'person_ndcg'
        def score(name):
            m=metrics[name][outcome];return m.get(key) if m and m.get(key) is not None else -.5
        # Prefer unchanged model when development objectives tie.
        chosen[outcome]=sorted(candidates,key=lambda name:(-score(name),name!='shared',name))[0]
    return dict(selected=chosen,development_metrics=metrics,eligible_feedback=len(f),eligible_rankings=len(r),
                rule='Only known-history/new-partner development rows; connection mean chooser-event AUC, ranking mean-person NDCG@3. Shared fallback eligible. Never tune on27/28.')

def changes(rows,kind,base,personal):
    grouped=collections.defaultdict(list)
    for row in rows:grouped[row['event_id'],row['ranker_number']].append(row)
    changes=[]
    for (event,person),group in grouped.items():
        if len(group)<2:continue
        a=np.asarray([r['scores'][base] for r in group]);b=np.asarray([r['scores'][personal] for r in group])
        if kind=='feedback':
            aa=c.auc([r['wantConnect'] for r in group],a);bb=c.auc([r['wantConnect'] for r in group],b)
        else:
            aa=rank_metrics(group,a)['person_ndcg'];bb=rank_metrics(group,b)['person_ndcg']
        changes.append(dict(event_id=event,person=person,metric_change=(bb-aa if aa is not None and bb is not None else None),
            top_choice_changed=set(np.flatnonzero(a==a.max()))!=set(np.flatnonzero(b==b.max())),
            max_absolute_score_adjustment=float(np.max(np.abs(a-b)))))
    deltas=[x['metric_change'] for x in changes if x['metric_change'] is not None]
    return dict(person_events=len(changes),informative=len(deltas),improved=sum(x>1e-10 for x in deltas),
                declined=sum(x< -1e-10 for x in deltas),tied=sum(abs(x)<=1e-10 for x in deltas),
                changed_top_choice=sum(x['top_choice_changed'] for x in changes),details=changes)

def bootstrap_rank(rows,base,personal,count=3000):
    people=collections.defaultdict(list)
    for x in changes(rows,'rankings',base,personal)['details']:
        if x['metric_change'] is not None:people[x['person']].append(x['metric_change'])
    if not people:return None
    values=np.asarray([np.mean(v) for v in people.values()]);rng=np.random.default_rng(260923)
    boot=np.mean(values[rng.integers(0,len(values),(count,len(values)))],axis=1)
    return dict(mean_delta=float(values.mean()),bootstrap95=np.quantile(boot,[.025,.975]).tolist(),people=len(values))

def finish(prefix,saved,selection,manifests):
    primary=['shared','personal_selected_connection','personal_selected_ranking','shuffled_personal','frozen_v12','ranking_v12_refit','random']
    masks={
        'all':lambda r:True,'new_partners':lambda r:not r['known_partner'],
        'returning_new_partners':lambda r:r['history_partners']>=2 and not r['known_partner'],
        'no_usable_history':lambda r:r['history_partners']==0,
        'history_1_event':lambda r:r['raw_own_history_events']==1,
        'history_2_3_events':lambda r:2<=r['raw_own_history_events']<=3,
        'history_4plus_events':lambda r:r['raw_own_history_events']>=4,
        'history_both_yes_no':lambda r:r['history_has_both_connection_labels'],
    }
    strata={key:summary({kind:[r for r in rows if test(r)] for kind,rows in saved.items()},primary) for key,test in masks.items()}
    intervals={}
    for label,mask in masks.items():
        f=[r for r in saved['feedback'] if mask(r)];r=[r for r in saved['rankings'] if mask(r)]
        intervals[label]={}
        for base in ['shared','frozen_v12','ranking_v12_refit']:
            choice=(c.choice_bootstrap(f,{name:np.asarray([r['scores'][name] for r in f]) for name in [base,'personal_selected_connection']},base,'personal_selected_connection',count=3000)
                    if f and c.group_auc(f,[r['scores'][base] for r in f])[1] and c.top_choices(f,[r['scores'][base] for r in f])['recommended_options'] else None)
            intervals[label][base]=dict(connection=choice,ranking=bootstrap_rank(r,base,'personal_selected_ranking'))
    frows=saved['feedback'];rrows=saved['rankings']
    report=dict(selection=selection,models=strata['all'],strata=strata,paired_intervals=intervals,
       changes=dict(connection=changes(frows,'feedback','shared','personal_selected_connection'),ranking=changes(rrows,'rankings','shared','personal_selected_ranking')),
       events={str(e):summary({kind:[r for r in rows if r['event_id']==e] for kind,rows in saved.items()},primary) for e in [27,28]},
       cold_start_max_adjustment=max((abs(r['scores']['personal_selected_connection']-r['scores']['shared']) for rows in saved.values() for r in rows if r['history_partners']==0),default=0.),
       history_coverage={kind:dict(people=len({r['ranker_number'] for r in rows}),directions=len(rows),
           chooser_events=dict(collections.Counter(str(n) for n in { (r['event_id'],r['ranker_number']):r['raw_own_history_events'] for r in rows}.values())),
           max_observed_prior_attendances=max((r['recorded_prior_attendances'] for r in rows),default=0)) for kind,rows in saved.items()},
       limitations=['Old survey fields partly reconstructed/current fallback; historical pre-event profiles not guaranteed.',
         'Strict feedback updated_at is a conservative availability bound affected by migration; not actual submission time.',
         'Only assigned/met people have outcomes; no counterfactual partner success.',
         'Only two later events and reused research benchmarks; prospective validation required.',
         'Fixed-prediction bootstrap clusters chooser but not all shared-partner dependence or selection uncertainty.'])
    write(prefix+'-predictions.json',saved);write(prefix+'-summary.json',report)
    write(prefix+'-manifests.json',manifests)
    print(prefix,json.dumps({name:{'top_choice':m['connection']['top20_percent_within_person']['precision'],'within_auc':m['connection']['within_person_auc'],'rank_ndcg':m['ranking']['person_ndcg']} for name,m in report['models'].items()}),flush=True)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['primary','event_order','recent_base'],default='primary');args=ap.parse_args()
    profiles,feedback,allranks,manual,audit=inputs();cutoffs=read(OUT/'cutoffs.json')
    mode='event_order' if args.mode=='event_order' else 'strict'
    prefix=args.mode.replace('_','-')
    if args.mode=='recent_base':selection=read(OUT/'primary-selection.json')
    else:
        development=dict(feedback=[],rankings=[]);manifests=[]
        for event in [23,24,25,26]:
            result,manifest=evaluate_fold(event,mode,profiles,feedback,allranks,manual,cutoffs)
            for kind in development:development[kind].extend(result[kind])
            manifests.append(manifest);print('developed',mode,event,len(result['feedback']),flush=True)
        selection=select(development)
        write(prefix+'-development.json',development);write(prefix+'-development-manifests.json',manifests)
        write(prefix+'-selection.json',selection)
    write(prefix+'-protocol.json',dict(audit,configurations=p.CONFIGS,selection=selection['rule'],production_changed=False,
        mode=mode,global_recent_only=args.mode=='recent_base',personal_ranking_autosaved=False,
        global_recipe='75% wantConnect /25% ranking weighted Ridge; ranking-only alpha50 fallback if no eligible feedback',
        availability='strict < cutoff timestamp; only lower event IDs. Connection uses match-row updated_at upper bound; ranking submitted_at. Event-order sensitivity explicitly ignores uncertain availability.',
        personal_history_excludes_exact_target=True,selection_events=[23,24,25,26],test_events=[27,28],
        source_hashes={path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__),Path(__file__).with_name('models.py')]}))
    saved=dict(feedback=[],rankings=[]);manifests=[]
    for event in [27,28]:
        result,manifest=evaluate_fold(event,mode,profiles,feedback,allranks,manual,cutoffs,selection['selected'],args.mode=='recent_base')
        for kind in saved:saved[kind].extend(result[kind])
        manifests.append(manifest);print('tested',args.mode,event,selection['selected'],flush=True)
    finish(prefix,saved,selection,manifests)

if __name__=='__main__':main()
