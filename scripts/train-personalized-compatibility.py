import argparse
import collections
import hashlib
import json
import math
import os
import pathlib
import platform
import subprocess
import sys

os.environ.setdefault('LOKY_MAX_CPU_COUNT', '1')

import numpy as np
from scipy.stats import spearmanr
from sklearn.cluster import KMeans
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import ndcg_score, roc_auc_score
from sklearn.model_selection import GroupKFold

DEFAULT_DATA_PATH = pathlib.Path('.tmp-event26-27-personalization.json')
DEFAULT_VERSION = '2026-09-11-v13-events26-27-archetype-ai-chemistry-100'
INCUMBENT_V12_GIT_REVISION = '35550c4'
INCUMBENT_CONFIG_REPO_PATH = 'server/matching/personalized-model-config.json'
RANDOM_SEED = 2609

QUESTIONS = [
    'match_disagreement_style', 'match_similarity_preference',
    'humor_banter_style', 'early_openness_comfort',
    'conversation_initiative_preference', 'expression_language',
    'minimum_partner_religious_commitment', 'social_relationship_style',
    'attachment_1', 'attachment_3', 'attachment_4',
    'lifestyle_1', 'lifestyle_2', 'lifestyle_3', 'lifestyle_4', 'lifestyle_5',
    'core_values_1', 'core_values_2', 'core_values_3', 'core_values_4', 'core_values_5',
    'communication_1', 'communication_2', 'communication_3', 'communication_4', 'communication_5',
    'conversational_role', 'conversation_depth_pref', 'social_battery',
    'humor_subtype', 'curiosity_style', 'intent_goal', 'silence_comfort',
]

ARCHETYPE_QUESTIONS = [
    'match_disagreement_style', 'match_similarity_preference',
    'humor_banter_style', 'early_openness_comfort',
    'conversation_initiative_preference', 'expression_language',
    'minimum_partner_religious_commitment', 'social_relationship_style',
    'attachment_1', 'attachment_3', 'attachment_4',
    'conversational_role', 'conversation_depth_pref', 'social_battery',
    'humor_subtype', 'curiosity_style', 'intent_goal', 'silence_comfort',
]

EXPERT_QUESTIONS = set(ARCHETYPE_QUESTIONS + [
    'lifestyle_2', 'lifestyle_3', 'lifestyle_4',
    'core_values_1', 'core_values_2', 'core_values_4',
    'communication_1', 'communication_4',
])

