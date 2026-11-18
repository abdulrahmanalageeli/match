"""Portable survey-pair Ridge scorer for SHADOW evaluation only.

No production integration, database access, network access, generated survey
answers, or model selection. The fixed recipe was selected earlier by the
connection experiment's inner CV: 75% wantConnect / 25% ranking-percentile loss.
The final fit uses all approved recent-event responses and ranking rows.

JSON contains no participant IDs, individual answers, labels, or training-row
scores. Inference reconstructs feature arithmetic, not a sklearn object/pickle.
It must use the exact hashed nonlinear.py feature encoder. Scores are raw
ranking utilities, NOT calibrated probabilities of connection or compatibility.

CLI:
    python scripts/survey-search/shadow.py train
    python scripts/survey-search/shadow.py score-roster --roster roster.json \
        --chooser 7 --output shadow-scores.json

Roster JSON is a list or {"profiles": [...]} with each item containing an
existing participant_number, assigned_number, or id, and an answers dictionary.
An ID is only an output/lookup key. It is never a predictive feature.
"""
import argparse
import hashlib
import importlib.util
import itertools
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'tmp/survey-search-2026-09-23'
MODEL_PATH = OUT/'shadow-model.json'
ENCODER_PATH = Path(__file__).with_name('nonlinear.py')
DATA_PATH = ROOT/'.tmp-mbti16-20260923-data-personalization.json'
BENCHMARK_PROFILES_PATH = ROOT/'.tmp-mbti16-20260923-user7-personalization.json'


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


nonlinear = load_module('shadow_survey_encoder', ENCODER_PATH)
ENCODER_LOADED_HASH = hashlib.sha256(ENCODER_PATH.read_bytes()).hexdigest()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False)+'\n',encoding='utf8')


def validate_model(model):
    """Fail closed if the model and feature encoder no longer match."""
    if model.get('config',{}).get('status') != 'SHADOW_ONLY':
        raise ValueError('Only an explicit SHADOW_ONLY artifact is accepted')
    expected = model.get('source_hashes',{}).get('nonlinear.py')
    if not expected or expected != ENCODER_LOADED_HASH or expected != digest(ENCODER_PATH):
        raise ValueError('Survey feature encoder hash mismatch; inference refused. Reproduce the audited artifact or retrain explicitly.')
    names, scales, weights = model['feature_names'],model['scaler_scales'],model['ridge_weights']
    if not len(names)==len(scales)==len(weights) or len(set(names))!=len(names):
        raise ValueError('Invalid feature/scaler/weight dimensions')
    if not all(math.isfinite(float(x)) and x>0 for x in scales):
        raise ValueError('Invalid scaler scales')
    if not all(math.isfinite(float(x)) for x in [*weights,model['ridge_intercept']]):
        raise ValueError('Nonfinite model coefficient')
    return model


def load_model(path=MODEL_PATH):
    return validate_model(read(path))


def _direction(model, source, target):
    features = nonlinear.feature_dict(source,target,model['config']['model_config']['features'])
    return float(model['ridge_intercept'] + math.fsum(
        float(features.get(name,0.))*float(weight)/float(scale)
        for name,scale,weight in zip(model['feature_names'],model['scaler_scales'],model['ridge_weights'])
    ))


def score_pair(model, profile_a, profile_b):
    """Return uncalibrated directional and bottleneck mutual survey utilities."""
    validate_model(model)
    forward,reverse = _direction(model,profile_a,profile_b),_direction(model,profile_b,profile_a)
    return dict(forward_utility=forward,reverse_utility=reverse,minimum_mutual_utility=min(forward,reverse),
                interpretation='Uncalibrated ranking utility, not a probability',status='SHADOW_ONLY')


