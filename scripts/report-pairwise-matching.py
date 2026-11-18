"""Summarize the completed, fixed-protocol experiment without refitting models."""
import collections
import json
import math
import pathlib
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/pairwise-2026-09-18'
read=lambda name:json.loads((OUT/name).read_text(encoding='utf8'))


def weighted_auc(y,scores,weights):
    order=np.argsort(scores,kind='stable');s=np.asarray(scores)[order];y=np.asarray(y)[order];w=np.asarray(weights)[order]
    starts=np.r_[0,np.flatnonzero(np.diff(s))+1]
    pos=np.add.reduceat(w*y,starts);neg=np.add.reduceat(w*(1-y),starts)
    total=pos.sum()*neg.sum()
    return float(np.sum(pos*(np.cumsum(neg)-neg+.5*neg))/total) if total else None


def mutual_bootstrap(predictions,name,learned=True):
    lookup={(r['event_id'],r['ranker_number'],r['ranked_number']):r for r in predictions}
    pairs=[]
    for r in predictions:
        if r['ranker_number']>r['ranked_number']:continue
        back=lookup.get((r['event_id'],r['ranked_number'],r['ranker_number']))
        if not back:continue
        p=r['predictions'];base=p['expandedK2'];cand=p[name]
        y=int(r['rank']<=3 and back['rank']<=3)
        extreme=bool(y or (r['rank']>r['candidate_count']/2 and back['rank']>back['candidate_count']/2))
        pairs.append((r['ranker_number'],r['ranked_number'],y,extreme,
                      math.sqrt(base['legacy']*base['legacyBackward']),
                      cand['mutualLearned'] if learned else math.sqrt(cand['forward']*cand['backward'])))
    people=sorted({n for p in pairs for n in p[:2]});index={n:i for i,n in enumerate(people)}
    rng=np.random.default_rng(2609)
    counts=rng.multinomial(len(people),np.full(len(people),1/len(people)),size=2000)
    result={}
    for scope,subset in [('allPairs',pairs),('extremePairs',[p for p in pairs if p[3]])]:
        a,b,y,_,base,candidate=map(np.asarray,zip(*subset))
        ia,ib=np.asarray([index[n] for n in a]),np.asarray([index[n] for n in b])
        deltas=[]
        for multiplicity in counts:
            w=multiplicity[ia]*multiplicity[ib]
            left,right=weighted_auc(y,base,w),weighted_auc(y,candidate,w)
            if left is not None and right is not None:deltas.append(right-left)
        result[scope]={'baseline':weighted_auc(y,base,np.ones(len(y))),'candidate':weighted_auc(y,candidate,np.ones(len(y))),
                       'delta95Ci':np.quantile(deltas,[.025,.975]).tolist(),'bootstrapReplicates':len(deltas)}
    return result


def auc(pos,neg):
    return sum(1 if a>b else .5 if a==b else 0 for a in pos for b in neg)/(len(pos)*len(neg))


