"""Build an outcome-free display index for the immutable shared Ridge artifact.

Loads and scores only. Never fits, selects, changes or rewrites the model.
The reference is the same 256 usable training-feedback directions as research.
"""
import bisect
import collections
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
MODEL_PATH=ROOT/'tmp/survey-search-2026-09-23/shadow-model.json'
DATA_PATH=ROOT/'.tmp-mbti16-20260923-data-personalization.json'
SCALE_PATH=ROOT/'server/matching/connection-score-scale.json'
AUDIT_PATH=ROOT/'tmp/survey-search-2026-09-23/connection-score-scale-audit.json'
EXPECTED_MODEL='b14be564cf25d5cfecbb88858a2e480f8bd8d32828a67a3a4be4136e3eeb021d'
MODEL_VERSION='2026-09-23-v14-shared-connection-75-25-min-100'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def quantile(values,p):
    values=sorted(values)
    location=(len(values)-1)*p
    low=math.floor(location)
    high=math.ceil(location)
    return values[low]+(location-low)*(values[high]-values[low])

def distribution(values):
    return dict(count=len(values),minimum=min(values),maximum=max(values),
        mean=math.fsum(values)/len(values),q1=quantile(values,.25),
        median=quantile(values,.5),q3=quantile(values,.75),
        iqr=quantile(values,.75)-quantile(values,.25))

def display(scale,x):
    knots=scale['knots']
    low,high=knots[0],knots[-1]
    if not math.isfinite(x):
        raise ValueError('Raw utility must be finite')
    if x<low['x']:
        return low['y']/(1+(low['x']-x)/scale['tailScale'])
    if x>high['x']:
        return 100-(100-high['y'])/(1+(x-high['x'])/scale['tailScale'])
    i=bisect.bisect_left([k['x'] for k in knots],x)
    if knots[i]['x']==x:
        return knots[i]['y']
    a,b=knots[i-1],knots[i]
    return a['y']+(x-a['x'])/(b['x']-a['x'])*(b['y']-a['y'])