def train():
    connection_path = Path(__file__).with_name('connection.py')
    connection = load_module('shadow_connection_training',connection_path)
    source = read(DATA_PATH)
    profiles = {(int(p['event_id']),int(p['assigned_number'])):p for p in source['profiles']}
    feedback,excluded = connection.feedback_rows(source,profiles)
    feedback = [r for r in feedback if r['event_id'] in [26,27,28]]
    rankings = connection.trainer.ranking_rows(source,[26,27,28],True)
    # This is an already selected recipe. No selection, benchmark labels,
    # feedback from later events, or automatic promotion is performed here.
    config = dict(connection.BY_NAME['connect_joint75_pairridge'])
    fitted = connection.DirectModel(config,feedback,rankings,profiles)
    if fitted.constant is not None:
        raise ValueError('Unexpected constant fit; cannot export the selected Ridge recipe')
    artifact = dict(
        feature_names=list(fitted.vectorizer.feature_names_),
        scaler_scales=[float(x) for x in fitted.scaler.scale_],
        ridge_weights=[float(x) for x in fitted.model.coef_],
        ridge_intercept=float(fitted.model.intercept_),
        config=dict(status='SHADOW_ONLY',schema_version=1,model_config=config,
                    feedback_loss_weight=.75,ranking_loss_weight=.25,
                    include_auto_saved_rankings=True,events=[26,27,28],
                    training_objective='Pointwise weighted Ridge on wantConnect and ranking percentiles; equal influence per chooser-event within each source.',
                    interpretation='Raw utility, not a calibrated probability. Minimum of forward/reverse is a conservative mutual utility, not a measured mutual success probability.',
                    validation_status='This final all-recent-data fit has not been prospectively validated. Historical nested evaluation concerns the model-selection procedure, not held-out accuracy of this final fit.',
                    production_activation=False),
        source_hashes={'nonlinear.py':digest(ENCODER_PATH),'connection.py':digest(connection_path),
                       'shadow.py':digest(Path(__file__)),'recent_minimized_dataset':digest(DATA_PATH)},
        training_counts=dict(feedback_responses=len(feedback),ranking_directions=len(rankings),
                             explicit_rankings=sum(not r.get('auto_saved',False) for r in rankings),
                             auto_saved_rankings=sum(bool(r.get('auto_saved',False)) for r in rankings),
                             survey_profiles=len(profiles),features=len(fitted.vectorizer.feature_names_)),
    )
    write(MODEL_PATH,artifact)
    restored = load_model(MODEL_PATH)
    # Serialization parity only: this final fit has seen all event26–28 labels.
    # Calling these event27/28 rows "held out" here would be incorrect.
    recent_queries = [r for r in feedback if r['event_id'] in [27,28]]
    benchmark_source = read(BENCHMARK_PROFILES_PATH)
    if isinstance(benchmark_source,dict):
        benchmark_source = benchmark_source['profiles']
    benchmark_profiles = {(0,int(p['assigned_number'])):p for p in benchmark_source}
    profiles.update(benchmark_profiles)
    candidates = sorted(n for event,n in benchmark_profiles if n!=7)
    benchmark_queries = [dict(event_id=0,ranker_number=a,ranked_number=b) for n in candidates for a,b in [(7,n),(n,7)]]
    parity = {}
    for name,queries in [('recent_event27_28_query_pairs',recent_queries),('user7_benchmark_directions',benchmark_queries)]:
        expected = fitted.predict(queries)
        actual = [score_pair(restored,profiles[(r['event_id'],r['ranker_number'])],profiles[(r['event_id'],r['ranked_number'])])['forward_utility'] for r in queries]
        error = max(abs(float(a)-float(b)) for a,b in zip(expected,actual))
        if error>1e-9:
            raise AssertionError(f'Portable inference parity failed for {name}: {error}')
        parity[name] = dict(directions=len(queries),maximum_absolute_error=error,passed=True)
    tampered = dict(restored,source_hashes=dict(restored['source_hashes'],**{'nonlinear.py':'0'*64}))
    try:
        score_pair(tampered,{'answers':{}},{'answers':{}})
    except ValueError:
        parity['feature_encoder_hash_mismatch_rejected'] = True
    else:
        raise AssertionError('Mismatched feature encoder was not rejected')
    parity['purpose'] = 'Serialization/arithmetic parity only, NOT held-out performance. The final fit saw all recent labels; benchmark category labels were never read.'
    parity['model_sha256'] = digest(MODEL_PATH)
    write(OUT/'shadow-parity.json',parity)
    usage = '''# Survey matching shadow prototype

This prototype scores survey pairs for offline review. It does not activate or
change production matching. Its fixed recent-data recipe gives 75% of training
weight to actual wantConnect responses and 25% to ranking percentiles.

The final model uses 256 responses and 1,966 ranking directions, including
auto-saved rankings, matching the connection experiment recipe. The separate
primary ranking search used 1,539 explicit ranking directions. This final fit
has no prospective validation; serialization parity is not an accuracy test.

```powershell
python scripts/survey-search/shadow.py train
python scripts/survey-search/shadow.py score-roster --roster roster.json --chooser 7 --output tmp/survey-search-2026-09-23/shadow-scores.json
```

`roster.json` is an existing minimized survey export, either a list of profiles
or an object containing `profiles`. Every profile needs an existing
`participant_number`, `assigned_number`, or `id`, plus `answers`. For a roster
export containing repeated people across events, add `--event 28` to select one
event. IDs are lookup/output keys and never predictive features. Omit `--chooser`
to score every unordered pair. No names, contacts, or free text are needed.

Python API: `model = load_model(path)` then
`score_pair(model, profile_a, profile_b)`. It returns forward/reverse raw utility
and their minimum. These values are **not calibrated connection probabilities**.
The JSON artifact contains only feature names, scales, Ridge coefficients,
configuration, hashes and aggregate counts. A changed feature encoder causes
inference to fail rather than silently using inconsistent features.
'''
    (OUT/'shadow-usage.md').write_text(usage,encoding='utf8')
    print(json.dumps(dict(model_path=str(MODEL_PATH),training_counts=artifact['training_counts'],parity=parity),indent=2))


