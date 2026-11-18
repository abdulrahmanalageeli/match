"""Synthetic, local-only checks of the MBTI16 experiment.

No production data, credentials, DB, or network access is needed. Run with the
same pinned Python environment used by evaluate-mbti16.py.
"""
import contextlib
import importlib.util
import io
import itertools
import math
from pathlib import Path
import unittest
from unittest.mock import patch
import warnings

import numpy as np

SPEC = importlib.util.spec_from_file_location(
    'mbti16_experiment', Path(__file__).with_name('evaluate-mbti16.py'))
e = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(e)


def fixture():
    """Twelve synthetic people, three events, four choices per ballot."""
    profiles, rows = {}, []
    for event in [26, 27, 28]:
        for person in range(1, 13):
            profiles[event, person] = {
                'event_id': event, 'assigned_number': person,
                'mbti_personality_type': e.TYPES[person % 16],
                'answers': {
                    'social_battery': 'AB'[person % 2],
                    'humor_subtype': 'ABC'[person % 3],
                    'match_disagreement_style': 'AB'[person % 2],
                },
            }
        for person in range(1, 13):
            for rank in range(1, 5):
                target = (person + rank - 1) % 12 + 1
                rows.append({
                    'event_id': event, 'ranker_number': person,
                    'ranked_number': target, 'rank': rank,
                    'recorded_rank': rank, 'candidate_count': 4,
                    'auto_saved': False, 'y': (4 - rank) / 3,
                })
    return profiles, rows


def independent_ndcg(actual, predicted, k=3):
    """Expected DCG under random tie ordering, using linear relevance."""
    groups = {}
    for gain, score in zip(actual, predicted):
        groups.setdefault(score, []).append(gain)
    dcg, offset = 0., 0
    for score in sorted(groups, reverse=True):
        gains = groups[score]
        average = sum(gains) / len(gains)
        for position in range(offset, min(offset + len(gains), k)):
            dcg += average / math.log2(position + 2)
        offset += len(gains)
    ideal = sum(gain / math.log2(i + 2)
                for i, gain in enumerate(sorted(actual, reverse=True)[:k]))
    return dcg / ideal if ideal else 0.