def main():
    primary,manual,temporal,user=[read(n+'-report.json') for n in ['primary','manual','temporal','user7']]
    predictions=read('primary-predictions.json')
    mutual={name:mutual_bootstrap(predictions,name) for name in ['linear','factor','semantic','personalized','selected','blend']}
    (OUT/'mutual-bootstrap.json').write_text(json.dumps(mutual,indent=2)+'\n',encoding='utf8')
    old=json.loads((ROOT/'tmp/training-2026-09-17/user7-runtime-ai-report.json').read_text(encoding='utf8'))
    baselines={}
    for model in ['frozenV12','candidateFull','v12User7Purged','candidateUser7Purged']:
        baselines[model]={}
        for kind in ['directional','base','final']:
            pos=[r['scores'][model][kind] for r in old['rows'] if r['label']!='disliked']
            neg=[r['scores'][model][kind] for r in old['rows'] if r['label']=='disliked']
            baselines[model][kind]=auc(pos,neg)
    names=['expandedK2','linear','factor','semantic','personalized','selected','blend']
    compact={'primary':{},'manual':{},'temporal':{},'user7':{},'user7Baseline':baselines,'mutualBootstrap':mutual}
    for label,source in [('primary',primary),('manual',manual),('temporal',temporal)]:
        for name in names:
            m=source['models'][name]
            compact[label][name]={k:m[k] for k in ['personMeanAuc','worstQuarterMeanAuc','top3_auc','ndcg3','allPairs','extremePairs']}
            compact[label][name]['impact']={k:v for k,v in m['impactVsExpandedK2'].items() if k!='participants'}
        if label!='temporal':compact[label]['originalCalibration']=source['models']['expandedK2OriginalCalibration']
    for scope in ['full','purged']:
        compact['user7'][scope]={'winner':user['models'][scope]['tuning']['winner'],'models':{}}
        for name in names:
            source=user['models'][scope]['metrics'][name]
            compact['user7'][scope]['models'][name]={kind:source[kind] for kind in ['forward','geometric','mutualLearned']}
    stable={stage:read(stage+'-stable-mutual-report.json') for stage in ['primary','manual','temporal','user7']}
    manual_user=json.loads((OUT/'manual-user7/user7-report.json').read_text(encoding='utf8'))
    compact['stableMutual']={stage:{name:{k:m[k] for k in ['allPairs','extremePairs']} for name,m in stable[stage]['models'].items()} for stage in ['primary','manual','temporal']}
    compact['manualUser7']={scope:{name:{kind:m[kind]['likedVsDisliked'] for kind in ['forward','geometric','mutualLearned']} for name,m in v['metrics'].items()} for scope,v in manual_user['models'].items()}
    stable_scores=read('primary-stable-mutual-predictions.json')
    stable_predictions=json.loads(json.dumps(predictions))
    for name,scores in stable_scores.items():
        for r,s in zip(stable_predictions,scores):r['predictions'][name]['mutualLearned']=s
    stable_intervals={name:mutual_bootstrap(stable_predictions,name) for name in ['linear','personalized','selected']}
    compact['stableMutualBootstrap']=stable_intervals
    (OUT/'summary.json').write_text(json.dumps(compact,indent=2)+'\n',encoding='utf8')
    f=lambda n:f'{n:.4f}'
    lines=['# Pairwise preference experiment — Events 26–28','',
           'Run date: 2026-09-18. Offline research; no production changes.','',
           '## Decision','',
           '**Do not replace the existing model with this redesign.** Simple pairwise training offers a small directional gain, but the intervals include no improvement and many participants decline. The complete factor/semantic/history model lowers primary mean-person AUC, and the User 7 full-fit regression is not fixed. Nested model selection and blending do not produce a reliable overall gain.','',
           'Simple pairwise mean-person AUC changes 0.6238→0.6379 on the primary test, 0.6518→0.6710 on manually submitted rankings, and 0.5525→0.5612 on the later-event test. The primary gain interval is −0.0123 to +0.0415; 55 people improve, 43 decline, eight tie. User 7 directional liked AUC falls 0.5450→0.4750 under the all-direction fit.','',
           'The full personalized model scores 0.6109 primary mean-person AUC and 0.5450 User 7 directional AUC. Removing all User 7 training interactions raises its User 7 diagnostic to 0.5950 versus the expanded baseline’s 0.4175, but the corresponding manual-only comparison is 0.5450 versus 0.5500. This is useful diagnostic evidence, not a universal improvement.','',
           '## Design','',
           '- Same exact data snapshot as the V12 expansion experiment: 106 unique people, 132 event ballots, 1,966 directions and 983 reciprocal exposed pairs.',
           '- Six outer participant folds; held-out participants are removed as chooser and target across all events. Three inner folds select regularization and model family without outer labels.',
           '- Four challenger families, each with regularization 0.003 or 0.03: pairwise linear; rank-four factor interactions; factors plus learned semantic evidence; those features plus a strongly shrunk personal history residual.',
           '- Pairwise loss mixes 75% top-three-versus-rest ordering with 25% full ranking. Total training weight is equal per person, split across their event ballots.',
           '- Selection criterion: 80% mean participant top-three AUC plus 20% worst-quarter mean AUC. A separately evaluated convex blend uses an inner-selected weight from 0, 0.25, 0.5, 0.75 or 1.',
           '- Historical semantic coverage: 110/246 Event 26 pairs, 122/350 Event 27 pairs, 123/387 Event 28 pairs. Only exact-content-hash, non-fallback cached evidence is used. Missing values have an explicit indicator. No new AI generations or database writes.',
           '- Learned mutual combiner: a regularized logistic model with nonnegative coefficients on the lower and higher directional predictions. It trains on inner held-out predictions. Both directions of each outer pair come from the same fold model.',
           '- Mutual positive means both rank each other in their top three. “All pairs” includes every other reciprocal exposed pair as negative. “Extreme pairs” matches the prior high-vs-low proxy, excluding mixed and middle outcomes.',
           '- These are ranking proxies, not observed romantic attraction or match-success probabilities. Auto-saved rankings are included in the controlled primary comparison and excluded in the separate sensitivity.',
           '', '## Primary held-out results','',
           '| Model | Mean person AUC | Worst-quarter AUC | Mutual AUC, all pairs | Mutual AUC, extreme pairs |',
           '|---|---:|---:|---:|---:|']
    baseline=primary['models']['expandedK2OriginalCalibration']
    lines.append(f"| Expanded k=2, original scoring | {f(baseline['personMeanAuc'])} | {f(baseline['worstQuarterMeanAuc'])} | {f(baseline['allPairs']['geometricAuc'])} | {f(baseline['extremePairs']['geometricAuc'])} |")
    for name in names:
        m=primary['models'][name]
        lines.append(f"| {name}, learned mutual combiner | {f(m['personMeanAuc'])} | {f(m['worstQuarterMeanAuc'])} | {f(m['allPairs']['learnedAuc'])} | {f(m['extremePairs']['learnedAuc'])} |")
    lines+=['','The expandedK2 row with the learned combiner tests recalibration/combination changes on the existing model. Directional AUC is unchanged by its monotone calibration. The original two-fold reciprocal calculation reproduces the previous 0.6751 AUC; the same-model pair calculation above is a different, consistently applied evaluation.','',
            'The worst-quarter statistic takes each model’s lowest 27 participant AUCs; the membership of that quarter can change. It does not mean the same 27 people all improve.','',
            'The selected row evaluates inner model selection as a complete procedure. Individual family results are exploratory comparisons; selecting the best outer-table entry afterward would introduce selection optimism.','',
            '## Individual changes','', '| Model | Improve / decline / tie | Mean AUC change | 95% participant bootstrap interval |','|---|---:|---:|---:|']
    for name in names[1:]:
        x=primary['models'][name]['impactVsExpandedK2']
        lines.append(f"| {name} | {x['improved']} / {x['declined']} / {x['unchanged']} | {f(x['meanDelta'])} | {f(x['bootstrap95Ci'][0])} to {f(x['bootstrap95Ci'][1])} |")
    lines+=['','Intervals resample participants while holding predictions fixed; they do not refit the pipeline or correct for repeated experimentation. The mutual bootstrap resamples participant nodes and weights each pair by both endpoint multiplicities. Its estimates are in `mutual-bootstrap.json`.','',
            '## Robustness','', '| Model | Manual-only person AUC | Later Event 28 person AUC | Manual mutual AUC, all | Later mutual AUC, all |', '|---|---:|---:|---:|---:|']
    for name in names:
        m,h=manual['models'][name],temporal['models'][name]
        lines.append(f"| {name} | {f(m['personMeanAuc'])} | {f(h['personMeanAuc'])} | {f(m['allPairs']['learnedAuc'])} | {f(h['allPairs']['learnedAuc'])} |")
    lines+=['','Temporal models train only on Events 26–27 and predict Event 28. This is a retrospective recipe holdout; the final all-event model has not received prospective validation. Returning and new attendee results are saved separately in the temporal report.','',
            '## User 7','', 'The 30-person benchmark remains evaluation-only: 20 liked, 10 disliked. Directional AUC is the aligned metric because the labels only describe User 7’s preferences. The mutual columns are diagnostics, not validated reciprocal interest.','',
            '| Model | Full: directional liked AUC | Full: learned mutual liked AUC | Purged: directional liked AUC | Purged: learned mutual liked AUC |','|---|---:|---:|---:|---:|']
    for name in names:
        a,b=[user['models'][scope]['metrics'][name] for scope in ['full','purged']]
        lines.append(f"| {name} | {f(a['forward']['likedVsDisliked'])} | {f(a['mutualLearned']['likedVsDisliked'])} | {f(b['forward']['likedVsDisliked'])} | {f(b['mutualLearned']['likedVsDisliked'])} |")
    lines+=['',f"Original frozen V12 reference: directional liked AUC {f(baselines['frozenV12']['directional'])}; operational mutual-plus-fixed-AI liked AUC {f(baselines['frozenV12']['final'])}. Expanded k=2 reference: directional {f(baselines['candidateFull']['directional'])}; operational final {f(baselines['candidateFull']['final'])}.",'',
            'Full fits include prior User 7 event rankings. Purged fits remove all 92 directions involving User 7. No benchmark categories enter training or parameter selection. Because this benchmark has been repeatedly inspected, it is development evidence rather than a fresh test. All 30 User 7 semantic scores have verified current-content coverage; this is higher than the historical training coverage.','',
            'The new learned scores replace the old fixed AI adjustment. Do not interpret their numeric values as calibrated real-world liking probabilities. Romantic-versus-disliked and friendly-versus-disliked AUCs are available in the detailed report; no romance-specific model was trained because the event labels do not establish romantic intent.','',
            '## Follow-up: bounded mutual ranking','',
            'The first logistic combiner shrank close to the training prevalence of mutual positives. Differences in fold intercepts dominated the pooled score ordering. A follow-up replaces it with an inner-selected geometric mean or a convex combination of min/max directional scores (five weights: 0, 0.25, 0.5, 0.75, 1). Directional models and their parameters stay unchanged. This is an exploratory follow-up prompted by the first result, not a new independent test.','',
            '| Model | Primary mutual AUC, all pairs | Manual-only mutual AUC, all pairs | Later-event mutual AUC, all pairs |',
            '|---|---:|---:|---:|']
    for name in ['expandedK2','linear','personalized','selected','blend']:
        vals=[stable[stage]['models'][name]['allPairs']['learnedAuc'] for stage in ['primary','manual','temporal']]
        lines.append(f"| {name} | {' | '.join(f(x) for x in vals)} |")
    lines+=['','The simpler combiner removes the worst collapse but still gives no consistent replacement: the primary linear candidate is 0.5388 versus 0.5830 for the original expanded baseline scoring on the same pairs. Manual-only linear AUC improves to 0.6157 versus 0.5679 for the original baseline scoring. The favorable manual-only result does not persist across all checks.','',
            '## Manual-only User 7 sensitivity','',
            'Retrained all families with only explicitly submitted rankings, with separate inner selection. The purged fit excludes 83 manual incident directions involving User 7. These use the same 30 benchmark labels and profiles.','',
            '| Model | Full-fit directional liked AUC | User 7 purged directional liked AUC |', '|---|---:|---:|']
    for name in names:
        a,b=[manual_user['models'][scope]['metrics'][name]['forward']['likedVsDisliked'] for scope in ['full','purged']]
        lines.append(f'| {name} | {f(a)} | {f(b)} |')
    lines+=['','The existing expanded recipe benefits from excluding auto-saved labels on this fixed benchmark (0.5450→0.6225). The proposed full model improves less (0.5450→0.5750), and simple pairwise reaches 0.5600. Original frozen V12 remains higher at 0.6625 directional AUC. This comparison does not establish that manual-only training improves every future participant.','',
            '## Artifacts and verification','',
            '- `scripts/test-pairwise-matching.py`: deterministic training and nested evaluation.',
            '- `scripts/prepare-pairwise-semantics.mjs`: exact-content cache replay, read-only.',
            '- `scripts/verify-pairwise-matching.py`: original baseline replay, independent saved-model inference and AUC checks, production file hashes.',
            '- `scripts/stabilize-pairwise-mutual.py`: exploratory bounded-combiner checks and manual-only User 7 sensitivity.',
            '- `tmp/pairwise-2026-09-18/`: complete protocol, folds, predictions, model artifacts, results and verification.',
            '- Original 1,966 out-of-fold baseline predictions reproduce exactly. All 1,200 saved-model directional/reverse replay checks pass within 2.3e-15. All 17,525 bounded-mutual score checks pass. The 120 original User 7 baseline score checks pass exactly, with unchanged semantic evidence. Production source/config hashes are unchanged.',
            '']
    (ROOT/'docs/PAIRWISE_MATCHING_EXPERIMENT_2026-09-18.md').write_text('\n'.join(lines),encoding='utf8')
    for label in ['primary','manual','temporal']:
        print(label,{n:{k:round(v,4) for k,v in compact[label][n].items() if k in ['personMeanAuc','worstQuarterMeanAuc']} for n in names})
    print('user7',json.dumps(compact['user7']))


if __name__=='__main__':main()