def score_roster(args):
    model = load_model(args.model)
    source = read(args.roster)
    if isinstance(source,dict):
        source = source['profiles']
    profiles = {}
    for profile in source:
        if args.event is not None and str(profile.get('event_id'))!=str(args.event):
            continue
        identifier = next((profile[k] for k in ['participant_number','assigned_number','id'] if k in profile and profile[k] is not None),None)
        if identifier is None:
            raise ValueError('Every roster profile needs an existing participant ID')
        identifier = str(identifier)
        if identifier in profiles:
            raise ValueError('Duplicate participant ID; choose a single roster/event with --event')
        profiles[identifier] = profile
    if len(profiles)<2:
        raise ValueError('At least two survey profiles are needed')
    if args.chooser is not None:
        if str(args.chooser) not in profiles:
            raise ValueError('Requested chooser is absent from the roster')
        pairs = [(str(args.chooser),other) for other in sorted(profiles) if other!=str(args.chooser)]
    else:
        pairs = itertools.combinations(sorted(profiles),2)
    scores = [dict(participant_a=a,participant_b=b,**score_pair(model,profiles[a],profiles[b])) for a,b in pairs]
    result = dict(status='SHADOW_ONLY',production_changed=False,
                  interpretation='Uncalibrated utilities for offline review, not connection probabilities.',pairs=scores)
    if args.output:
        write(Path(args.output),result)
        print(json.dumps(dict(output=str(Path(args.output).resolve()),pairs=len(scores),status='SHADOW_ONLY')))
    else:
        print(json.dumps(result,indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command',required=True)
    sub.add_parser('train')
    score = sub.add_parser('score-roster')
    score.add_argument('--model',type=Path,default=MODEL_PATH)
    score.add_argument('--roster',type=Path,required=True)
    score.add_argument('--chooser')
    score.add_argument('--event',type=int)
    score.add_argument('--output',type=Path)
    args = parser.parse_args()
    train() if args.command=='train' else score_roster(args)


if __name__=='__main__':
    main()
