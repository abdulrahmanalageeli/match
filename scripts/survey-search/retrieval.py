"""Fixed, survey-only analogical preference-transfer model candidates.

Public interface:
    CONFIGS: JSON-serializable configurations, specified before evaluation.
    fit(config, train_rows, profiles, feedback_rows=None).predict(query_rows)

Rows have event_id, ranker_number, ranked_number, and (for training) y. Profiles
map (event_id, participant_number) to {"answers": {...}}. Scores are uncalibrated
and higher means preferred. No files, acquaintance labels, demographics outside
the survey, or held-out outcomes are read. IDs select profiles/ballots only; they
are never predictive features. Even a returning chooser is scored from surveys.

Retrieval transfers earlier choosers' within-ballot taste to a new chooser with
a similar survey. Local-ridge transfer first removes a survey-predicted global
target preference. Nystrom tensor kernels can learn preferences involving any
chooser question and any target question, rather than only matching answers
to the same question. Vocabulary, centering, kernel anchors, and regression fits
use only the supplied training endpoints. Unseen categories are ignored.

feedback_rows is accepted for the shared experiment interface but deliberately
unused: these candidates learn from the supplied ranking rows exclusively.
"""

from collections import defaultdict

import numpy as np
from scipy.linalg import cho_factor, cho_solve
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import Ridge
from sklearn.preprocessing import normalize


QUESTIONS = [
    "match_disagreement_style", "match_similarity_preference",
    "humor_banter_style", "early_openness_comfort",
    "conversation_initiative_preference", "expression_language",
    "minimum_partner_religious_commitment", "social_relationship_style",
    "attachment_1", "attachment_3", "attachment_4",
    *[f"lifestyle_{i}" for i in range(1, 6)],
    *[f"core_values_{i}" for i in range(1, 6)],
    *[f"communication_{i}" for i in range(1, 6)],
    "conversational_role", "conversation_depth_pref", "social_battery",
    "humor_subtype", "curiosity_style", "intent_goal", "silence_comfort",
    *[f"mbti_{i}" for i in range(1, 5)],
]
SOCIAL = {
    "match_disagreement_style", "match_similarity_preference",
    "humor_banter_style", "early_openness_comfort",
    "conversation_initiative_preference", "expression_language",
    "social_relationship_style", "attachment_1", "attachment_3", "attachment_4",
    "conversational_role", "conversation_depth_pref", "social_battery",
    "humor_subtype", "curiosity_style", "intent_goal", "silence_comfort",
    *[f"communication_{i}" for i in range(1, 6)],
}
ARABIC = {"أ": "A", "ا": "A", "ب": "B", "ج": "C", "د": "D"}

CONFIGS = [
    dict(name="taste_kernel_broad", family="survey_taste_retrieval", kind="retrieval", chooser_beta=2., target_beta=4., neighbors=0, global_mix=.25),
    dict(name="taste_kernel_local", family="survey_taste_retrieval", kind="retrieval", chooser_beta=8., target_beta=8., neighbors=8, global_mix=.25),
    dict(name="taste_kernel_specific_targets", family="survey_taste_retrieval", kind="retrieval", chooser_beta=4., target_beta=16., neighbors=12, global_mix=.25),
    dict(name="taste_kernel_social", family="survey_taste_retrieval", kind="retrieval", chooser_beta=8., target_beta=8., neighbors=12, global_mix=.4, chooser_view="social"),
    dict(name="survey_target_desirability", family="survey_taste_retrieval", kind="retrieval", chooser_beta=0., target_beta=8., neighbors=0, global_mix=1.),
    dict(name="taste_residual_ridge_broad", family="survey_local_ridge", kind="local_ridge", chooser_beta=2., neighbors=0, alpha=1., residual_scale=1., global_alpha=10.),
    dict(name="taste_residual_ridge_local", family="survey_local_ridge", kind="local_ridge", chooser_beta=8., neighbors=8, alpha=1., residual_scale=1., global_alpha=10.),
    dict(name="taste_residual_ridge_shrunk", family="survey_local_ridge", kind="local_ridge", chooser_beta=6., neighbors=12, alpha=3., residual_scale=.5, global_alpha=10.),
    dict(name="taste_residual_ridge_social", family="survey_local_ridge", kind="local_ridge", chooser_beta=8., neighbors=12, alpha=1., residual_scale=1., global_alpha=10., chooser_view="social"),
    dict(name="survey_tensor_kernel_linear", family="survey_tensor_kernel", kind="tensor", kernel="linear", alpha=1., anchors=128),
    dict(name="survey_tensor_kernel_smooth", family="survey_tensor_kernel", kind="tensor", kernel="rbf", beta=2., alpha=3., anchors=128),
    dict(name="survey_tensor_kernel_local", family="survey_tensor_kernel", kind="tensor", kernel="rbf", beta=6., alpha=3., anchors=128),
]