class ExperimentChecks(unittest.TestCase):
    def test_all_16_binary_types_and_arabic_mapping(self):
        # These poles match the actual legacy questions in admin.tsx.
        observed = set()
        for bits in itertools.product([0, 1], repeat=4):
            expected = ''.join(poles[bit] for poles, bit
                               in zip(['EI', 'SN', 'TF', 'JP'], bits))
            for alphabet in [('A', 'B'), ('أ', 'ب'), ('ا', 'ب')]:
                profile = {'answers': {f'mbti_{i + 1}': alphabet[bit]
                                       for i, bit in enumerate(bits)}}
                self.assertEqual(e.mbti(profile), (expected, 'answers'))
            observed.add(expected)
        self.assertEqual(observed, set(e.TYPES))
        self.assertEqual(len(observed), 16)

    def test_invalid_or_partial_answers_do_not_fabricate_types(self):
        for value in [None, '', True, 1, 'C', 'ESTJ', 'unknown']:
            profile = {'answers': {f'mbti_{i}': value for i in range(1, 5)}}
            self.assertEqual(e.mbti(profile), (None, 'missing'))
        self.assertEqual(e.mbti({'answers': {'mbti_1': 'A'}}), (None, 'missing'))
        for value in ['ESTJ-A', 'XXXX', 'IEFT', 'EST', 'ESTJJ']:
            self.assertEqual(e.mbti({'mbti_type': value}), (None, 'missing'))
        self.assertEqual(e.mbti({'mbti_type': ' enfp '}), ('ENFP', 'stored_type'))
        self.assertEqual(e.mbti({'mbti_type': 'INFP', 'answers': {
            f'mbti_{i}': 'A' for i in range(1, 5)}}), ('ESTJ', 'answers'))

    def test_unknown_chooser_has_shared_features_without_type_expert(self):
        a, b = {'answers': {}}, {'mbti_type': 'ENFP', 'answers': {}}
        actual = e.features(a, b, 'mbti16_experts')
        self.assertEqual(actual, e.t.base_pair_features(a, b))
        self.assertFalse(any(key.startswith('archetype:') for key in actual))
        actual = e.features(a, b, 'mbti16_types_only')
        self.assertFalse(any(key.startswith('type_pair:') for key in actual))
        known = e.features(b, a, 'mbti16_experts')
        prefixes = {key.split('|')[0] for key in known if key.startswith('archetype:')}
        self.assertEqual(prefixes, {f'archetype:{e.TYPES.index("ENFP")}'})

    def test_all_unknown_training_supports_intercept_only_prediction(self):
        profiles, rows = fixture()
        profiles = {key: {'answers': {}} for key in profiles}
        train = [r for r in rows if r['event_id'] == 26]
        test = [r for r in rows if r['event_id'] == 27]
        model = e.Model(train, profiles, 'mbti16_types_only')
        scores = model.predict(test)
        self.assertEqual(len(scores), len(test))
        self.assertTrue(np.isfinite(scores).all())
        self.assertEqual(len(set(scores)), 1)

    def test_auc_and_ranking_metrics_against_independent_calculation(self):
        labels, scores = [True, True, False, False], [.9, .5, .5, .2]
        positives = [s for label, s in zip(labels, scores) if label]
        negatives = [s for label, s in zip(labels, scores) if not label]
        manual_auc = sum(1 if a > b else .5 if a == b else 0
                         for a in positives for b in negatives) / 4
        self.assertEqual(e.auc(labels, scores), manual_auc)
        self.assertIsNone(e.auc([True, True], [.2, .8]))
        _, rows = fixture()
        rows = rows[:4]
        actual = [r['y'] for r in rows]
        for predicted in [[1., .7, .3, 0.], [0., .3, .7, 1.], [.5] * 4,
                          [.8, .8, .8, .2]]:
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')
                result = e.metrics(rows, predicted)
            self.assertAlmostEqual(result['ndcg3'], independent_ndcg(actual, predicted))
            wins = [1 if predicted[i] > predicted[j] else .5
                    if predicted[i] == predicted[j] else 0
                    for i in range(4) for j in range(i + 1, 4)]
            self.assertAlmostEqual(result['pairwise'], sum(wins) / len(wins))
            self.assertNotIn('mutual_auc', result)

    def test_future_outcome_rows_do_not_enter_temporal_training(self):
        profiles, rows = fixture()
        calls = []

        class SpyModel:
            def __init__(self, train, profile_data, kind):
                self.train, self.kind = list(train), kind
            def predict(self, test):
                calls.append((self.kind, self.train, list(test)))
                return np.asarray([r['y'] * .8 + .1 for r in test])

        with patch.object(e, 'Model', SpyModel), patch.object(e, 'read', return_value={}), \
                patch.object(e.t, 'incumbent_predictions',
                             side_effect=lambda rs, *_: np.asarray([r['y'] * .8 + .1 for r in rs])), \
                contextlib.redirect_stdout(io.StringIO()):
            _, _, predictions = e.rolling(rows, profiles)
        self.assertEqual(len(calls), len(e.MODELS) * 2)
        for _, train, test in calls:
            event = test[0]['event_id']
            self.assertEqual({r['event_id'] for r in train}, {26} if event == 27 else {26, 27})
            self.assertTrue(all(r['event_id'] == event for r in test))
        self.assertEqual([(r['event_id'], r['ranker_number'], r['ranked_number']) for r in predictions],
                         [(r['event_id'], r['ranker_number'], r['ranked_number'])
                          for r in rows if r['event_id'] in [27, 28]])

    def test_strict_cv_purges_held_people_from_both_roles(self):
        profiles, rows = fixture()
        calls = []

        class SpyModel:
            def __init__(self, train, profile_data, kind):
                self.train = list(train)
            def predict(self, test):
                calls.append((self.train, list(test)))
                return np.asarray([r['y'] * .8 + .1 for r in test])

        with patch.object(e, 'Model', SpyModel), contextlib.redirect_stdout(io.StringIO()):
            report, predictions = e.strict_cv(rows, profiles)
        self.assertEqual(len(calls), 6 * len(e.MODELS))
        for train, test in calls:
            held = {r['ranker_number'] for r in test}
            self.assertTrue(train)
            self.assertTrue(all(r['ranker_number'] not in held
                                and r['ranked_number'] not in held for r in train))
        held_once = [person for fold in report['folds'] for person in fold['held_people']]
        self.assertEqual(sorted(held_once), list(range(1, 13)))
        self.assertEqual(len(predictions), len(rows))

    def test_future_profiles_do_not_change_fitted_training_predictions(self):
        profiles, rows = fixture()
        train = [r for r in rows if r['event_id'] == 26]
        present = {key: p for key, p in profiles.items() if key[0] == 26}
        future = dict(present)
        future[28, 99] = {'mbti_type': 'INFP', 'answers': {
            key: 'FUTURE_ONLY_CATEGORY' for key in e.t.QUESTIONS}}
        for name in e.MODELS:
            a, b = e.Model(train, present, name), e.Model(train, future, name)
            np.testing.assert_allclose(a.raw(train), b.raw(train), rtol=0, atol=1e-12)
            np.testing.assert_allclose(a.predict(train), b.predict(train), rtol=0, atol=1e-12)

    def test_user7_labels_never_enter_training_and_purging_is_incident_wide(self):
        profiles, rows = fixture()
        numbers = sorted({7, *(n for ns in e.LABELS.values() for n in ns)})
        source = [{'assigned_number': n, 'mbti_type': 'ENFP', 'answers': {}} for n in numbers]
        records = []

        class SpyModel:
            def __init__(self, train, profile_data, kind):
                records.append((kind, list(train)))
            def predict(self, directions):
                return np.asarray([.2 + (r['ranked_number'] % 10) / 20 for r in directions])

        def synthetic_read(path):
            if path == e.USER7:
                return source
            if path.name == 'user7-runtime-ai-report.json':
                return {'rows': [{'participantNumber': n, 'ai': {'adjustment': 0}}
                                 for n in numbers if n != 7]}
            return {}

        with patch.object(e, 'read', side_effect=synthetic_read), patch.object(e, 'Model', SpyModel), \
                patch.object(e.t, 'incumbent_predictions',
                             side_effect=lambda rs, *_: np.full(len(rs), .5)):
            result = e.user7(rows, profiles)
        self.assertEqual(result['coverage'], 30)
        self.assertEqual(len(records), len(e.MODELS) * 2)
        for _, train in records[:len(e.MODELS)]:
            self.assertEqual(train, rows)
        for _, train in records[len(e.MODELS):]:
            self.assertTrue(all(7 not in [r['ranker_number'], r['ranked_number']] for r in train))
        self.assertTrue(all('label' not in r for _, train in records for r in train))
        self.assertEqual(result['purged_directions'],
                         sum(7 in [r['ranker_number'], r['ranked_number']] for r in rows))


if __name__ == '__main__':
    unittest.main(verbosity=2)
