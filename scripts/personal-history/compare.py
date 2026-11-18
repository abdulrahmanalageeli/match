"""Summarize the active, ranking-selected personal layer without changing models."""
import collections
import json
from pathlib import Path
import importlib.util
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ph_evaluator_compare',Path(__file__).with_name('evaluate.py'))
e=importlib.util.module_from_spec(spec);sys.modules[spec.name]=e;spec.loader.exec_module(e)
OUT=e.OUT

def run():
    results={}
    for prefix in ['primary','event-order','recent-base']:
        saved=e.read(OUT/(prefix+'-predictions.json'))
        report=e.read(OUT/(prefix+'-summary.json'))
        cohorts={
            'all':lambda r:True,
            'returning_new_partners':lambda r:r['history_partners']>=2 and not r['known_partner'],
            'first_recorded_visit':lambda r:r['recorded_prior_attendances']==0,
            'second_recorded_visit':lambda r:r['recorded_prior_attendances']==1,
            'third_fourth_recorded_visit':lambda r:2<=r['recorded_prior_attendances']<=3,
            'fifth_seventh_recorded_visit':lambda r:4<=r['recorded_prior_attendances']<=6,
            'eighth_plus_recorded_visit':lambda r:r['recorded_prior_attendances']>=7,
        }
        summaries={}
        for key,mask in cohorts.items():
            sub={kind:[r for r in rows if mask(r)] for kind,rows in saved.items()}
            f=sub['feedback']
            names=['shared','personal_selected_ranking','personal_selected_connection','frozen_v12','ranking_v12_refit']
            models=e.summary(sub,names)
            values={n:np.asarray([r['scores'][n] for r in f]) for n in ['shared','personal_selected_ranking']}
            ci=(e.c.choice_bootstrap(f,values,'shared','personal_selected_ranking',3000)
                if f and e.c.group_auc(f,values['shared'])[1] and e.c.top_choices(f,values['shared'])['recommended_options'] else None)
            summaries[key]=dict(models=models,active_personal_vs_shared=ci,
                chooser_counts={kind:dict(people=len({r['ranker_number'] for r in rows}),
                    chooser_events=len({(r['event_id'],r['ranker_number']) for r in rows})) for kind,rows in sub.items()},
                active_changes=dict(connection=e.changes(f,'feedback','shared','personal_selected_ranking'),
                    ranking=e.changes(sub['rankings'],'rankings','shared','personal_selected_ranking')))
        candidates=[x['name'] for x in e.p.CONFIGS]
        results[prefix]=dict(selection=report['selection']['selected'],cohorts=summaries,
            all_fixed_candidates_exploratory=e.summary(saved,candidates),
            interpretation='Active personal layer selected on earlier ranking outcomes; connection performance is a secondary outcome. Individual outer candidate results never select a winner.')
    e.write('active-personal-comparison.json',results)
    for prefix,result in results.items():
        group=result['cohorts']['all']
        print(prefix,'active paired interval',group['active_personal_vs_shared'],flush=True)

if __name__=='__main__':run()
