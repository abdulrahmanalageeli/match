"""Bounded, survey-only candidate library for nested offline matching evaluation.

No outcomes, IDs, event numbers or benchmark labels enter predictive features.
All learned vocabulary and scaling use training directions only. Semantic axes
are fixed encodings of the actual questionnaire, not inferred clinical traits.
Run this file directly for a deterministic synthetic smoke/leakage test.
"""
import collections
import os

os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import numpy as np
from scipy import sparse
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

SEED = 260923
QUESTIONS = [
    'match_disagreement_style', 'match_similarity_preference',
    'humor_banter_style', 'early_openness_comfort',
    'conversation_initiative_preference', 'expression_language',
    'minimum_partner_religious_commitment', 'social_relationship_style',
    'attachment_1', 'attachment_3', 'attachment_4',
    *[f'lifestyle_{i}' for i in range(1, 6)],
    *[f'core_values_{i}' for i in range(1, 6)],
    *[f'communication_{i}' for i in range(1, 6)],
    'conversational_role', 'conversation_depth_pref', 'social_battery',
    'humor_subtype', 'curiosity_style', 'intent_goal', 'silence_comfort',
    *[f'mbti_{i}' for i in range(1, 5)],
]
ARABIC = {'أ': 'A', 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D'}
FOCUS = {'STUDY', 'CAREER', 'BUSINESS', 'FAMILY_SOCIAL', 'HEALTH_FITNESS',
         'CREATIVE', 'TRAVEL_EXPERIENCES', 'SELF_GROWTH', 'OTHER'}

# These positions are dictated by the wording of the questionnaire, not chosen
# from observed outcomes. Nonordinal questions retain their categorical values.
ORDINAL = {
    'early_openness_comfort': {'0': 0, '1': 1/3, '2': 2/3, '3': 1},
    'expression_language': {str(i): (i-1)/4 for i in range(1, 6)},
    'minimum_partner_religious_commitment': {str(i): (i-1)/3 for i in range(1, 5)},
    'social_relationship_style': {str(i): (i-1)/3 for i in range(1, 5)},
    'conversation_initiative_preference': {'A': 0, 'B': .5, 'C': 1, 'D': .25},
    'conversational_role': {'A': 1, 'B': .5, 'C': 0},
    'conversation_depth_pref': {'A': 1, 'B': 0},
    'social_battery': {'A': 1, 'B': 0},
    'silence_comfort': {'A': 0, 'B': 1},
    'lifestyle_1': {'A': 0, 'B': .5, 'C': 1},
    'lifestyle_2': {'A': 1, 'B': .5, 'C': 0},
    'lifestyle_3': {'A': 0, 'B': .5, 'C': 1},
    'lifestyle_4': {'A': 1, 'B': .5, 'C': 0},
    'lifestyle_5': {'A': 1, 'B': .5, 'C': 0},
    'core_values_1': {'A': 0, 'B': .5, 'C': 1},
    'core_values_2': {'A': 1, 'B': .5, 'C': 0},
    'core_values_3': {'A': 1, 'B': .5, 'C': 0},
    'core_values_4': {'A': 0, 'B': .5, 'C': 1},
    'core_values_5': {'A': 1, 'B': .5, 'C': 0},
}
CONFIGS = [
    {'name': f'nl_target_ridge_{a}', 'family': 'ridge', 'features': 'target', 'alpha': a}
    for a in [10, 100]
] + [
    {'name': f'nl_pair_ridge_{a}', 'family': 'ridge', 'features': 'pair', 'alpha': a}
    for a in [5, 50, 200]
] + [
    {'name': f'nl_semantic_ridge_{a}', 'family': 'ridge', 'features': 'semantic', 'alpha': a}
    for a in [10, 100]
] + [
    {'name': f'nl_cross_axis_ridge_{a}', 'family': 'ridge', 'features': 'cross', 'alpha': a}
    for a in [30, 300]
] + [
    {'name': f'nl_pair_logistic_{c}', 'family': 'pairwise', 'features': 'pair', 'c': c}
    for c in [.03, .3]
] + [
    {'name': f'nl_semantic_logistic_{c}', 'family': 'pairwise', 'features': 'cross', 'c': c}
    for c in [.03, .3]
] + [
    {'name': f'nl_extratrees_{d}', 'family': 'trees', 'features': 'pair', 'depth': d,
     'min_leaf': leaf} for d, leaf in [(4, 30), (7, 15)]
] + [
    {'name': f'nl_histboost_{leaves}', 'family': 'hist', 'features': 'semantic',
     'leaves': leaves, 'l2': l2} for leaves, l2 in [(3, 20), (7, 30)]
] + [
    {'name': 'nl_semantic_similarity', 'family': 'fixed', 'features': 'semantic'},
    {'name': 'nl_top3_pair_ridge', 'family': 'ridge', 'features': 'pair',
     'alpha': 100, 'objective': 'top3'},
    {'name': 'nl_top3_cross_ridge', 'family': 'ridge', 'features': 'cross',
     'alpha': 100, 'objective': 'top3'},
]


def normalized(value):
    if value is None:
        return 'MISSING'
    text = str(value).strip().upper()
    text = ARABIC.get(text, text)
    return text if text in {'A', 'B', 'C', 'D', '0', '1', '2', '3', '4', '5'} else 'MISSING'


def answers(profile):
    source = profile.get('answers', {})
    result = {q: normalized(source.get(q)) for q in QUESTIONS}
    if all(result[f'mbti_{i}'] == 'MISSING' for i in range(1, 5)):
        stored = str(profile.get('mbti_personality_type') or profile.get('mbti_type') or '').upper()
        if len(stored) == 4 and all(v in poles for v, poles in zip(stored, ['EI', 'SN', 'TF', 'JP'])):
            for i, (v, poles) in enumerate(zip(stored, ['EI', 'SN', 'TF', 'JP']), 1):
                result[f'mbti_{i}'] = 'A' if v == poles[0] else 'B'
    raw_focus = source.get('match_current_focus') or []
    if isinstance(raw_focus, str):
        raw_focus = raw_focus.split(',')
    result['focus'] = {str(v).strip().upper() for v in raw_focus} & FOCUS
    return result


def dimensions(a):
    result = {}
    for question, mapping in ORDINAL.items():
        value = mapping.get(a[question])
        result[question] = (0. if value is None else value-.5, float(value is not None))
    for block, count in [('attachment', [1, 3, 4]), ('communication', range(1, 6))]:
        observed = [a[f'{block}_{i}'] for i in count if a[f'{block}_{i}'] != 'MISSING']
        for option in 'ABCD':
            result[f'{block}_fraction_{option}'] = (
                sum(x == option for x in observed)/len(observed)-.25 if observed else 0.,
                float(bool(observed)),
            )
    return result


def feature_dict(source, target, representation):
    a, b = answers(source), answers(target)
    feat = {'bias': 1.}
    # Categorical targets also provide a survey-only general appeal baseline.
    for q in QUESTIONS:
        av, bv = a[q], b[q]
        feat[f'target|{q}|{bv}'] = 1.
        if representation != 'target':
            feat[f'source|{q}|{av}'] = 1.
            both = av != 'MISSING' and bv != 'MISSING'
            feat[f'same|{q}'] = float(both and av == bv)
            feat[f'known|{q}'] = float(both)
            if representation == 'pair':
                feat[f'pair|{q}|{av}>{bv}'] = 1.
    for value in b['focus']:
        feat['target_focus|'+value] = 1.
    if representation == 'target':
        return feat
    common, union = a['focus'] & b['focus'], a['focus'] | b['focus']
    feat['focus_jaccard'] = len(common)/len(union) if union else 0.
    feat['focus_both_known'] = float(bool(a['focus']) and bool(b['focus']))
    for value in common:
        feat['shared_focus|'+value] = 1.
    for value in a['focus']:
        feat['source_focus|'+value] = 1.
    ad, bd = dimensions(a), dimensions(b)
    for key in ad:
        av, ak = ad[key]
        bv, bk = bd[key]
        feat['axis_target|'+key] = bv
        feat['axis_source|'+key] = av
        feat['axis_difference|'+key] = abs(av-bv)*ak*bk
        feat['axis_product|'+key] = av*bv*ak*bk
        feat['axis_known|'+key] = ak*bk
    # Ex ante cross-question interactions let, e.g., a high contact need pair
    # with somebody who actually prefers frequent contact, without 16 boxes.
    if representation == 'cross':
        for ka, (av, ak) in ad.items():
            for kb, (bv, bk) in bd.items():
                feat[f'cross|{ka}>{kb}'] = av*bv*ak*bk
    if representation in {'semantic', 'cross', 'pair'}:
        groups = {
            'lifestyle': [q for q in QUESTIONS if q.startswith('lifestyle_')],
            'values': [q for q in QUESTIONS if q.startswith('core_values_')],
            'interaction': ['humor_banter_style', 'humor_subtype', 'conversation_depth_pref',
                            'social_battery', 'silence_comfort', 'curiosity_style'],
        }
        for name, qs in groups.items():
            observed = [q for q in qs if a[q] != 'MISSING' and b[q] != 'MISSING']
            similarity = sum(a[q] == b[q] for q in observed)/len(observed) if observed else 0.
            feat['group_similarity|'+name] = similarity
            for preference in 'ABCD':
                feat[f'preference_{preference}|{name}'] = similarity*float(a['match_similarity_preference'] == preference)
        # Conversation initiation can be complementary as well as similar.
        va, ak = ad['conversation_initiative_preference']
        vb, bk = bd['conversation_initiative_preference']
        feat['initiative_balance'] = (1-abs(va+vb))*ak*bk
        for q1, q2 in [('core_values_4', 'lifestyle_2'), ('lifestyle_3', 'lifestyle_2'),
                       ('conversation_depth_pref', 'early_openness_comfort')]:
            va, ak = ad[q1]
            vb, bk = bd[q2]
            feat[f'need_supply|{q1}>{q2}'] = (1-abs(va-vb))*ak*bk
    return feat


class FittedModel:
    def __init__(self, config, train_rows, profiles):
        self.config, self.profiles = dict(config), profiles
        if not train_rows:
            raise ValueError('At least one training direction is required')
        self.vectorizer = DictVectorizer(sparse=True)
        x = self.vectorizer.fit_transform([self._features(r) for r in train_rows])
        self.scaler = None
        family = config['family']
        if family in {'ridge', 'pairwise'}:
            self.scaler = StandardScaler(with_mean=False)
            x = self.scaler.fit_transform(x)
        y = np.asarray([r['y'] for r in train_rows], dtype=float)
        if config.get('objective') == 'top3':
            y = np.asarray([float(r['rank'] <= 3) for r in train_rows])
        # Equal total influence per ballot rather than per number of candidates.
        counts = collections.Counter((r['event_id'], r['ranker_number']) for r in train_rows)
        weights = np.asarray([1/counts[(r['event_id'], r['ranker_number'])] for r in train_rows])
        weights /= np.mean(weights)
        self.constant = None
        if family == 'ridge':
            self.model = Ridge(alpha=config['alpha'], solver='lsqr').fit(x, y, sample_weight=weights)
        elif family == 'pairwise':
            self._fit_pairwise(x, y, train_rows)
        elif family == 'trees':
            self.model = ExtraTreesRegressor(n_estimators=100, max_depth=config['depth'],
                min_samples_leaf=config['min_leaf'], max_features=.5, n_jobs=1,
                random_state=SEED).fit(x, y, sample_weight=weights)
        elif family == 'hist':
            self.model = HistGradientBoostingRegressor(max_iter=75, learning_rate=.05,
                max_leaf_nodes=config['leaves'], min_samples_leaf=25,
                l2_regularization=config['l2'], early_stopping=False, random_state=SEED)
            with threadpool_limits(limits=1):
                self.model.fit(x.toarray(), y, sample_weight=weights)
        elif family == 'fixed':
            self.model = None
        else:
            raise ValueError(f'Unknown family {family}')

    def _features(self, row):
        return feature_dict(self.profiles[(row['event_id'], row['ranker_number'])],
                            self.profiles[(row['event_id'], row['ranked_number'])],
                            self.config['features'])

    def _fit_pairwise(self, x, y, rows):
        ballots = collections.defaultdict(list)
        for i, r in enumerate(rows):
            ballots[(r['event_id'], r['ranker_number'])].append(i)
        better, worse, weights = [], [], []
        for indexes in ballots.values():
            local = [(i, j) if y[i] > y[j] else (j, i)
                     for n, i in enumerate(indexes) for j in indexes[n+1:] if y[i] != y[j]]
            # A bound avoids quadratic growth if reused for large events.
            if len(local) > 500:
                rng = np.random.default_rng(SEED)
                local = [local[i] for i in rng.choice(len(local), 500, replace=False)]
            for i, j in local:
                better.append(i)
                worse.append(j)
                weights.append(abs(y[i]-y[j])/max(len(local), 1))
        if not better:
            self.constant = float(np.mean(y))
            self.model = None
            return
        dx = x[better] - x[worse]
        pair_x = sparse.vstack([dx, -dx], format='csr')
        pair_y = np.r_[np.ones(len(better)), np.zeros(len(better))]
        pair_weights = np.tile(weights, 2)
        pair_weights /= pair_weights.mean()
        self.model = LogisticRegression(C=self.config['c'], fit_intercept=False,
            solver='liblinear', max_iter=300, random_state=SEED).fit(pair_x, pair_y, sample_weight=pair_weights)

    def predict(self, rows):
        if not rows:
            return np.zeros(0)
        if self.constant is not None:
            return np.full(len(rows), self.constant)
        if self.config['family'] == 'fixed':
            values = []
            for row in rows:
                f = self._features(row)
                qs = ['lifestyle', 'values', 'interaction']
                values.append(np.mean([f['group_similarity|'+q] for q in qs]
                                      + [f['focus_jaccard'], f['initiative_balance']]))
            return np.asarray(values)
        x = self.vectorizer.transform([self._features(r) for r in rows])
        if self.scaler is not None:
            x = self.scaler.transform(x)
        if self.config['family'] == 'hist':
            with threadpool_limits(limits=1):
                return self.model.predict(x.toarray())
        if self.config['family'] == 'pairwise':
            return self.model.decision_function(x)
        return self.model.predict(x)


def fit(config, train_rows, profiles, feedback_rows=None):
    """Fit one fixed candidate; optional feedback is intentionally unused here."""
    return FittedModel(config, train_rows, profiles)


def _selftest():
    import time
    started = time.perf_counter()
    rng = np.random.default_rng(SEED)
    profiles, rows = {}, []
    for event in [1, 2]:
        for person in range(16):
            a = {q: str(rng.choice(['A', 'B', 'C'])) for q in QUESTIONS}
            a.update({q: str(rng.choice(list(mapping))) for q, mapping in ORDINAL.items()})
            a['match_current_focus'] = ['career', 'creative'] if person % 2 else ['study']
            profiles[(event, person)] = {'answers': a}
        for person in range(16):
            candidates = [n for n in range(16) if n != person]
            candidates.sort(key=lambda n: -int(profiles[(event,n)]['answers']['social_battery'] == 'A'))
            rows.extend({'event_id': event, 'ranker_number': person, 'ranked_number': n,
                         'rank': i+1, 'candidate_count': 15, 'y': (14-i)/14}
                        for i,n in enumerate(candidates))
    train, test = [r for r in rows if r['event_id']==1], [r for r in rows if r['event_id']==2]
    for config in CONFIGS:
        model = fit(config, train, profiles)
        pred = model.predict(test)
        assert pred.shape == (len(test),) and np.isfinite(pred).all(), config['name']
        # Alter held-out profiles before refitting. Fitted vocabulary and
        # training predictions must remain identical (no test distribution fit).
        changed = dict(profiles)
        for key in profiles:
            if key[0] == 2:
                changed[key] = {'answers': {'expression_language': '5', 'mbti_1': 'B'}}
        changed[(99, 999)] = {'answers': {'never_seen_secret_feature': 'CANARY'}}
        second = fit(config, train, changed)
        assert np.allclose(model.predict(train), second.predict(train))
        assert model.vectorizer.feature_names_ == second.vectorizer.feature_names_
        assert not any('CANARY' in key or '999' in key for key in model.vectorizer.feature_names_)
        if config['family'] == 'pairwise':
            assert np.mean(model.predict(train)[np.array([r['rank']<=3 for r in train])]) > np.mean(model.predict(train)[np.array([r['rank']>10 for r in train])])
        print(config['name'], 'ok', flush=True)
    assert normalized('أ') == normalized('A')
    assert 'MISSING' in answers({'answers': {}}).values()
    # An arbitrary pseudonym/event renumbering cannot alter the model scores.
    mapping = {key: (key[0]+500, key[1]+2000) for key in profiles}
    remapped_profiles = {mapping[key]: profile for key, profile in profiles.items()}
    def renumber(rs):
        return [dict(r, event_id=r['event_id']+500, ranker_number=r['ranker_number']+2000,
                     ranked_number=r['ranked_number']+2000) for r in rs]
    config = CONFIGS[3]
    assert np.allclose(fit(config, train, profiles).predict(test),
                       fit(config, renumber(train), remapped_profiles).predict(renumber(test)))
    print(f'{len(CONFIGS)} candidates passed in {time.perf_counter()-started:.2f}s', flush=True)


if __name__ == '__main__':
    _selftest()