def main():
    assert digest(MODEL_PATH)==EXPECTED_MODEL,'Frozen artifact hash mismatch'
    shadow_path=ROOT/'scripts/survey-search/shadow.py'
    spec=importlib.util.spec_from_file_location('connection_scale_frozen_shadow',shadow_path)
    shadow=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=shadow
    spec.loader.exec_module(shadow)
    model=shadow.load_model(MODEL_PATH)
    data=read(DATA_PATH)
    # The old export timestamp is the only permitted input difference.
    original_export=read(ROOT/'tmp/mbti16-2026-09-23/data-refresh-audit.json')['exportedAt']
    normalized=DATA_PATH.read_bytes().replace(data['exported_at'].encode(),original_export.encode())
    normalized_hash=hashlib.sha256(normalized).hexdigest()
    assert normalized_hash==model['source_hashes']['recent_minimized_dataset'],'Survey/training data changed since immutable model fit'
    profiles={(int(p['event_id']),int(p['assigned_number'])):p for p in data['profiles']}
    kept=[]
    excluded=collections.Counter()
    seen=set()
    for r in data['one_to_one_feedback']:
        e,a,b=int(r['event_id']),int(r['ranker_number']),int(r['ranked_number'])
        identity=e,a,b,int(r.get('phase',0))
        if identity in seen:
            excluded['duplicate_response']+=1
            continue
        seen.add(identity)
        if e not in [26,27,28]:
            excluded['outside_reference_events']+=1
            continue
        if r.get('partner_in_event_roster') is not True or a==b:
            excluded['invalid_partner']+=1
            continue
        if any((e,n) not in profiles for n in [a,b]):
            excluded['missing_survey']+=1
            continue
        if r.get('meetingOccurred') is False or r.get('meetingStatus') not in [None,'met']:
            excluded['did_not_meet']+=1
            continue
        if not isinstance(r.get('wantConnect'),bool):
            excluded['no_boolean_response']+=1
            continue
        kept.append((e,a,b))
    assert len(kept)==model['training_counts']['feedback_responses']==256
    pairs=[shadow.score_pair(model,profiles[e,a],profiles[e,b]) for e,a,b in kept]
    utilities=[p['forward_utility'] for p in pairs]
    mutual=[p['minimum_mutual_utility'] for p in pairs]
    assert all(math.isfinite(x) for x in utilities+mutual)
    counts=collections.Counter(utilities)
    n=len(utilities)
    knots=[]
    less=0
    for x,count in sorted(counts.items()):
        knots.append(dict(x=x,y=(less+.5*count+.5)/(n+1)*100,count=count))
        less+=count
    summary=distribution(utilities)
    scale=dict(schemaVersion=1,modelVersion=MODEL_VERSION,
        method='piecewise-linear-midrank-rational-tails',
        referenceCount=n,tailScale=max(summary['iqr'],1e-6),knots=knots,
        interpretation='Directional-reference compatibility index, not a calibrated connection probability. The minimum of two directional indices is conservative mutual utility standing, not a measured mutual success probability or percentile of a mutual-score reference.',
        provenance=dict(sourceModelSha256=EXPECTED_MODEL,
            featureEncoderSha256=model['source_hashes']['nonlinear.py'],
            originalTrainingDatasetSha256=model['source_hashes']['recent_minimized_dataset'],
            currentExportSha256=digest(DATA_PATH),
            inputMatchesOriginalExceptExportTimestamp=True,
            referenceSortedUtilitiesSha256=hashlib.sha256(json.dumps(sorted(utilities),separators=(',',':')).encode()).hexdigest(),
            generatorSha256=digest(Path(__file__)),
            referenceEvents=[26,27,28],
            referenceDefinition='256 usable actual-meeting training-feedback directions. Each response contributes one directional raw utility. Boolean label values are not used to fit this scale.',
            modelRefitted=False,heldOutPerformanceUsedToChooseScale=False,
            percentileFormula='100 * (number_less + 0.5 * number_equal + 0.5) / (N + 1)',
            interpolation='Linear between unique raw-utility knots.',
            lowerTail='y_min / (1 + (x_min - x) / tailScale)',
            upperTail='100 - (100 - y_max) / (1 + (x - x_max) / tailScale)',
            tailScaleRule='max(type7_reference_interquartile_range, 1e-6)',
            aggregation='Preserve raw minimum utility; strictly monotone display mapping commutes with minimum in exact arithmetic.',
            quantileRule='Type7 linear interpolation at (N-1)*p.'))
    assert all(a['x']<b['x'] and a['y']<b['y'] for a,b in zip(knots,knots[1:]))
    assert sum(k['count'] for k in knots)==256
    sorted_u=sorted(utilities)
    for k in knots:
        exact=(bisect.bisect_left(sorted_u,k['x'])+.5*(bisect.bisect_right(sorted_u,k['x'])-bisect.bisect_left(sorted_u,k['x']))+.5)/(n+1)*100
        assert k['y']==exact and display(scale,k['x'])==exact
    probes=sorted(set([k['x'] for k in knots]+[(a['x']+b['x'])/2 for a,b in zip(knots,knots[1:])]+
        [knots[0]['x']-summary['iqr']*v for v in [1,2,10,100,1000000]]+
        [knots[-1]['x']+summary['iqr']*v for v in [1,2,10,100,1000000]]))
    mapped=[display(scale,x) for x in probes]
    assert all(0<x<100 for x in mapped)
    assert all(a<b for a,b in zip(mapped,mapped[1:]))
    for p in pairs:
        assert math.isclose(display(scale,p['minimum_mutual_utility']),min(display(scale,p['forward_utility']),display(scale,p['reverse_utility'])),rel_tol=0,abs_tol=1e-12)
    assert digest(MODEL_PATH)==EXPECTED_MODEL,'Immutable model was altered'
    SCALE_PATH.parent.mkdir(parents=True,exist_ok=True)
    SCALE_PATH.write_text(json.dumps(scale,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf8')
    audit=dict(status='pass',modelVersion=MODEL_VERSION,
        rawDirectionalUtilityDistribution=summary,
        rawMinimumMutualUtilityDistribution=distribution(mutual),
        referenceRows=n,uniqueKnots=len(knots),excluded=dict(excluded),
        scoreScaleSha256=digest(SCALE_PATH),modelSha256BeforeAndAfter=EXPECTED_MODEL,
        originalDataVerifiedExceptExportTimestamp=True,
        empiricalKnotChecks=len(knots),strictMonotonicProbeChecks=len(probes),
        minimumCommutationChecks=len(pairs),tailScale=scale['tailScale'],
        endpointMidranks=dict(minimum=knots[0]['y'],maximum=knots[-1]['y']),
        noOutcomeLabelCalibration=True,noRefit=True,
        cautions=['The reference uses in-sample training directions and is not probability calibration.',
                  'The index of minimum directional utility is not the percentile of a separately fitted mutual reference.',
                  'Display interpolation preserves raw order mathematically; rounding for UI can create display ties, so retain raw utility.',
                  'Rational tails approach0/100 without exact finite endpoints in real arithmetic; floating-point extreme saturation remains possible.'])
    AUDIT_PATH.write_text(json.dumps(audit,indent=2,allow_nan=False)+'\n',encoding='utf8')
    print(json.dumps(audit,indent=2))
if __name__=='__main__':
    main()
