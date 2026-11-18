"""Descriptive stability/coverage checks; never used for model selection."""
import collections
import importlib.util
import itertools
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tmp/survey-search-2026-09-23'
spec=importlib.util.spec_from_file_location('feedback_helper',ROOT/'scripts/evaluate-mbti16-feedback.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
e=f.e


def audit(data,events):
    rows=e.t.ranking_rows(data,events,False)
    ballots=collections.defaultdict(dict)
    for r in rows:
        ballots[r['ranker_number']][r['event_id']]=ballots[r['ranker_number']].get(r['event_id'],{})|{r['ranked_number']:r['rank']}
    agreed=total=0; people=set(); repeated_ballots=0
    for person,by_event in ballots.items():
        for left,right in itertools.combinations(sorted(by_event),2):
            common=sorted(set(by_event[left])&set(by_event[right]))
            if len(common)<2:continue
            repeated_ballots+=1;people.add(person)
            for a,b in itertools.combinations(common,2):
                agreed+=int((by_event[left][a]<by_event[left][b])==(by_event[right][a]<by_event[right][b]))
                total+=1
    return {'manual_directions':len(rows),'people':len(ballots),'comparable_repeated_people':len(people),'comparable_event_ballot_pairs':repeated_ballots,'repeated_pair_orderings':total,'same_order_again':agreed,'repeat_agreement':agreed/total if total else None,'interpretation':'Descriptive context-dependent consistency, not a formal model accuracy ceiling; comparison pairs share people.'}


recent=e.read(e.DATA)
old=e.read(ROOT/'.tmp-survey-search-older-personalization.json')
all_data={**recent,'profiles':old['profiles']+recent['profiles'],'rankings':old['rankings']+recent['rankings']}
report={'recent':audit(recent,[26,27,28]),'expanded':audit(all_data,[20,21,22,23,24,25,26,27,28])}
for name,data in [('recent',recent),('older',old)]:
    report[name+'_answer_coverage']={q:sum(e.t.answer(p,q)!='MISSING' for p in data['profiles'])/len(data['profiles']) for q in e.t.QUESTIONS}
(OUT/'signal-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:report[k] for k in ['recent','expanded']},indent=2))
