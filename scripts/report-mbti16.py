"""Build the readable MBTI16 research report from saved numeric results."""
import csv
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/mbti16-2026-09-23'
def read(name):
    return json.loads((OUT/name).read_text(encoding='utf8'))
def f(value):
    return '—' if value is None else f'{value:.4f}'
def table(headers,rows):
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |',*['| '+' | '.join(str(x) for x in row)+' |' for row in rows]])

d=read('report.json')
b=read('feedback-report.json')
raw=read('raw-temporal-report.json')
names={'v12_recipe_k2':'Two learned archetypes, same earlier data','mbti16_experts':'16 MBTI groups + full questionnaire','mbti16_types_only':'MBTI types only','frozen_v12':'Frozen original V12'}
lines=['# 16 MBTI archetypes versus V12 — 23 September 2026','',
'**Decision: keep the existing approach. This test does not establish an improvement from replacing the learned archetypes with 16 fixed MBTI types.** The full-questionnaire MBTI variant is mixed and slightly worse overall on ranking; the type-only variant loses substantially more ranking information. Small differences are uncertain. User 7 remains better served by original V12 overall. No production code, model configuration, scores, or database records were changed.','',
'## What was tested','',
'Fresh database reads confirm Event 28 (16 September) is the latest ranked event. Event 26 occurred on 30 August, Event 27 on 6 September. The live persisted model marker is `2026-09-03-v12-event26-archetype-ai-chemistry-100`; the local working-tree configuration is V13. The frozen V12 artifact has the same live version identifier, but the database does not provide an artifact checksum.','',
'The primary test fits Event 26 and predicts Event 27, then fits Events 26–27 and predicts Event 28. It compares identical training and test data across architectures. This isolates the 16-type change from the benefit of learning from more recent events. Frozen V12 is also shown as the original operational-version reference.','',
'Three research models use the same fixed Ridge strength (10), questionnaire pair features where applicable, and seed (2609): the recovered V12 recipe with two learned taste archetypes; fixed 16 MBTI chooser groups with shared full-questionnaire features; and a simpler directed MBTI-type-pair preference model. The MBTI groups are assigned before learning historical preferences. Parameters were not selected using these results or User 7 labels. This tests these concrete implementations, not every possible MBTI model.','',
'## Data and MBTI coverage','',
'There are **106 unique people, 132 event attendances, 1,966 ranking entries, and 256 usable directed one-to-one responses**. Twelve explicit non-meetings were excluded. The temporal test contains 1,474 ranking entries from 90 ballots/80 people and 192 one-to-one responses; Event 26 supplies initial training.','',
table(['Event','People','Valid MBTI answers','Ranking entries','Usable one-to-one responses'],[[e,d['coverage'][str(e)]['profiles'],d['coverage'][str(e)]['known'],d['coverage'][str(e)]['directions'],b['coverage']['events'][str(e)]['directions']] for e in [26,27,28]]),'',
'Only **53/106 unique people** have valid MBTI answers, covering 14 of the 16 types. ISFJ and ENTJ have no event-training participants; observed types have only 1–9 unique people each. The survey removed its MBTI block in August. These types are derived from four binary answers, not a full MBTI assessment or continuous dimension scores.','',
'The mapping is A/B → E/I, S/N, T/F, J/P. All four answers must be valid. Every known event type in this export came from complete answers; no current stored-type fallback was required. Missing types remain unknown: the questionnaire model uses shared features, while the type-only model can use global target-type popularity. Unknown choosers have a separate historical percentile reference, with global fallback if absent. No missing participant was invented into one of the 16 types.','',
'## Rankings: later events predicted from earlier events','',
'Higher is better. Pairwise accuracy means correctly ordering two people within a participant’s ballot. NDCG@3 measures top-three ordering quality; it is not the percentage of successful matches. AUC 0.5 means chance ordering.','',
table(['Model','Pairwise accuracy','Top-three NDCG','Top-three AUC','Spearman'],[[names[n],f(m['pairwise']),f(m['ndcg3']),f(m['top3_auc']),f(m['spearman'])] for n,m in d['temporal']['pooled']['metrics'].items()]),'',
'The fair same-data two-archetype baseline reaches 0.5889 NDCG versus 0.5781 for the MBTI questionnaire model. Comparing MBTI only with frozen V12 (0.5492) would misleadingly attribute learning from Event 27 to having 16 archetypes.','',
table(['Sensitivity / cohort','Two archetypes NDCG','16 + questionnaire NDCG','Types only NDCG'],[
['Event 27',*[f(d['temporal']['events']['27']['metrics'][n]['ndcg3']) for n in names if n!='frozen_v12']],
['Event 28',*[f(d['temporal']['events']['28']['metrics'][n]['ndcg3']) for n in names if n!='frozen_v12']],
['Only choosers with MBTI',*[f(d['temporal']['known_choosers']['metrics'][n]['ndcg3']) for n in names if n!='frozen_v12']],
['Explicitly submitted rankings only',*[f(d['manual_temporal']['pooled']['metrics'][n]['ndcg3']) for n in names if n!='frozen_v12']],
['Strict unseen-person validation',*[f(d['strict_cv']['overall']['metrics'][n]['ndcg3']) for n in names if n!='frozen_v12']],
['Strict unseen-person, manual only',*[f(d['manual_strict']['overall']['metrics'][n]['ndcg3']) for n in names if n!='frozen_v12']],
]),'',
'The MBTI questionnaire model’s participant-averaged temporal NDCG change is −0.0143, with a paired 95% bootstrap interval of **−0.0445 to +0.0160**. It improves 37 people, worsens 37 and ties 6. The interval includes no difference. Among people with MBTI, the mean change is −0.0401 (interval −0.0870 to +0.0055), so missing types do not explain away the observed weakness.','',
'Strict six-fold validation removes held-out participants as both chooser and target across all events. The type-only model’s participant-average NDCG drop is −0.0458 (interval −0.0819 to −0.0096). Repeating without auto-saved rankings also favors the two-archetype recipe. All bootstrap intervals hold predictions fixed; they do not refit training or correct repeated experimentation.','',
'An additional raw-score diagnostic checks whether small MBTI calibration buckets introduce ranking ties. Raw temporal NDCG is 0.5875 / 0.5761 / 0.5649 for two archetypes / 16 + questionnaire / types only: the conclusion does not reverse. Type-only scores tie 30.8% of candidate comparisons even before calibration. All 4,422 calibrated temporal scores replay exactly. Complete metrics and tie counts are in `tmp/mbti16-2026-09-23/raw-temporal-report.json`.','',
'## Actual one-to-one feedback','',
'Models first learn earlier event rankings, then predict later directed feedback. The primary behavioral label is whether the participant wanted to connect again; compatibility ratings are a separate outcome. Several older feedback fields were constant placeholders and were not treated as useful labels.','',
table(['Model','Want-connect AUC','Compatibility-rating Spearman'],[[names.get(n,'Frozen original V12' if n=='frozen_v12_directional' else n),f(m['want_connect_auc']),f(m['compatibility_spearman'])] for n,m in b['ranking_only']['pooled']['models'].items()]),'',
'The MBTI questionnaire model gains 0.0245 AUC over the equally retrained baseline, with a paired reviewer-bootstrap 95% interval of **−0.0243 to +0.0749**. This does not establish an advantage; compatibility-rating correlations are also weak. Full operational assigned scores are absent for these Event 27/28 feedback rows, so this is a controlled directional model comparison, not a replay of every historical mutual-plus-AI score.','',
'A separate fixed exploratory sensitivity learns equally from earlier ranking percentiles and earlier one-to-one compatibility ratings. The total fitting weight stays constant, the learned two-way gate still uses rankings, and `wantConnect` remains evaluation-only. This comparison does not tune source weights on future feedback.','',
table(['Model trained on past rankings + ratings','Want-connect AUC','Compatibility-rating Spearman'],[[names.get(n,n),f(m['want_connect_auc']),f(m['compatibility_spearman'])] for n,m in b['joint_50_50']['pooled']['models'].items()]),'',
'Adding earlier ratings gives mixed event results: the MBTI questionnaire model rises from 0.5761 to 0.6081 AUC on Event 28, but falls from 0.4994 to 0.4510 on Event 27; pooled AUC falls to 0.5068. This fixed experiment does not demonstrate that all ways of learning from one-to-one feedback are harmful.','',
'The feedback report includes per-event results, known-MBTI and explicit-met-only slices, and paired bootstrap intervals. Older responses without meeting-status metadata are retained as legacy rated meetings: 170 such responses and 86 explicitly confirmed meetings comprise the 256 usable outcomes. Event 28 has 81 confirmed meetings and no legacy assumed meetings. Exact feedback submission timestamps are unavailable, so these are retrospective event-order tests; a later edit to an earlier event response cannot be ruled out.','',
'These outcomes exist only for actual assigned partners. The experiment cannot establish how unobserved alternative matches would have gone. The historical system selected those partners, and compatibility ratings may reflect the displayed match score. Scores here are ordering signals, not calibrated probabilities of attraction or successful relationships.','',
'## User 7 and the previously listed people','',
'The benchmark is unchanged: **7 romantic, 13 friendly and 10 disliked people**, excluding IDs 70 and 1778. User 7 derives as **ESTJ**. Twenty-six of the 30 benchmark people also have complete MBTI answers. The categories provide no exact within-category ranking. They were used only for evaluation.','',
'The directional score best matches the question “does User 7 like this person?” The acquaintance labels do not establish the other person’s interest. Higher AUC means better ordering of the stated categories.','',
table(['Directional AUC','Frozen V12','Retrained two','16 + questionnaire','Types only'],[[task.replace('_',' '),*[f(d['user7']['metrics'][n][task]['directional']) for n in ['frozen_v12','full_v12_recipe_k2','full_mbti16_experts','full_mbti16_types_only']]] for task in ['liked_vs_disliked','romantic_vs_disliked','friendly_vs_disliked','romantic_vs_friendly']]),'',
'The 16-group model improves romantic separation relative to the expanded two-group model but weakens friend separation; overall liked-vs-disliked AUC remains below frozen V12. Only two distinct event participants are ESTJ, including User 7, so this group has very little independent evidence.','',
table(['User 7 sensitivity','Retrained two','16 + questionnaire','Types only'],[
['Directional liked AUC, User 7 excluded',*[f(d['user7']['metrics'][n]['liked_vs_disliked']['directional']) for n in ['user7_purged_v12_recipe_k2','user7_purged_mbti16_experts','user7_purged_mbti16_types_only']]],
['Final liked AUC, full fit + fixed historical AI',*[f(d['user7']['metrics'][n]['liked_vs_disliked']['final_fixed_historical_ai']) for n in ['full_v12_recipe_k2','full_mbti16_experts','full_mbti16_types_only']]],
]),'',
'The exclusion fit removes all 92 ranking directions involving User 7. His manual acquaintance categories never enter training. The original V12 final-score liked AUC is 0.7200, versus 0.6250 for the full MBTI questionnaire candidate. Final-score comparisons reuse identical **historical September 17 AI adjustments**; they are a controlled diagnostic, not freshly hash-verified September 23 operational scores. No new AI calls were made. This repeatedly inspected, selected 30-person benchmark is development evidence, not an untouched population test.','',
'### All 30 people: directional score comparison','',
'Scores are within-model ranking percentiles on a 0–100 scale. They are not success percentages. Full fits include User 7’s prior event ranking history.','',
table(['ID','Known category','MBTI','Frozen V12','Retrained two','16 + questionnaire','Types only'],[[r['participant_number'],r['label'],r['mbti'] or 'unknown',*[f(r['scores'][n]['directional']) for n in ['frozen_v12','full_v12_recipe_k2','full_mbti16_experts','full_mbti16_types_only']]] for r in d['user7']['rows']]),'',
'The type-only approach cannot distinguish people with the same type: for example, romantic IDs 1524 and 1623 and disliked ID 1527 are all ESTP and receive identical type-only directional scores. The questionnaire model retains information that separates them.','',
'## Recommendation and reproducibility','',
'Do not replace the current matcher with hard 16-type matching based on this evidence. Keep detailed questionnaire signals and learn from actual past feedback. MBTI can remain an optional research feature, but the present sparse coverage and inconsistent held-out results do not justify making it the main grouping rule. Collect complete personality inputs before making claims about a fully typed population, and reserve a future event for a genuinely new evaluation before promotion.','',
'Research scripts: `scripts/evaluate-mbti16.py`, `scripts/evaluate-mbti16-feedback.py`, `scripts/diagnose-mbti16-raw.py`, `scripts/verify-mbti16.py`, `scripts/report-mbti16.py`. Use the pinned versions in `scripts/personalized-compatibility-requirements.txt`. Approved SQL export queries are saved at the project root as `.tmp-mbti16-20260923-export.sql` and the corresponding User 7 export.','',
'Artifacts are in `tmp/mbti16-2026-09-23/`: dataset hashes and protocol, data audit, event/fold results, per-row held-out predictions, User 7 comparisons, feedback confidence intervals, and raw-score checks. Nine independent synthetic checks cover MBTI parsing, missing types, metrics, temporal separation, participant purging and User 7 label isolation; 14 saved-feedback metric checks also pass (maximum AUC difference 1.1e-16). Temporary raw survey exports were excluded from Git and removed after verification; pseudonymous score comparisons and prediction evidence remain local.','']

path=ROOT/'docs/MBTI16_V12_COMPARISON_2026-09-23.md'
path.write_text('\n'.join(lines),encoding='utf8')
with (OUT/'user7-score-comparison.csv').open('w',newline='',encoding='utf8') as stream:
    rows=[]
    for r in d['user7']['rows']:
        row={k:r[k] for k in ['participant_number','label','mbti']}
        for model,values in r['scores'].items():
            row.update({model+'_'+metric:value for metric,value in values.items()})
        rows.append(row)
    writer=csv.DictWriter(stream,fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print(path)