def _norm(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    value = str(value).strip().upper()
    if value in {"", "MISSING", "NULL", "NONE"}:
        return None
    return ARABIC.get(value, value)


def _tokens(profile, view="all"):
    answers = profile.get("answers", profile)
    result = {}
    for question in QUESTIONS:
        if view == "social" and question not in SOCIAL:
            continue
        value = _norm(answers.get(question))
        if value is not None:
            result[f"{question}={value}"] = 1.
    focus = answers.get("match_current_focus") or []
    if isinstance(focus, str):
        focus = focus.split(",")
    if isinstance(focus, (tuple, list, set)):
        values = {_norm(value) for value in focus} - {None}
        for value in values:
            result[f"focus={value}"] = 1. / np.sqrt(max(1, len(values)))
    # Keeps fully missing training folds well-defined without encoding missing
    # values as falsely shared answers. This token has no varying information.
    if not result:
        result["empty_survey"] = 1.
    return result


def _key(row, role):
    return int(row["event_id"]), int(row[role + "_number"])


def _weights(similarity, beta, neighbors):
    result = np.exp(np.clip(beta * (similarity - similarity.max(axis=1, keepdims=True)), -700, 0))
    if neighbors and neighbors < result.shape[1]:
        # Include all boundary ties, so pseudo-identifiers cannot break ties.
        threshold = np.partition(similarity, -neighbors, axis=1)[:, -neighbors]
        result *= similarity >= threshold[:, None] - 1e-12
    return result / np.maximum(result.sum(axis=1, keepdims=True), 1e-12)


class Model:
    def __init__(self, config, rows, profiles):
        if not rows:
            raise ValueError("A survey model requires at least one training row")
        self.config, self.profiles = dict(config), profiles
        self.keys = sorted({_key(r, role) for r in rows for role in ["ranker", "ranked"]})
        self.key_index = {key: index for index, key in enumerate(self.keys)}
        self.vectorizer = DictVectorizer(sparse=False)
        self.x = normalize(self.vectorizer.fit_transform([_tokens(profiles[k]) for k in self.keys]))
        if config.get("chooser_view") == "social":
            self.chooser_vectorizer = DictVectorizer(sparse=False)
            self.cx = normalize(self.chooser_vectorizer.fit_transform([_tokens(profiles[k], "social") for k in self.keys]))
        else:
            self.chooser_vectorizer, self.cx = self.vectorizer, self.x
        self.ai = np.asarray([self.key_index[_key(r, "ranker")] for r in rows])
        self.bi = np.asarray([self.key_index[_key(r, "ranked")] for r in rows])
        self.ballot_ids, ballot_indices = np.unique(self.ai, return_inverse=True)
        self.ballot_indices = ballot_indices
        self.ballot_counts = np.bincount(ballot_indices)
        self.y = np.asarray([float(r["y"]) for r in rows])
        # Center each ballot; relative preference, not generous rating style,
        # is what a new chooser should inherit from a similar prior chooser.
        means = np.bincount(ballot_indices, weights=self.y) / self.ballot_counts
        self.y = self.y - means[ballot_indices]
        self.row_weights = len(rows) / (len(self.ballot_ids) * self.ballot_counts[ballot_indices])
        if config["kind"] == "retrieval":
            self._fit_retrieval()
        elif config["kind"] == "local_ridge":
            self._fit_local_ridge()
        elif config["kind"] == "tensor":
            self._fit_tensor()
        else:
            raise ValueError("Unknown survey retrieval model kind")

    def _fit_retrieval(self):
        shape = (len(self.keys), len(self.ballot_ids))
        self.y_by_target_ballot, self.n_by_target_ballot = np.zeros(shape), np.zeros(shape)
        np.add.at(self.y_by_target_ballot, (self.bi, self.ballot_indices), self.y)
        np.add.at(self.n_by_target_ballot, (self.bi, self.ballot_indices), 1.)

    def _fit_local_ridge(self):
        cfg = self.config
        self.global_model = Ridge(alpha=cfg["global_alpha"], solver="cholesky")
        target_x = self.x[self.bi]
        self.global_model.fit(target_x, self.y, sample_weight=self.row_weights)
        residual = self.y - self.global_model.predict(target_x)
        self.local_coefficients = np.zeros((len(self.ballot_ids), self.x.shape[1]))
        for ballot_index in range(len(self.ballot_ids)):
            ids = np.flatnonzero(self.ballot_indices == ballot_index)
            xx = target_x[ids]
            # Center target surveys and residuals within a chooser. Solving in
            # ballot space keeps fits fast even with hundreds of survey tokens.
            xx = xx - xx.mean(axis=0)
            yy = residual[ids] - residual[ids].mean()
            gram = xx @ xx.T + cfg["alpha"] * np.eye(len(ids))
            self.local_coefficients[ballot_index] = xx.T @ cho_solve(cho_factor(gram), yy)

    def _kernel(self, a, b, anchor_a, anchor_b):
        sa, sb = np.clip(a @ anchor_a.T, 0., 1.), np.clip(b @ anchor_b.T, 0., 1.)
        if self.config["kernel"] == "linear":
            return sa * sb + .25 * sb
        beta = self.config["beta"]
        return np.exp(beta * (sa + sb - 2.)) + .25 * np.exp(beta * (sb - 1.))

    def _fit_tensor(self):
        cfg = self.config
        # Fixed seed and train-only anchors; no data-driven feature/rank choice.
        rng = np.random.default_rng(260923)
        anchor_ids = rng.choice(len(self.ai), size=min(cfg["anchors"], len(self.ai)), replace=False)
        self.anchor_a, self.anchor_b = self.cx[self.ai[anchor_ids]], self.x[self.bi[anchor_ids]]
        mm = self._kernel(self.anchor_a, self.anchor_b, self.anchor_a, self.anchor_b)
        values, vectors = np.linalg.eigh(mm)
        keep = values > 1e-8
        self.whitener = vectors[:, keep] / np.sqrt(values[keep])[None, :]
        encoded = self._kernel(self.cx[self.ai], self.x[self.bi], self.anchor_a, self.anchor_b) @ self.whitener
        self.regressor = Ridge(alpha=cfg["alpha"], fit_intercept=True, solver="cholesky")
        self.regressor.fit(encoded, self.y, sample_weight=self.row_weights)

    def predict(self, rows):
        if not rows:
            return np.empty(0, dtype=float)
        query_keys = sorted({_key(r, role) for r in rows for role in ["ranker", "ranked"]})
        key_index = {key: index for index, key in enumerate(query_keys)}
        x = normalize(self.vectorizer.transform([_tokens(self.profiles[k]) for k in query_keys]))
        if self.config.get("chooser_view") == "social":
            cx = normalize(self.chooser_vectorizer.transform([_tokens(self.profiles[k], "social") for k in query_keys]))
        else:
            cx = x
        ai = np.asarray([key_index[_key(r, "ranker")] for r in rows])
        bi = np.asarray([key_index[_key(r, "ranked")] for r in rows])
        cfg = self.config
        if cfg["kind"] == "tensor":
            encoded = self._kernel(cx[ai], x[bi], self.anchor_a, self.anchor_b) @ self.whitener
            return self.regressor.predict(encoded) + .5
        chooser_similarity = np.clip(cx @ self.cx[self.ballot_ids].T, 0., 1.)
        weight = _weights(chooser_similarity, cfg["chooser_beta"], cfg["neighbors"])
        if cfg["kind"] == "retrieval":
            target_similarity = np.clip(x @ self.x.T, 0., 1.)
            kernel = np.exp(cfg["target_beta"] * (target_similarity - 1.))
            taste = (kernel @ self.y_by_target_ballot) / np.maximum(kernel @ self.n_by_target_ballot, 1e-12)
            personalized = np.sum(weight[ai] * taste[bi], axis=1)
            global_taste = taste[bi].mean(axis=1)
            return .5 + (1. - cfg["global_mix"]) * personalized + cfg["global_mix"] * global_taste
        local_taste = x @ self.local_coefficients.T
        return .5 + self.global_model.predict(x[bi]) + cfg["residual_scale"] * np.sum(weight[ai] * local_taste[bi], axis=1)


def fit(config, train_rows, profiles, feedback_rows=None):
    """Fit from supplied training labels only; no automatic data/file access."""
    return Model(config, list(train_rows), profiles)


if __name__ == "__main__":
    # Synthetic smoke test only; an evaluation runner must select/evaluate real
    # models on honest event/participant splits outside this module.
    profiles = {(1, n): {"answers": {"social_battery": "AB"[n % 2], "humor_subtype": "ABC"[n % 3]}} for n in range(8)}
    profiles.update({(2, n): {"answers": {"social_battery": "AB"[n % 2], "humor_subtype": "ABC"[n % 3]}} for n in range(8, 12)})
    training = [dict(event_id=1, ranker_number=a, ranked_number=b, y=float(a % 2 == b % 2)) for a in range(8) for b in range(8) if a != b]
    testing = [dict(event_id=2, ranker_number=a, ranked_number=b) for a in range(8, 12) for b in range(8, 12) if a != b]
    for config in CONFIGS:
        fitted = fit(config, training, profiles)
        predicted = fitted.predict(testing)
        assert predicted.shape == (len(testing),) and np.isfinite(predicted).all()
        assert fitted.predict([]).shape == (0,)
    print(f"Synthetic smoke test passed for {len(CONFIGS)} configurations.")
