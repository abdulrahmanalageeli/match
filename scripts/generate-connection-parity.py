"""Generate synthetic JS parity fixtures from the ORIGINAL Python encoder.

No participants, benchmark records, fitting, or database access are involved.
Pins the immutable shared-connection artifact and verifies encoder provenance.
"""
import hashlib
import importlib.util
import itertools
import json
import math
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT/'server/matching/connection-model-config.json'
ENCODER = ROOT/'scripts/survey-search/nonlinear.py'
DESTINATION = ROOT/'server/matching/fixtures/connection-python-parity.json'
ARTIFACT_HASH = 'b14be564cf25d5cfecbb88858a2e480f8bd8d32828a67a3a4be4136e3eeb021d'


def main():
    assert hashlib.sha256(ARTIFACT.read_bytes()).hexdigest()==ARTIFACT_HASH
    model = json.loads(ARTIFACT.read_text(encoding='utf8'))
    encoder_hash = hashlib.sha256(ENCODER.read_bytes()).hexdigest()
    assert encoder_hash==model['source_hashes']['nonlinear.py']
    spec = importlib.util.spec_from_file_location('original_connection_encoder',ENCODER)
    encoder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(encoder)
    profiles = []
    for value in ['A','B','C','D','0','1','2','3','4','5',None]:
        profiles.append({'answers':{question:value for question in encoder.QUESTIONS}})
    for value in ['أ','ا','ب','ج','د',' a ','\tb\n']:
        profiles.append({'answers':{question:value for question in encoder.QUESTIONS}})
    profiles.append({'answers':{question:i%6 for i,question in enumerate(encoder.QUESTIONS)}})
    unknowns = [None,True,False,[],{},1.25,'UNKNOWN','E','INTJ','',['A'],[0]]
    profiles.append({'answers':{question:unknowns[i%len(unknowns)] for i,question in enumerate(encoder.QUESTIONS)}})
    for poles in itertools.product('EI','SN','TF','JP'):
        profiles.append({'answers':{'social_battery':'A'},'mbti_personality_type':''.join(poles)})
    profiles.extend([
        {'answers':{},'mbti_type':'enfp'},
        {'answers':{},'mbti_personality_type':' INTJ '},
        {'answers':{'mbti_1':'A'},'mbti_personality_type':'INTJ'},
        {'answers':{'match_current_focus':sorted(encoder.FOCUS)}},
        {'answers':{'match_current_focus':' career,STUDY,career,unknown, SELF_GROWTH '}},
        {'answers':{'match_current_focus':['study','CAREER','other','unknown',None,False]}},
        {'answers':{'match_current_focus':{'CAREER':True,'STUDY':False,'NOPE':True}}},
    ])
    rng = random.Random(260923)
    for _ in range(12):
        values = {question:rng.choice(['A','B','C','D',None,'0','1','2','3','4','5']) for question in encoder.QUESTIONS}
        values['match_current_focus'] = rng.sample(sorted(encoder.FOCUS),rng.randint(0,len(encoder.FOCUS)))
        profiles.append({'answers':values})

    def score(features):
        return model['ridge_intercept']+math.fsum(features.get(name,0.)*weight/scale for name,weight,scale in
             zip(model['feature_names'],model['ridge_weights'],model['scaler_scales']))

    pairs = list(itertools.product(range(11),repeat=2))
    for i in range(11,len(profiles)):
        pairs.extend([(i,i),(i,(i*7+3)%len(profiles)),((i*7+3)%len(profiles),i)])
    cases,covered = [],set()
    for i,j in pairs:
        features = encoder.feature_dict(profiles[i],profiles[j],'pair')
        reverse = encoder.feature_dict(profiles[j],profiles[i],'pair')
        a,b = score(features),score(reverse)
        covered.update(key for key,value in features.items() if value)
        cases.append(dict(source=i,target=j,features=features,rawAToB=a,rawBToA=b,rawMutual=min(a,b)))
    missing = sorted(set(model['feature_names'])-covered)
    assert not missing, f'Trained features without nonzero synthetic coverage: {missing}'
    # Keep the checked-in fixture small while retaining every model feature and
    # every normalization/MBTI/focus input profile. This selects TEST CASES only,
    # without participant data, target labels, fitting, or model selection.
    universe = {f'feature:{name}' for name in model['feature_names']} | {f'profile:{i}' for i in range(len(profiles))}
    case_coverage = [{f'feature:{name}' for name,value in case['features'].items() if value and name in model['feature_names']}
                     | {f'profile:{case["source"]}',f'profile:{case["target"]}'} for case in cases]
    chosen = []
    while universe:
        index = max(range(len(cases)),key=lambda i:len(case_coverage[i]&universe))
        assert case_coverage[index]&universe
        chosen.append(cases[index])
        universe -= case_coverage[index]
    cases = chosen
    output = dict(provenance='Original Python nonlinear.feature_dict(..., pair), immutable model coefficients, synthetic inputs only.',
                  artifact_sha256=ARTIFACT_HASH,encoder_sha256=encoder_hash,
                  model_feature_count=len(model['feature_names']),nonzero_model_features_covered=len(set(model['feature_names'])&covered),
                  profiles=profiles,cases=cases)
    DESTINATION.parent.mkdir(parents=True,exist_ok=True)
    DESTINATION.write_text(json.dumps(output,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n',encoding='utf8')
    print(json.dumps(dict(profiles=len(profiles),cases=len(cases),model_features=len(model['feature_names']),covered=output['nonzero_model_features_covered'],output=str(DESTINATION))))


if __name__=='__main__':
    main()