ARABIC = {'أ': 'A', 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D'}


def norm(value):
    if value is None or value == '':
        return 'MISSING'
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    text = str(value).strip()
    return ARABIC.get(text, text.upper())


def answer(profile, question):
    return norm(profile.get('answers', {}).get(question))


def focus_values(profile):
    value = profile.get('answers', {}).get('match_current_focus', [])
    if isinstance(value, str):
        value = [item.strip() for item in value.split(',') if item.strip()]
    return {norm(item) for item in value or []}


def profile_tokens(profile):
    features = {f'{q}={answer(profile, q)}': 1.0 for q in ARCHETYPE_QUESTIONS}
    for value in focus_values(profile):
        features[f'focus={value}'] = 1.0
    return features


def base_pair_features(a, b):
    result = {}
    for q in QUESTIONS:
        av, bv = answer(a, q), answer(b, q)
        result[f'pair:{q}:{av}>{bv}'] = 1.0
        result[f'target:{q}:{bv}'] = 0.35
        result[f'same:{q}'] = 1.0 if av == bv else 0.0
        if q in {'expression_language', 'minimum_partner_religious_commitment', 'social_relationship_style', 'early_openness_comfort'}:
            try:
                result[f'distance:{q}'] = abs(float(av) - float(bv)) / 4.0
            except ValueError:
                pass

    af, bf = focus_values(a), focus_values(b)
    union = af | bf
    result['focus:jaccard'] = len(af & bf) / len(union) if union else 0.5
    for value in bf:
        result[f'target_focus:{value}'] = 0.35
    for value in af & bf:
        result[f'shared_focus:{value}'] = 1.0

    return result


def is_expert_feature(key):
    if key.startswith(('focus:', 'shared_focus:', 'target_focus:')):
        return True
    return any(f':{q}:' in key or key == f'same:{q}' or key == f'distance:{q}' for q in EXPERT_QUESTIONS)


def pair_features(a, b, memberships):
    base = base_pair_features(a, b)
    result = dict(base)
    for k, weight in enumerate(memberships):
        if weight <= 1e-8:
            continue
        for key, value in base.items():
            if is_expert_feature(key) and value:
                result[f'archetype:{k}|{key}'] = weight * value
    return result

def profile_key(event_id, participant_number):
    return int(event_id), int(participant_number)


def ranking_rows(data, event_ids, include_auto_saved):
    selected = {int(value) for value in event_ids}
    ballots = collections.defaultdict(list)
    for source in data['rankings']:
        event_id = int(source['event_id'])
        if event_id not in selected or (not include_auto_saved and bool(source.get('auto_saved'))):
            continue
        ballots[(event_id, int(source['ranker_number']))].append(source)

    result = []
    for (event_id, ranker_number), ballot in sorted(ballots.items()):
        kept = sorted(ballot, key=lambda row: (int(row['rank']), int(row['ranked_number'])))
        if len(kept) < 2:
            continue
        count = len(kept)
        for position, source in enumerate(kept, start=1):
            result.append({
                'event_id': event_id,
                'ranker_number': ranker_number,
                'ranked_number': int(source['ranked_number']),
                'rank': position,
                'recorded_rank': int(source['rank']),
                'candidate_count': count,
                'auto_saved': bool(source.get('auto_saved')),
                'y': (count - position) / max(count - 1, 1),
            })
    return result


def taste_signatures(train_instances, train_rows, profiles):
    target_keys = {
        profile_key(row['event_id'], row['ranked_number'])
        for row in train_rows
    }
    categories = {
        question: sorted({answer(profiles[key], question) for key in target_keys})
        for question in ARCHETYPE_QUESTIONS
    }
    keys = [
        (question, value)
        for question in ARCHETYPE_QUESTIONS
        for value in categories[question]
    ]
    by_instance = collections.defaultdict(list)
    for row in train_rows:
        by_instance[profile_key(row['event_id'], row['ranker_number'])].append(row)

    signatures = []
    for instance in train_instances:
        values = by_instance[instance]
        vector = []
        for question, value in keys:
            outcomes = [
                row['y']
                for row in values
                if answer(
                    profiles[profile_key(row['event_id'], row['ranked_number'])],
                    question,
                ) == value
            ]
            vector.append((sum(outcomes) + 1.5 * 0.5) / (len(outcomes) + 1.5) - 0.5)
        signatures.append(vector)
    return np.asarray(signatures, dtype=float), keys


class Gate:
    def __init__(
        self,
        k,
        profile_vectorizer,
        classifier,
        cluster_model,
        train_instances,
        clusters,
        signature_keys=None,
    ):
        self.k = k
        self.profile_vectorizer = profile_vectorizer
        self.classifier = classifier
        self.cluster_model = cluster_model
        self.train_instances = train_instances
        self.clusters = clusters
        self.signature_keys = signature_keys or []

    def memberships(self, profile):
        if self.k == 1:
            return np.array([1.0])
        encoded = self.profile_vectorizer.transform([profile_tokens(profile)])
        probabilities = self.classifier.predict_proba(encoded)[0]
        full = np.zeros(self.k)
        for index, value in enumerate(self.classifier.classes_):
            full[int(value)] = probabilities[index]
        return full


def fit_gate(train_instances, train_rows, profiles, k, gate_c=0.1):
    train_instances = sorted(train_instances)
    profile_vectorizer = DictVectorizer(sparse=True)
    encoded_profiles = profile_vectorizer.fit_transform(
        [profile_tokens(profiles[key]) for key in train_instances]
    )
    if k == 1:
        return Gate(
            1,
            profile_vectorizer,
            None,
            None,
            train_instances,
            np.zeros(len(train_instances), dtype=int),
            [],
        )
    signatures, signature_keys = taste_signatures(
        train_instances,
        train_rows,
        profiles,
    )
    cluster = KMeans(
        n_clusters=k,
        n_init=50,
        random_state=RANDOM_SEED,
    ).fit(signatures)
    classifier = LogisticRegression(
        C=gate_c,
        max_iter=5000,
        class_weight='balanced',
        random_state=RANDOM_SEED,
    )
    classifier.fit(encoded_profiles, cluster.labels_)
    return Gate(
        k,
        profile_vectorizer,
        classifier,
        cluster,
        train_instances,
        cluster.labels_,
        signature_keys,
    )


def memberships_for(profiles, gate):
    return {
        key: gate.memberships(profile)
        for key, profile in profiles.items()
    }


def row_weights(rows, balance_events_and_ballots):
    if not balance_events_and_ballots:
        return np.ones(len(rows), dtype=float)
    ballot_sizes = collections.Counter(
        (row['event_id'], row['ranker_number'])
        for row in rows
    )
    ballots_per_event = collections.Counter(event_id for event_id, _ in ballot_sizes)
    event_count = len(ballots_per_event)
    raw = np.asarray([
        1.0 / (
            event_count
            * ballots_per_event[row['event_id']]
            * ballot_sizes[(row['event_id'], row['ranker_number'])]
        )
        for row in rows
    ])
    return raw * (len(rows) / raw.sum())


def fit_full(rows, profiles, k, alpha, gate_c, balance_events_and_ballots):
    train_instances = {
        profile_key(row['event_id'], row['ranker_number'])
        for row in rows
    }
    gate = fit_gate(train_instances, rows, profiles, k, gate_c)
    memberships = memberships_for(profiles, gate)
    vectorizer = DictVectorizer(sparse=True)
    encoded = vectorizer.fit_transform([
        pair_features(
            profiles[profile_key(row['event_id'], row['ranker_number'])],
            profiles[profile_key(row['event_id'], row['ranked_number'])],
            memberships[profile_key(row['event_id'], row['ranker_number'])],
        )
        for row in rows
    ])
    model = Ridge(alpha=alpha, solver='lsqr').fit(
        encoded,
        np.asarray([row['y'] for row in rows]),
        sample_weight=row_weights(rows, balance_events_and_ballots),
    )
    return {
        'gate': gate,
        'memberships': memberships,
        'vectorizer': vectorizer,
        'model': model,
    }


def raw_predictions(bundle, rows, profiles):
    encoded = bundle['vectorizer'].transform([
        pair_features(
            profiles[profile_key(row['event_id'], row['ranker_number'])],
            profiles[profile_key(row['event_id'], row['ranked_number'])],
            bundle['memberships'][profile_key(row['event_id'], row['ranker_number'])],
        )
        for row in rows
    ])
    return bundle['model'].predict(encoded)


def empirical_percentile(value, reference):
    ordered = np.sort(np.asarray(reference))
    return (np.searchsorted(ordered, value, side='right') - 0.5) / max(len(ordered), 1)


def build_calibration(rows, predictions, memberships, k):
    calibration = {archetype: [] for archetype in range(k)}
    for row, prediction in zip(rows, predictions):
        key = profile_key(row['event_id'], row['ranker_number'])
        archetype = int(np.argmax(memberships[key]))
        calibration[archetype].append(float(prediction))
    return {
        archetype: sorted(values)
        for archetype, values in calibration.items()
    }


def calibrated_predictions(bundle, train_rows, rows, profiles):
    train_raw = raw_predictions(bundle, train_rows, profiles)
    calibration = build_calibration(
        train_rows,
        train_raw,
        bundle['memberships'],
        bundle['gate'].k,
    )
    predictions = []
    for row, value in zip(rows, raw_predictions(bundle, rows, profiles)):
        key = profile_key(row['event_id'], row['ranker_number'])
        archetype = int(np.argmax(bundle['memberships'][key]))
        reference = calibration.get(archetype) or list(train_raw)
        predictions.append(max(0.01, min(0.99, empirical_percentile(value, reference))))
    return np.asarray(predictions), calibration


def metrics(rows, predictions):
    by_ballot = collections.defaultdict(list)
    for row, prediction in zip(rows, predictions):
        by_ballot[(row['event_id'], row['ranker_number'])].append(
            (row, float(prediction))
        )

    pairwise = []
    spearman = []
    ndcg = []
    top3 = []
    for values in by_ballot.values():
        actual = np.asarray([value[0]['y'] for value in values])
        predicted = np.asarray([value[1] for value in values])
        wins = 0.0
        comparisons = 0
        for left in range(len(values)):
            for right in range(left + 1, len(values)):
                if actual[left] == actual[right]:
                    continue
                comparisons += 1
                if np.sign(actual[left] - actual[right]) == np.sign(
                    predicted[left] - predicted[right]
                ):
                    wins += 1
                elif predicted[left] == predicted[right]:
                    wins += 0.5
        pairwise.append(wins / comparisons if comparisons else 0.5)
        correlation = spearmanr(actual, predicted).statistic
        spearman.append(0.0 if not np.isfinite(correlation) else correlation)
        ndcg.append(float(ndcg_score([actual], [predicted], k=3)))
        labels = np.asarray(
            [value[0]['rank'] <= 3 for value in values],
            dtype=int,
        )
        if len(set(labels)) == 2:
            top3.append(float(roc_auc_score(labels, predicted)))

    directional = {
        (row['event_id'], row['ranker_number'], row['ranked_number']): (
            row,
            float(prediction),
        )
        for row, prediction in zip(rows, predictions)
    }
    pair_labels = []
    pair_scores = []
    seen = set()
    for (event_id, left, right), (row, prediction) in directional.items():
        pair = (event_id, *sorted((left, right)))
        reverse_key = (event_id, right, left)
        if pair in seen or reverse_key not in directional:
            continue
        seen.add(pair)
        reverse_row, reverse_prediction = directional[reverse_key]
        mutual = math.sqrt(max(prediction, 0.0) * max(reverse_prediction, 0.0))
        if row['rank'] <= 3 and reverse_row['rank'] <= 3:
            pair_labels.append(1)
            pair_scores.append(mutual)
        elif (
            row['rank'] > row['candidate_count'] / 2
            and reverse_row['rank'] > reverse_row['candidate_count'] / 2
        ):
            pair_labels.append(0)
            pair_scores.append(mutual)

    mutual_auc = (
        float(roc_auc_score(pair_labels, pair_scores))
        if len(set(pair_labels)) == 2
        else None
    )
    return {
        'ballots': len(by_ballot),
        'directions': len(rows),
        'pairwise': float(np.mean(pairwise)),
        'spearman': float(np.mean(spearman)),
        'ndcg3': float(np.mean(ndcg)),
        'top3_auc': float(np.mean(top3)) if top3 else None,
        'mutual_auc': mutual_auc,
        'mutual_labeled_pairs': len(pair_labels),
    }


def metric_subset(rows, predictions, predicate):
    indices = [index for index, row in enumerate(rows) if predicate(row)]
    return metrics(
        [rows[index] for index in indices],
        [predictions[index] for index in indices],
    )


def per_ballot_ndcg3(rows, predictions):
    grouped = collections.defaultdict(list)
    for row, prediction in zip(rows, predictions):
        grouped[(row['event_id'], row['ranker_number'])].append(
            (row['y'], float(prediction))
        )
    return {
        key: float(ndcg_score(
            [[value[0] for value in values]],
            [[value[1] for value in values]],
            k=3,
        ))
        for key, values in grouped.items()
    }


def cross_validate(
    rows,
    profiles,
    k,
    alpha,
    gate_c,
    balance_events_and_ballots,
    splits=6,
):
    stable_groups = np.asarray([row['ranker_number'] for row in rows])
    indices = np.arange(len(rows))
    raw_oof = np.zeros(len(rows))
    calibrated_oof = np.zeros(len(rows))
    split_count = min(splits, len(set(stable_groups)))
    folds = GroupKFold(
        n_splits=split_count,
        shuffle=True,
        random_state=RANDOM_SEED,
    )
    for train_indices, test_indices in folds.split(indices, groups=stable_groups):
        test_people = {rows[index]['ranker_number'] for index in test_indices}
        train_indices = np.asarray([
            index
            for index in train_indices
            if rows[index]['ranked_number'] not in test_people
        ])
        train_rows = [rows[index] for index in train_indices]
        test_rows = [rows[index] for index in test_indices]
        bundle = fit_full(
            train_rows,
            profiles,
            k,
            alpha,
            gate_c,
            balance_events_and_ballots,
        )
        raw_oof[test_indices] = raw_predictions(bundle, test_rows, profiles)
        calibrated, _ = calibrated_predictions(
            bundle,
            train_rows,
            test_rows,
            profiles,
        )
        calibrated_oof[test_indices] = calibrated
    return {
        'raw': raw_oof,
        'calibrated': calibrated_oof,
        'metrics': metrics(rows, calibrated_oof),
    }


def sigmoid(value):
    if value >= 0:
        exponent = math.exp(-value)
        return 1 / (1 + exponent)
    exponent = math.exp(value)
    return exponent / (1 + exponent)


def dot(coefficients, features):
    return sum(
        float(coefficients.get(key, 0.0)) * float(value)
        for key, value in features.items()
    )


def incumbent_memberships(profile, config):
    features = profile_tokens(profile)
    classes = [int(value) for value in config['gate']['classes']]
    coefficient_rows = config['gate']['coefficients']
    intercepts = config['gate']['intercepts']
    count = len(config['archetypes'])
    if len(classes) == 1:
        return np.asarray([1.0])
    if len(classes) == 2 and len(coefficient_rows) == 1:
        positive = sigmoid(
            float(intercepts[0] or 0.0)
            + dot(coefficient_rows[0], features)
        )
        result = np.zeros(count)
        result[classes[0]] = 1 - positive
        result[classes[1]] = positive
        return result

    logits = [
        float(intercepts[index] or 0.0) + dot(coefficients, features)
        for index, coefficients in enumerate(coefficient_rows)
    ]
    maximum = max(logits)
    exponents = [math.exp(value - maximum) for value in logits]
    denominator = sum(exponents)
    result = np.zeros(count)
    for index, class_id in enumerate(classes):
        result[class_id] = exponents[index] / denominator
    return result


def incumbent_predictions(rows, profiles, config):
    memberships = {
        key: incumbent_memberships(profile, config)
        for key, profile in profiles.items()
    }
    output = []
    for row in rows:
        ranker = profile_key(row['event_id'], row['ranker_number'])
        target = profile_key(row['event_id'], row['ranked_number'])
        features = pair_features(
            profiles[ranker],
            profiles[target],
            memberships[ranker],
        )
        raw = float(config['score']['intercept']) + dot(
            config['score']['coefficients'],
            features,
        )
        archetype = int(np.argmax(memberships[ranker]))
        reference = config['calibration'].get(str(archetype), [])
        output.append(
            max(0.01, min(0.99, empirical_percentile(raw, reference)))
        )
    return np.asarray(output)


def reciprocal_pair_count(rows):
    directions = {
        (row['event_id'], row['ranker_number'], row['ranked_number'])
        for row in rows
    }
    return sum(
        1
        for event_id, left, right in directions
        if left < right and (event_id, right, left) in directions
    )


def profile_restoration_counts(data):
    counts = collections.Counter()
    for profile in data['profiles']:
        if profile.get('reconstructed_from_change_at'):
            counts[str(int(profile['event_id']))] += 1
    return dict(sorted(counts.items()))


def coefficient_map(bundle):
    return {
        name: round(float(value), 12)
        for name, value in zip(
            bundle['vectorizer'].get_feature_names_out(),
            bundle['model'].coef_,
        )
        if abs(float(value)) >= 1e-12
    }


def reproduction_diagnostics(rows, profiles, incumbent):
    event26 = [row for row in rows if row['event_id'] == 26]
    bundle = fit_full(event26, profiles, 2, 10, 0.1, False)
    generated = coefficient_map(bundle)
    existing = {
        key: float(value)
        for key, value in incumbent['score']['coefficients'].items()
    }
    keys = set(generated) | set(existing)
    maximum_delta = max(
        abs(float(generated.get(key, 0.0)) - float(existing.get(key, 0.0)))
        for key in keys
    )
    return {
        'directions': len(event26),
        'generatedFeatureCount': len(generated),
        'incumbentFeatureCount': len(existing),
        'maxScoreCoefficientDelta': maximum_delta,
        'interceptDelta': abs(
            float(bundle['model'].intercept_)
            - float(incumbent['score']['intercept'])
        ),
        'exactAtTwelveDecimals': maximum_delta <= 1e-12,
        'numericallyEquivalentAtEightDecimals': maximum_delta <= 1e-8,
    }


def temporal_holdout(train_rows, test_rows, profiles, balance):
    bundle = fit_full(train_rows, profiles, 2, 10, 0.1, balance)
    predictions, _ = calibrated_predictions(
        bundle,
        train_rows,
        test_rows,
        profiles,
    )
    return predictions, metrics(test_rows, predictions)


def participant_impact(rows, candidate_predictions, baseline_predictions):
    candidate = per_ballot_ndcg3(rows, candidate_predictions)
    baseline = per_ballot_ndcg3(rows, baseline_predictions)
    deltas = [
        candidate[key] - baseline[key]
        for key in candidate
        if key in baseline
    ]
    random = np.random.default_rng(RANDOM_SEED)
    bootstrap_means = np.asarray([
        float(np.mean(random.choice(deltas, size=len(deltas), replace=True)))
        for _ in range(5000)
    ])
    return {
        'ballotsCompared': len(deltas),
        'improved': sum(delta > 0 for delta in deltas),
        'improvedByAtLeastThreePoints': sum(delta >= 0.03 for delta in deltas),
        'declined': sum(delta < 0 for delta in deltas),
        'medianNdcg3Delta': float(np.median(deltas)),
        'meanNdcg3Delta': float(np.mean(deltas)),
        'meanNdcg3Delta95Ci': [
            float(np.quantile(bootstrap_means, 0.025)),
            float(np.quantile(bootstrap_means, 0.975)),
        ],
    }


def variant_report(data, profiles, incumbent, include_auto_saved):
    event_ids = [int(value) for value in data['event_ids']]
    rows = ranking_rows(data, event_ids, include_auto_saved)
    incumbent_scores = incumbent_predictions(rows, profiles, incumbent)
    combined = cross_validate(rows, profiles, 2, 10, 0.1, True)
    event26_rows = [row for row in rows if row['event_id'] == 26]
    event27_rows = [row for row in rows if row['event_id'] == 27]
    temporal_predictions, temporal_metrics = temporal_holdout(
        event26_rows,
        event27_rows,
        profiles,
        False,
    )
    returning = {row['ranker_number'] for row in event26_rows}
    first_time_indices = [
        index
        for index, row in enumerate(event27_rows)
        if row['ranker_number'] not in returning
    ]
    returning_indices = [
        index
        for index, row in enumerate(event27_rows)
        if row['ranker_number'] in returning
    ]

    event27_oof_indices = [
        index
        for index, row in enumerate(rows)
        if row['event_id'] == 27
    ]
    event27_oof_rows = [rows[index] for index in event27_oof_indices]
    event27_oof = combined['calibrated'][event27_oof_indices]
    event27_incumbent = incumbent_scores[event27_oof_indices]

    def indexed_metrics(source_rows, predictions, indices):
        return metrics(
            [source_rows[index] for index in indices],
            [predictions[index] for index in indices],
        )

    return {
        'includeAutoSaved': include_auto_saved,
        'uniqueRankers': len({row['ranker_number'] for row in rows}),
        'participantEventBallots': len({
            (row['event_id'], row['ranker_number'])
            for row in rows
        }),
        'directions': len(rows),
        'reciprocalPairs': reciprocal_pair_count(rows),
        'incumbentAllRows': metrics(rows, incumbent_scores),
        'incumbentEvent27': metrics(event27_oof_rows, event27_incumbent),
        'combinedGroupedCv': combined['metrics'],
        'combinedGroupedCvEvent26': metric_subset(
            rows,
            combined['calibrated'],
            lambda row: row['event_id'] == 26,
        ),
        'combinedGroupedCvEvent27': metrics(event27_oof_rows, event27_oof),
        'combinedGroupedCvEvent27FirstTime': indexed_metrics(
            event27_rows,
            event27_oof,
            first_time_indices,
        ),
        'combinedGroupedCvEvent27Returning': indexed_metrics(
            event27_rows,
            event27_oof,
            returning_indices,
        ),
        'event26To27TemporalHoldout': temporal_metrics,
        'event26To27FirstTime': indexed_metrics(
            event27_rows,
            temporal_predictions,
            first_time_indices,
        ),
        'event26To27Returning': indexed_metrics(
            event27_rows,
            temporal_predictions,
            returning_indices,
        ),
        'event27ImpactAgainstIncumbent': participant_impact(
            event27_oof_rows,
            event27_oof,
            event27_incumbent,
        ),
    }, rows, combined, incumbent_scores


def summarize_archetypes(gate, profiles):
    summaries = []
    all_token_sets = {
        key: set(profile_tokens(profiles[key]))
        for key in gate.train_instances
    }
    for archetype in range(gate.k):
        members = [
            key
            for key, label in zip(gate.train_instances, gate.clusters)
            if int(label) == archetype
        ]
        others = [
            key
            for key, label in zip(gate.train_instances, gate.clusters)
            if int(label) != archetype
        ]
        tokens = sorted(set().union(*all_token_sets.values()))
        token_scores = []
        for token in tokens:
            own = sum(token in all_token_sets[key] for key in members) / max(len(members), 1)
            other = sum(token in all_token_sets[key] for key in others) / max(len(others), 1)
            token_scores.append((own - other, own, token))
        token_scores.sort(reverse=True)
        taste = sorted(
            zip(
                gate.cluster_model.cluster_centers_[archetype],
                gate.signature_keys,
            ),
            reverse=True,
        )
        summaries.append({
            'archetype': archetype,
            'memberBallots': len(members),
            'uniqueMembers': len({key[1] for key in members}),
            'distinctiveProfileAnswers': [
                {
                    'feature': token,
                    'within': round(float(within), 8),
                    'lift': round(float(lift), 8),
                }
                for lift, within, token in token_scores[:10]
            ],
            'preferredTargetAnswers': [
                {
                    'question': key[0],
                    'answer': key[1],
                    'tasteLift': round(float(value), 8),
                }
                for value, key in taste[:10]
            ],
        })
    return summaries


def aligned_archetypes(bundle, profiles, incumbent):
    gate = bundle['gate']
    old_archetypes = incumbent['archetypes']
    if gate.k != 2 or len(old_archetypes) != 2:
        return [
            {'id': index, 'key': f'archetype_{index}', 'label': f'Archetype {index + 1}'}
            for index in range(gate.k)
        ]
    alignment = np.zeros((2, 2))
    for key, cluster in zip(gate.train_instances, gate.clusters):
        alignment[int(cluster)] += incumbent_memberships(profiles[key], incumbent)
    identity = alignment[0, 0] + alignment[1, 1]
    swapped = alignment[0, 1] + alignment[1, 0]
    mapping = [0, 1] if identity >= swapped else [1, 0]
    return [
        {
            'id': new_id,
            'key': old_archetypes[old_id]['key'],
            'label': old_archetypes[old_id]['label'],
            'alignedFromIncumbentId': old_id,
        }
        for new_id, old_id in enumerate(mapping)
    ]


def build_config(data, profiles, rows, report, incumbent, version):
    bundle = fit_full(rows, profiles, 2, 10, 0.1, True)
    coefficients = coefficient_map(bundle)
    training_predictions = raw_predictions(bundle, rows, profiles)
    calibration = build_calibration(
        rows,
        training_predictions,
        bundle['memberships'],
        bundle['gate'].k,
    )
    gate = bundle['gate']
    gate_features = gate.profile_vectorizer.get_feature_names_out()
    gate_config = {
        'classes': [int(value) for value in gate.classifier.classes_],
        'intercepts': [round(float(value), 12) for value in gate.classifier.intercept_],
        'coefficients': [
            {
                name: round(float(value), 12)
                for name, value in zip(gate_features, coefficient_row)
                if abs(float(value)) >= 1e-12
            }
            for coefficient_row in gate.classifier.coef_
        ],
    }

    influence = {}
    for question in QUESTIONS:
        global_value = sum(
            abs(value)
            for key, value in coefficients.items()
            if not key.startswith('archetype:') and (
                f':{question}:' in key
                or key == f'same:{question}'
                or key == f'distance:{question}'
            )
        )
        by_archetype = []
        for archetype in range(gate.k):
            prefix = f'archetype:{archetype}|'
            value = sum(
                abs(weight)
                for key, weight in coefficients.items()
                if key.startswith(prefix) and (
                    f':{question}:' in key
                    or key.endswith(f'same:{question}')
                    or key.endswith(f'distance:{question}')
                )
            )
            by_archetype.append(round(value, 8))
        influence[question] = {
            'global': round(global_value, 8),
            'archetypes': by_archetype,
        }

    canonical_data = {
        'event_ids': data['event_ids'],
        'profiles': sorted(
            data['profiles'],
            key=lambda profile: (
                int(profile['event_id']),
                int(profile['assigned_number']),
            ),
        ),
        'rankings': sorted(
            data['rankings'],
            key=lambda row: (
                int(row['event_id']),
                int(row['ranker_number']),
                int(row['rank']),
            ),
        ),
    }
    dataset_hash = hashlib.sha256(
        json.dumps(
            canonical_data,
            sort_keys=True,
            separators=(',', ':'),
            ensure_ascii=False,
        ).encode('utf-8')
    ).hexdigest()

    all_rows = ranking_rows(data, data['event_ids'], True)
    return {
        'version': version,
        'trainedEventIds': [int(value) for value in data['event_ids']],
        'calibrationLabel': 'events26-27-archetype-ranking-percentile',
        'training': {
            'participants': len({
                int(profile['assigned_number'])
                for profile in data['profiles']
            }),
            'uniqueParticipants': len({
                int(profile['assigned_number'])
                for profile in data['profiles']
            }),
            'trainingRankers': len({row['ranker_number'] for row in rows}),
            'participantEventProfiles': len(data['profiles']),
            'participantEventBallots': len({
                (row['event_id'], row['ranker_number'])
                for row in rows
            }),
            'directionalRankings': len(rows),
            'reciprocalPairs': reciprocal_pair_count(rows),
            'autoSavedDirectionsExcluded': len(all_rows) - len(rows),
            'profileRestorationCounts': profile_restoration_counts(data),
            'selected': {
                'k': 2,
                'alpha': 10,
                'gate_c': 0.1,
                **report['manual']['combinedGroupedCv'],
            },
            'validation': {
                'split': 'six-fold full-participant-purged GroupKFold',
                'seed': RANDOM_SEED,
                'heldOutPeopleRemovedAsRankersAndTargets': True,
                'eventBalanced': True,
                'ballotBalanced': True,
                'autoSavedExcluded': True,
                'incumbentEvent27': report['manual']['incumbentEvent27'],
                'event26To27TemporalHoldout': report['manual']['event26To27TemporalHoldout'],
                'combinedEvent26': report['manual']['combinedGroupedCvEvent26'],
                'combinedEvent27': report['manual']['combinedGroupedCvEvent27'],
                'event26OnlyGroupedCv': report['manual']['event26OnlyGroupedCv'],
                'event27FirstTime': report['manual']['combinedGroupedCvEvent27FirstTime'],
                'event27Returning': report['manual']['combinedGroupedCvEvent27Returning'],
                'participantImpact': report['manual']['event27ImpactAgainstIncumbent'],
                'withAutoSavedSensitivity': report['all']['combinedGroupedCv'],
                'event26Reproduction': report['event26Reproduction'],
            },
            'datasetSha256': dataset_hash,
            'environment': {
                'python': platform.python_version(),
                'numpy': np.__version__,
                'scipy': __import__('scipy').__version__,
                'scikitLearn': __import__('sklearn').__version__,
            },
        },
        'schema': {
            'questions': QUESTIONS,
            'archetypeQuestions': ARCHETYPE_QUESTIONS,
            'expertQuestions': sorted(EXPERT_QUESTIONS),
            'focusKey': 'match_current_focus',
        },
        'archetypes': aligned_archetypes(bundle, profiles, incumbent),
        'gate': gate_config,
        'score': {
            'intercept': round(float(bundle['model'].intercept_), 12),
            'coefficients': coefficients,
        },
        'calibration': {
            str(archetype): [round(value, 12) for value in values]
            for archetype, values in calibration.items()
        },
        'questionInfluence': influence,
        'archetypeEvidence': summarize_archetypes(gate, profiles),
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description='Train and validate the ranking-based personalized compatibility model.',
    )
    parser.add_argument('--data', type=pathlib.Path, default=DEFAULT_DATA_PATH)
    parser.add_argument(
        '--incumbent-config',
        type=pathlib.Path,
        help='Optional v12 artifact; defaults to the frozen 35550c4 Git artifact.',
    )
    parser.add_argument('--version', default=DEFAULT_VERSION)
    parser.add_argument(
        '--emit-config',
        action='store_true',
        help='Emit the selected manual-only combined artifact as JSON.',
    )
    parser.add_argument(
        '--output',
        type=pathlib.Path,
        help='Write generated JSON to this path instead of stdout.',
    )
    return parser.parse_args()


def load_incumbent(path):
    if path:
        return json.loads(path.read_text(encoding='utf-8'))
    result = subprocess.run(
        [
            'git',
            'show',
            f'{INCUMBENT_V12_GIT_REVISION}:{INCUMBENT_CONFIG_REPO_PATH}',
        ],
        check=True,
        capture_output=True,
        text=True,
        encoding='utf-8',
    )
    return json.loads(result.stdout)


def main():
    args = parse_args()
    data = json.loads(args.data.read_text(encoding='utf-8'))
    incumbent = load_incumbent(args.incumbent_config)
    profiles = {
        profile_key(profile['event_id'], profile['assigned_number']): profile
        for profile in data['profiles']
    }

    all_report, all_rows, _, _ = variant_report(
        data,
        profiles,
        incumbent,
        True,
    )
    manual_report, manual_rows, _, _ = variant_report(
        data,
        profiles,
        incumbent,
        False,
    )
    event26_manual = [row for row in manual_rows if row['event_id'] == 26]
    manual_report['event26OnlyGroupedCv'] = cross_validate(
        event26_manual,
        profiles,
        2,
        10,
        0.1,
        False,
    )['metrics']
    report = {
        'originalModel': {
            'trainedEvent': 26,
            'participants': 42,
            'directions': 492,
            'reciprocalPairs': 246,
            'k': 2,
            'alpha': 10,
            'gateC': 0.1,
            'seed': RANDOM_SEED,
        },
        'event26Reproduction': reproduction_diagnostics(
            all_rows,
            profiles,
            incumbent,
        ),
        'manual': manual_report,
        'all': all_report,
        'selection': (
            'Combined Events 26+27, auto-saved directions excluded, '
            'full-participant-purged six-fold CV, event/ballot-balanced fitting.'
        ),
    }

    if args.emit_config:
        config = build_config(
            data,
            profiles,
            manual_rows,
            report,
            incumbent,
            args.version,
        )
        serialized = json.dumps(config, indent=2, ensure_ascii=False) + '\n'
        if args.output:
            args.output.write_text(serialized, encoding='utf-8')
        else:
            print(serialized, end='')
        return

    serialized = json.dumps(report, indent=2, ensure_ascii=False) + '\n'
    if args.output:
        args.output.write_text(serialized, encoding='utf-8')
    else:
        print(serialized, end='')


if __name__ == '__main__':
    main()
