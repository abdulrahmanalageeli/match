"""Independent audit of saved personal-history forecasts; never fits a model.

Recomputes chooser-level performance from saved labels/scores, checks exact
cold-start fallback, and checks chronological/pair provenance where supplied.
Missing provenance is explicitly INCOMPLETE rather than silently passing.
"""
import argparse
import collections
import datetime as dt
import hashlib
import json
from pathlib import Path
import re

import numpy as np
from sklearn.metrics import ndcg_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = ROOT/'tmp/personal-history-2026-09-23'
TARGET_SCORES = ['personal_selected_connection', 'personal_selected_ranking', 'shuffled_personal']


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def timestamp(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()


def history_count(row):
    value = row.get('history_partners', row.get('history_partner_count'))
    if isinstance(value, (list, tuple, set)):
        return len(value)
    if isinstance(value, (int, float)):
        return int(value)
    return None


def by_chooser(rows):
    groups = collections.defaultdict(list)
    for i, row in enumerate(rows):
        groups[int(row['event_id']), int(row['ranker_number'])].append(i)
    return groups


def auc(y, scores):
    return float(roc_auc_score(y, scores)) if len(set(y)) == 2 else None


def recommendation_totals(rows, scores):
    # Exactly one final-phase observation per chooser/candidate is eligible.
    # Ties receive their expected yield, never an arbitrary ID/order tie-break.
    final = {}
    for i, row in enumerate(rows):
        key = (int(row['event_id']), int(row['ranker_number']), int(row['ranked_number']))
        if key not in final or int(row.get('phase', 0)) > int(rows[final[key]].get('phase', 0)):
            final[key] = i
    groups = collections.defaultdict(list)
    for i in final.values():
        groups[int(rows[i]['event_id']), int(rows[i]['ranker_number'])].append(i)
    selected, positive, options, all_positive, people = 0, 0., 0, 0, 0
    for ids in groups.values():
        if len(ids) < 2:
            continue
        values = np.asarray(scores)[ids]
        labels = np.asarray([rows[i]['wantConnect'] for i in ids], float)
        take = max(1, int(np.ceil(.2*len(ids))))
        cutoff = np.partition(values, -take)[-take]
        certain, tied = values > cutoff, values == cutoff
        positive += float(labels[certain].sum()+(take-certain.sum())*labels[tied].mean())
        selected += take
        options += len(ids)
        all_positive += int(labels.sum())
        people += 1
    return dict(positive_expected=positive, recommended_options=selected,
                eligible_options=options, eligible_positive=all_positive,
                chooser_events=people, precision=positive/selected if selected else None,
                option_coverage=selected/options if options else None,
                base_positive_rate=all_positive/options if options else None)


def metrics(rows, score_name, task):
    if not rows:
        return {'rows': 0, 'people': 0}
    scores = np.asarray([r['scores'][score_name] for r in rows], float)
    groups = by_chooser(rows)
    y = [bool(r['wantConnect']) if task=='feedback' else int(r['rank'])<=3 for r in rows]
    local_auc, ndcg, top1 = [], [], []
    person_auc, person_ndcg = collections.defaultdict(list), collections.defaultdict(list)
    for (_,person),ids in groups.items():
        value = auc([y[i] for i in ids], scores[ids])
        if value is not None:
            local_auc.append(value)
            person_auc[person].append(value)
        if task == 'rankings' and len(ids) >= 2:
            actual = [float(rows[i]['y']) for i in ids]
            ndcg.append(float(ndcg_score([actual], [scores[ids]], k=3)))
            person_ndcg[person].append(ndcg[-1])
        tied = np.asarray(ids)[scores[ids] == np.max(scores[ids])]
        top1.append(float(np.mean(np.asarray(y)[tied])))
    result = dict(rows=len(rows), people=len({int(r['ranker_number']) for r in rows}),
                  chooser_events=len(groups), positive=sum(y),
                  pooled_auc=auc(y, scores), within_person_auc=float(np.mean(local_auc)) if local_auc else None,
                  informative_person_events=len(local_auc), uninformative_person_events=len(groups)-len(local_auc),
                  chooser_mean_top1_positive=float(np.mean(top1)))
    if task == 'feedback':
        result['recommendations'] = recommendation_totals(rows, scores)
    else:
        result['ndcg3'] = float(np.mean(ndcg)) if ndcg else None
        result['ndcg_informative_ballots'] = len(ndcg)
        result['person_ndcg3'] = float(np.mean([np.mean(v) for v in person_ndcg.values()])) if person_ndcg else None
        result['person_auc'] = float(np.mean([np.mean(v) for v in person_auc.values()])) if person_auc else None
    return result


def impact(rows, personal, task, count=3000):
    people = sorted({int(r['ranker_number']) for r in rows})
    local = []
    signs = collections.Counter()
    for person in people:
        person_rows = [r for r in rows if int(r['ranker_number']) == person]
        a, b = metrics(person_rows, 'shared', task), metrics(person_rows, personal, task)
        n = a['informative_person_events']
        if n:
            change = b['within_person_auc']-a['within_person_auc']
            signs['improved' if change>1e-12 else 'declined' if change< -1e-12 else 'tied'] += 1
        else:
            change = 0.
        if task == 'feedback':
            aa, bb = a['recommendations'], b['recommendations']
            assert aa['recommended_options'] == bb['recommended_options']
            local.append([change*n, n, bb['positive_expected']-aa['positive_expected'], aa['recommended_options']])
        else:
            n_ballots = a['ndcg_informative_ballots']
            ndcg_change = (b['ndcg3']-a['ndcg3']) if n_ballots else 0.
            local.append([change*n, n, ndcg_change*n_ballots, n_ballots])
    if not local:
        return {'people': 0}
    local = np.asarray(local)
    rng = np.random.default_rng(260923)
    totals = local[rng.integers(0, len(local), (count, len(local)))].sum(axis=1)
    result = dict(people=len(people), chooser_auc_impact=dict(signs),
                  uncertainty='Paired stable-chooser bootstrap; event/partner dependence and selection uncertainty not fully captured.')
    for name, num, den in [('within_person_auc',0,1),
                           ('shortlist_precision' if task=='feedback' else 'ndcg3',2,3)]:
        valid = totals[:,den] > 0
        result[name] = dict(delta=float(local[:,num].sum()/local[:,den].sum()) if local[:,den].sum() else None,
                           bootstrap95=np.quantile(totals[valid,num]/totals[valid,den],[.025,.975]).tolist() if valid.any() else None,
                           valid_resamples=int(valid.sum()))
    return result


def find_field(value, keys):
    if isinstance(value, dict):
        for key in keys:
            if key in value:
                return value[key]
        for sub in value.values():
            found = find_field(sub, keys)
            if found is not None:
                return found
    return None


def audit_manifest(manifest, predictions):
    failures, incomplete = [], []
    event = find_field(manifest, ['event_id', 'forecast_event', 'event'])
    cutoff_raw = find_field(manifest, ['cutoff_utc', 'forecast_cutoff', 'cutoff', 'seating_created_at'])
    mode = find_field(manifest, ['availability_mode', 'timing_mode', 'mode', 'availability'])
    if event is None:
        return dict(failures=[], incomplete=['Manifest has no forecast event identifier.'])
    event = int(event)
    if isinstance(cutoff_raw,dict):
        cutoff_raw=find_field(cutoff_raw,['cutoff_utc','cutoff'])
    cutoff = timestamp(cutoff_raw) if cutoff_raw is not None else None
    if cutoff is None:
        incomplete.append('Manifest has no machine-readable forecast cutoff.')
    strict = mode is not None and 'strict' in str(mode).lower()
    history = []
    for task, aliases, time_field in [
        ('feedback', ['training_feedback','train_feedback','eligible_feedback_rows','history_feedback_keys'], 'match_row_updated_at'),
        ('rankings', ['training_rankings','train_rankings','eligible_ranking_rows','history_ranking_keys'], 'submitted_at'),
    ]:
        rows = find_field(manifest, aliases)
        if not isinstance(rows, list):
            incomplete.append(f'Manifest does not expose auditable {task} history rows.')
            continue
        for row in rows:
            if isinstance(row,list) and len(row)==(5 if task=='feedback' else 4):
                row=dict(zip(['event_id','ranker_number','ranked_number']+(['phase'] if task=='feedback' else [])+[time_field],row))
            if not isinstance(row, dict):
                incomplete.append(f'{task} history keys need explicit schema to verify.')
                break
            history.append(row)
            if int(row['event_id']) >= event:
                failures.append(f'{task}: event{row["event_id"]} is not before forecast event{event}.')
            actual = row.get(time_field)
            if strict and cutoff is not None:
                if actual is None:
                    incomplete.append(f'{task} history has no {time_field}; cannot independently prove cutoff.')
                elif timestamp(actual) >= cutoff:
                    failures.append(f'{task}: history timestamp is on/after forecast cutoff.')
    if history:
        pairs = {frozenset([int(r['ranker_number']), int(r['ranked_number'])]) for r in history}
        for row in predictions:
            if int(row['event_id']) != event:
                continue
            expected = frozenset([int(row['ranker_number']), int(row['ranked_number'])]) in pairs
            if 'known_partner' not in row:
                incomplete.append('Predictions omit known_partner classification.')
            elif bool(row['known_partner']) != expected:
                failures.append(f'Incorrect known_partner flag for {row["ranker_number"]}->{row["ranked_number"]}.')
            own=[r for r in history if int(r['ranker_number'])==int(row['ranker_number'])
                 and int(r['ranked_number'])!=int(row['ranked_number'])]
            expected_partners=len({int(r['ranked_number']) for r in own})
            expected_events=len({int(r['event_id']) for r in own})
            if history_count(row) is not None and history_count(row)!=expected_partners:
                failures.append(f'Incorrect usable history_partners for {row["ranker_number"]}->{row["ranked_number"]}.')
            if isinstance(row.get('history_events'),int) and row['history_events']!=expected_events:
                failures.append(f'Incorrect usable history_events for {row["ranker_number"]}->{row["ranked_number"]}.')
    maximum_event=manifest.get('max_history_event')
    if maximum_event is not None and maximum_event>=event:
        failures.append('Declared maximum history event is not earlier than forecast.')
    for field in ['max_feedback_updated_at','max_ranking_submitted_at']:
        if strict and cutoff is not None and manifest.get(field) and timestamp(manifest[field])>=cutoff:
            failures.append(field+' violates strict forecast cutoff.')
    return dict(event_id=event, cutoff_utc=cutoff_raw, availability_mode=mode,
                history_rows=len(history), failures=sorted(set(failures)), incomplete=sorted(set(incomplete)))


def run(directory=DEFAULT, prefix='primary'):
    data = read(directory/f'{prefix}-predictions.json')
    protocol_path=directory/f'{prefix}-protocol.json'
    protocol = read(protocol_path if protocol_path.exists() else directory/'protocol.json')
    result = dict(protocol='Independent recomputation from saved labels and scores; no model selection/fitting.',
                  source=f'{prefix}-predictions.json', checks=[], failures=[], incomplete=[], tasks={},
                  scope='Audits outcome/history timing. Historical survey-answer reconstruction remains a separate acknowledged limitation.')
    dev = find_field(protocol, ['development_events','selection_events','tuning_events'])
    if isinstance(dev, list) and all(isinstance(e,int) for e in dev):
        if any(e >= 27 for e in dev):
            result['failures'].append('Hyperparameter development includes evaluation event27/28.')
        result['checks'].append({'development_events':dev})
    else:
        result['incomplete'].append('Cannot independently identify hyperparameter-development event IDs in protocol.')
    for name,digest in protocol.get('input_sha256',{}).items():
        path=ROOT/name
        if not path.exists():
            result['incomplete'].append('Input file unavailable for hash verification: '+name)
        elif hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
            result['failures'].append('Input hash changed: '+name)
    all_rows=[]
    for task in ['feedback','rankings']:
        rows = data.get(task, [])
        all_rows.extend(rows)
        if not rows:
            result['tasks'][task]={'rows':0}
            continue
        names = sorted(set.intersection(*(set(r['scores']) for r in rows)))
        required = ['shared', *TARGET_SCORES]
        missing = [name for name in required if name not in names]
        if missing:
            result['incomplete'].append(f'{task} missing score keys: {missing}')
        identities = [tuple(r.get(k) for k in ['event_id','ranker_number','ranked_number','phase']) for r in rows]
        if len(set(identities)) != len(identities):
            result['failures'].append(f'{task} has duplicate forecast identities.')
        if not all(np.isfinite([r['scores'][n] for n in names]).all() for r in rows):
            result['failures'].append(f'{task} has nonfinite predictions.')
        cold = [r for r in rows if history_count(r)==0]
        if any(history_count(r) is None for r in rows):
            result['incomplete'].append(f'{task} missing history_partners counts.')
        if 'shared' in names:
            for name in TARGET_SCORES:
                if name not in names:
                    continue
                delta = max((abs(float(r['scores'][name])-float(r['scores']['shared'])) for r in cold),default=0.)
                result['checks'].append(dict(task=task,score=name,cold_start_rows=len(cold),maximum_fallback_difference=delta))
                if delta > 1e-10:
                    result['failures'].append(f'{task}: {name} changes the shared model for cold-start people.')
        selected_names=[n for n in ['shared','frozen_v12','ranking_v12_refit',*TARGET_SCORES] if n in names]
        strata = {'all':rows,'returning':[r for r in rows if (history_count(r) or 0)>0],
                  'cold_start':cold,'returning_new_partner':[r for r in rows if (history_count(r) or 0)>0 and r.get('known_partner') is False],
                  'returning_new_partners_ge2':[r for r in rows if (history_count(r) or 0)>=2 and r.get('known_partner') is False],
                  'both_prior_connection_labels':[r for r in rows if r.get('history_has_both_connection_labels') is True],
                  'known_partner':[r for r in rows if r.get('known_partner') is True]}
        for label,low,high in [('history1-3',1,3),('history4-9',4,9),('history10plus',10,100000)]:
            strata[label]=[r for r in rows if history_count(r) is not None and low<=history_count(r)<=high]
        for event in sorted({int(r['event_id']) for r in rows}):
            strata[f'event{event}']=[r for r in rows if int(r['event_id'])==event]
        result['tasks'][task]={'scores':selected_names,
            'strata':{label:{n:metrics(subset,n,task) for n in selected_names} for label,subset in strata.items()},
            'returning_impact_vs_same_shared':{n:impact(strata['returning'],n,task) for n in TARGET_SCORES if n in names},
            'all_impact_vs_same_shared':{n:impact(rows,n,task) for n in TARGET_SCORES if n in names},
            'returning_new_partners_ge2_impact_vs_same_shared':{n:impact(strata['returning_new_partners_ge2'],n,task) for n in TARGET_SCORES if n in names},
            'personal_adjustments':{n:dict(maximum_absolute=float(max(abs(r['scores'][n]-r['scores']['shared']) for r in rows)),
                                          nonzero_rows=sum(abs(r['scores'][n]-r['scores']['shared'])>1e-10 for r in rows))
                                    for n in TARGET_SCORES if n in names}}
    manifests=[]
    manifest_paths=list(sorted(directory.glob('event-*-manifest.json')))
    manifest_paths += [p for p in [directory/f'{prefix}-manifests.json',directory/f'{prefix}-development-manifests.json'] if p.exists()]
    for path in manifest_paths:
        entries=read(path)
        entries=entries if isinstance(entries,list) else [entries]
        check_rows=all_rows
        if 'development' in path.name:
            development=read(directory/f'{prefix}-development.json')
            check_rows=development.get('feedback',[])+development.get('rankings',[])
        for entry in entries:
            m=audit_manifest(entry,check_rows)
            manifests.append(dict(file=path.name,**m))
            result['failures'].extend(m['failures'])
            result['incomplete'].extend(m['incomplete'])
    if not manifests:
        result['incomplete'].append('No event cutoff manifests available.')
    result['manifests']=manifests
    result['strict_label_chronology_verified']=bool(manifests) and all('strict' in str(m.get('availability_mode','')).lower() for m in manifests)
    development_path=directory/f'{prefix}-development.json'
    selection_path=directory/f'{prefix}-selection.json'
    if development_path.exists() and selection_path.exists():
        development=read(development_path)
        selection=read(selection_path)
        candidates=['shared']+[v['name'] for v in protocol.get('configurations',[])]
        independently_selected={}
        cutoff27=timestamp(read(directory/'cutoffs.json')['27']['cutoff_utc'])
        for task,outcome in [('feedback','connection'),('rankings','ranking')]:
            rows=development.get(task,[])
            if any(int(r['event_id'])>=27 for r in rows):
                result['failures'].append('Development forecast rows include event27/28.')
            if protocol.get('mode')=='strict':
                field='match_row_updated_at' if task=='feedback' else 'submitted_at'
                if any(not r.get(field) or timestamp(r[field])>=cutoff27 for r in rows):
                    result['failures'].append(f'{task} development outcome was unavailable at final selection cutoff.')
            eligible=[r for r in rows if (history_count(r) or 0)>=2 and not r['known_partner']]
            values={}
            for name in candidates:
                m=metrics(eligible,name,task)
                value=m.get('within_person_auc' if task=='feedback' else 'person_ndcg3')
                values[name]=value if value is not None else -.5
            chosen=min(candidates,key=lambda name:(-values[name],name!='shared',name))
            independently_selected[outcome]=chosen
            if chosen!=selection['selected'][outcome]:
                result['failures'].append('Independent development selection disagrees for '+outcome)
            for row in data.get(task,[]):
                if abs(row['scores']['personal_selected_'+outcome]-row['scores'][chosen])>1e-10:
                    result['failures'].append('Final selected score does not use locked development selection for '+outcome)
        result['checks'].append({'independently_selected_configurations':independently_selected})
        dev_manifests=read(directory/f'{prefix}-development-manifests.json')
        result['checks'].append({'development_personal_feedback_rows':{
            str(m['event']):m.get('personal_feedback') for m in dev_manifests},
            'all_development_personal_feedback_absent':all(m.get('personal_feedback')==0 for m in dev_manifests)})
    summary_path=directory/f'{prefix}-summary.json'
    if summary_path.exists():
        summary=read(summary_path)
        compared=0
        def check_number(label,actual,reported):
            nonlocal compared
            compared+=1
            if actual is None or reported is None:
                if actual is not reported:
                    result['failures'].append('Reported metric availability differs: '+label)
            elif abs(float(actual)-float(reported))>1e-9:
                result['failures'].append(f'Reported metric differs: {label}: audit={actual}, report={reported}')
        for task in ['feedback','rankings']:
            if not data.get(task):
                continue
            for audit_stratum,report_stratum in [('all','all'),('cold_start','no_usable_history'),
                ('returning_new_partners_ge2','returning_new_partners'),('both_prior_connection_labels','history_both_yes_no')]:
                for name,m in result['tasks'][task]['strata'][audit_stratum].items():
                    reported=summary['strata'][report_stratum][name]['connection' if task=='feedback' else 'ranking']
                    if m['rows']==0 or reported is None:
                        continue
                    for a,b in ([('pooled_auc','want_connect_auc'),('within_person_auc','within_person_auc')]
                                if task=='feedback' else [('person_ndcg3','person_ndcg'),('person_auc','person_auc')]):
                        check_number(f'{task}/{report_stratum}/{name}/{a}',m[a],reported[b])
                    if task=='feedback':
                        check_number(f'{task}/{report_stratum}/{name}/precision',
                            m['recommendations']['precision'],reported['top20_percent_within_person']['precision'])
        # Independent connection bootstrap uses the same published fixed seed
        # and iteration count, so endpoint agreement can be tested directly.
        for label,audit_key in [('all','all_impact_vs_same_shared'),
                                 ('returning_new_partners','returning_new_partners_ge2_impact_vs_same_shared')]:
            if not data.get('feedback'):
                continue
            reported=summary.get('paired_intervals',{}).get(label,{}).get('shared',{}).get('connection')
            actual=result['tasks']['feedback'][audit_key].get('personal_selected_connection')
            if not reported or not actual:
                continue
            for metric in ['within_person_auc','shortlist_precision']:
                check_number(label+'/'+metric+'/delta',actual[metric]['delta'],reported[metric]['mean_delta'])
                for i,side in enumerate(['lower','upper']):
                    check_number(label+'/'+metric+'/'+side,actual[metric]['bootstrap95'][i],reported[metric]['bootstrap95'][i])
        result['checks'].append({'independently_recomputed_report_values':compared})
    else:
        result['incomplete'].append('Saved summary not available for independent numeric comparison.')
    result['failures']=sorted(set(result['failures']))
    result['incomplete']=sorted(set(result['incomplete']))
    result['passed']=not result['failures']
    result['provenance_complete']=not result['incomplete']
    (directory/f'audit-{prefix}.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf8')
    print(json.dumps({'passed':result['passed'],'provenance_complete':result['provenance_complete'],
                      'failures':result['failures'],'incomplete':result['incomplete']},indent=2))
    return result


def selftest():
    rows=[dict(event_id=27,ranker_number=1,ranked_number=n,phase=1,wantConnect=y,
               history_partners=0,scores={'shared':.5,'personal_selected_connection':.5})
          for n,y in [(2,True),(3,False),(4,True)]]
    m=metrics(rows,'shared','feedback')
    assert m['within_person_auc']==.5
    assert abs(m['recommendations']['precision']-2/3)<1e-12
    assert m['recommendations']['recommended_options']==1
    manifest={'event_id':27,'cutoff_utc':'2026-09-01T00:00:00Z','availability_mode':'strict',
              'training_feedback':[dict(event_id=26,ranker_number=2,ranked_number=1,match_row_updated_at='2026-08-30T00:00:00Z')],
              'training_rankings':[]}
    tagged=[dict(r,known_partner=r['ranked_number']==2) for r in rows]
    assert not audit_manifest(manifest,tagged)['failures']
    tagged[0]['known_partner']=False
    assert audit_manifest(manifest,tagged)['failures']
    manifest['training_feedback'][0]['match_row_updated_at']='2026-09-02T00:00:00Z'
    assert any('cutoff' in x for x in audit_manifest(manifest,tagged)['failures'])
    print('Independent metrics, tie handling, reverse-pair history, and cutoff checks passed.')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--directory',type=Path,default=DEFAULT)
    parser.add_argument('--prefix',default='primary')
    parser.add_argument('--selftest',action='store_true')
    args=parser.parse_args()
    if args.selftest:
        selftest()
    else:
        report=run(args.directory,args.prefix)
        if not report['passed']:
            raise SystemExit(1)
