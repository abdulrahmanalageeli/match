# Matching model rebuild: individual-question evidence report

Date: 2026-09-01  
Status: retrospective, read-only analysis; no production score, weights, cache rows, or participant records changed.

## Decision

**Insufficient evidence for any production reweight.**

The current production score does not beat chance reliably on event 26. A seemingly strong 40-input ridge model reached a retrospective event-26 directional AUC of 0.766, but the improvement collapsed to 0.550 after removing AI confidence/provenance fields and to 0.525 after also removing fields whose survey contract says they are profile-only. The same modeling family inverted for group experience and stayed at chance for submitted rankings. Coefficient directions also changed materially across events.

The apparent directional win is therefore a data-quality shortcut, not evidence for compatibility weights.

## Guardrails used

- All previous weight recommendations were treated as void.
- Participant `#1778` was excluded at extraction, cohort construction, training, validation, and audit.
- User `#7`'s supplied romantic/friendly/disliked lists were not used for feature construction, selection, tuning, model choice, or the decision above.
- Names, phone numbers, and raw free-text answers were not exported to the modeling dataset.
- Test-mode, auto-saved ranking, open-draft, stale-current-cache, internally conflicting aggregate-label, and invalid/ambiguous provenance rows were excluded. For the operational mutual target, two valid reciprocal directional answers were required; one-yes/one-no is a real non-mutual outcome, not a provenance conflict.
- No unordered pair crossed a train/validation boundary. Participant/reviewer overlap was purged where the graph permitted it; when it did not, the limitation is reported rather than hidden.
- Event 26 was locked before final scoring in this rebuild. It is a retrospective holdout, not a genuinely untouched historical holdout, because it had been examined previously and live cache values are current-state rather than immutable event-time features.
- Historical directional feedback lacks a precise feedback-submission timestamp. `event3_matches.updated_at` was the available outcome-time proxy. This is adequate for a sensitivity analysis, not for a production causal claim.
- Hyperparameter and feature selection used event 25 or earlier data only. Event-26 results were not used to retune.

## Data provenance and exclusions

For a cached score to count as exact-current, it had to satisfy all of:

```sql
score_model_version = '2026-08-25-v7-balanced-100'
AND participant_a_cached_at
      IS NOT DISTINCT FROM pa.survey_data_updated_at
AND participant_b_cached_at
      IS NOT DISTINCT FROM pb.survey_data_updated_at
AND score_breakdown IS NOT NULL
```

The latest row per unordered pair was used. A current-model row with either participant timestamp mismatch was classified as stale. For raw-answer modeling without a cache dependency, both participants needed a non-null `survey_data_updated_at` no later than the available outcome-time proxy; this approximates an event-time snapshot only when the answer was never subsequently edited. Rankings and group reviews have explicit submission timestamps; historical directional feedback does not.

### Cohort inventory

| Target | Clean source | Strict usable evidence | Important limitation |
|---|---:|---:|---|
| Directional `wantConnect` | 478 booleans, 370 yes / 108 no | 114 exact-current, 90 / 24; event 26 exact-current 44, 33 / 11 | Repeated participants; assigned-pair range restriction |
| Mutual `wantConnect` | 278 pair-phases | Pure both-yes vs both-no exact-current: 35, 33 / 2. Operational both-yes vs any reciprocal non-mutual used a larger raw cohort. | Pure event-26 exact subset is all positive; operational target includes valid asymmetric reciprocal outcomes |
| Submitted rankings | 2,553 explicit rows | 365 exact-current edges | Must evaluate within-ranker pairwise concordance, not rank rows as independent |
| Group experience | 575 reviews | 87 exact-current non-mixed pairs, 68 / 19 | Event 25 participant graph is connected; fully participant-disjoint inner CV is impossible |
| Friendship vs romance | none | none | No relationship-type ground truth exists; gender and `intent_goal` are not substitutes |

Excluded evidence included 180 auto-saved ranking rows, 41 mixed group pair-events, positive-only legacy `match_results.want` rows, and `match_feedback` ratings without a reliable partner key.

## Outcome-specific model comparison

AUC is train / grouped cross-validation / locked event-26 retrospective holdout. Holdout intervals use pair/reviewer-cluster bootstrap; ranking intervals use ranker-cluster bootstrap.

### Primary rebuild: raw answers only

These models use raw answer codes and explicit pair transforms. They do **not** use current production question totals, category totals, score breakdown totals, or user-supplied real-life labels.

For each individual question the train-only search tested equality, absolute answer distance, ordered respondent→partner answer pairs, unordered complementary/nonlinear answer-pair matrices, missingness, and gender/phase context interactions. Absolute distance was recorded as a diagnostic but made ineligible for train selection when the answer choices were nominal rather than ordered. Partner-requirement satisfaction was marked unidentifiable when the necessary counterpart self-trait was not collected.

#### Directional `wantConnect`

Raw timestamp-valid cohort: 93 training rows (73 yes / 20 no) and 45 locked event-26 rows (33 / 12), excluding `#7` and `#1778`. Participant-purged sensitivity used 88 training rows.

| Raw-answer model | Train | Nested/event CV | Event 26 | 95% CI |
|---|---:|---:|---:|---:|
| Current production score baseline | — | 0.555 | 0.484 | [0.322, 0.642] |
| Frozen nonnegative per-question hypothesis ensemble | — | 0.641 | 0.631 | [0.435, 0.811] |
| L2 self/partner one-hot + equality + valid ordinal interactions | 1.000 | 0.445 | 0.649 | [0.468, 0.831] |
| L2 ordered/unordered answer-pair matrices | 1.000 | 0.526 | 0.609 | [0.389, 0.820] |
| L1 ordered/unordered answer-pair matrices | 1.000 | 0.537 | 0.619 | [0.394, 0.826] |

The ensemble's event-macro CV folds were 0.547, 0.786, 0.417, 0.750, and 0.708 for events 20, 21, 22, 23, and 25. It is below chance in one training event, and its event-26 confidence interval includes chance. All three regularized global models fit training perfectly while producing weak nested CV, which is severe overfit rather than evidence for a deployable score.

Context coverage was phase 2: 46 train / 24 event 26 and phase 3: 47 / 21. Same-gender directional coverage was only 17 train rows (14 positive) and two event-26 rows (both positive), so same-gender and friendship/romance interactions are unidentifiable out of sample. Rankings and group reviews had better gender coverage, but the corresponding models still failed transfer or purged CV.

The least-bad individual point estimates on event 26 were `attachment_3` ordered+context (0.581), `lifestyle_4` equality (0.587), `conversation_depth_pref` ordered (0.587), and `curiosity_style` ordered (0.564). None independently clears the promotion gate. Several apparently good CV signals reversed: early-openness distance 0.631→0.422, `communication_2` unordered matrix 0.720→0.453, and `communication_4` unordered matrix 0.688→0.379.

#### Other raw-answer targets

| Target/model | Grouped/event CV | Event 26 | 95% CI | Result |
|---|---:|---:|---:|---|
| Operational mutual raw-answer ensemble | 0.507 | 0.617 | [0.247, 0.909] | 39 train / 16 holdout reciprocal pairs; asymmetric directions count as non-mutual; insufficient |
| Pairwise ranking ensemble | 0.572 | 0.483 | [0.438, 0.523] | chance |
| Group-experience ensemble | 0.411 | 0.557 | [0.443, 0.655] | unstable; interval crosses chance |

The mutual production baseline was 0.666 in training and 0.583 on event 26, with a [0.314, 0.825] holdout interval. No friendship-versus-romance raw model was fit because no such outcome label exists.

#### AI vibe-axis coverage

Only each axis's raw semantic score was tested; confidence, evidence quality, explanations, and confidence-shrunk aggregate scores were excluded. Pre-outcome coverage was **1/93** for every axis, so training CV and model selection are not estimable. Descriptive event-26 AUCs on 45 rows were: current curiosity 0.572, hobbies 0.616, music 0.621, and friend description 0.462. These are holdout-only descriptions, not selectable signals.

### Diagnostic pass over current normalized score inputs

The following pass is included to compare the production score and expose shortcuts. It is **not** the primary answer-level model requested above. Its 40 inputs were 32 current per-question normalized scores, four AI vibe scores, and four AI confidence/provenance values.

### Directional `wantConnect` — opposite-gender exact-current cohort

| Model | Train | CV | Event 26 | 95% CI |
|---|---:|---:|---:|---:|
| Current production score | 0.580 | 0.580 | 0.415 | [0.228, 0.617] |
| Train-selected single input: initiative | 0.887 | 0.367 | 0.342 | [0.183, 0.520] |
| Train-selected two inputs | 0.927 | 0.460 | 0.611 | [0.421, 0.801] |
| L1 logistic, 40 inputs | 0.500 | 0.540 | 0.500 | [0.500, 0.500] |
| L2 logistic, 40 inputs | 0.940 | 0.700 | 0.766 | [0.579, 0.915] |
| Shallow boosted stumps | 0.900 | 0.873 | 0.293 | [0.177, 0.407] |

The nonlinear model repeatedly chose an `initiative > 0.75` split in event 25 and then failed on event 26. That is a direct example of why same-event CV is not enough.

#### Construct/provenance ablation

| L2 inputs | Train | CV | Event 26 | 95% CI | Participant-disjoint event 26 |
|---|---:|---:|---:|---:|---:|
| All 40 | 0.940 | 0.700 | 0.732 | — | 0.756 |
| Remove four AI confidence fields | 0.940 | 0.700 | 0.550 | [0.333, 0.756] | 0.583 |
| Also remove profile-only language/religion/social fields | 0.940 | 0.687 | **0.525** | **[0.322, 0.727]** | **0.556** |

AI confidence describes evidence quality, not pair compatibility. It can proxy verbosity, language, survey completeness, cohort, and engagement, and it changes if the AI prompt/model changes. It is excluded from any defensible compatibility model.

### Mutual `wantConnect`

| Model | Train | CV | Event 26 | 95% CI |
|---|---:|---:|---:|---:|
| Current production score | 0.750 | 0.750 | 0.511 | [0.188, 0.833] |
| Single initiative input | 1.000 | 0.800 | 0.311 | [0.073, 0.604] |
| L1 logistic | 1.000 | 0.550 | 0.778 | [0.450, 1.000] |
| L2 logistic | 1.000 | 0.450 | 0.778 | [0.485, 1.000] |
| Shallow boosted stumps | 1.000 | 0.775 | 0.278 | [0.111, 0.438] |

Only nine training pairs and fourteen retrospective holdout pairs were available in the modeled cohort. The interval spans chance and the CV/holdout directions disagree.

### Group conversational experience

Positive means `good` or `great`; negative means `neutral` or `uncomfortable`.

| Model | Train | CV | Event 26 | 95% CI |
|---|---:|---:|---:|---:|
| Current production score | 0.508 | 0.508 | 0.398 | [0.224, 0.586] |
| Single attachment-1 input | 0.744 | 0.599 | 0.600 | [0.406, 0.772] |
| L1 logistic | 0.984 | 0.717 | **0.300** | [0.164, 0.458] |
| L2 logistic | 0.961 | 0.820 | **0.327** | [0.190, 0.480] |
| Shallow boosted stumps | 0.876 | 0.787 | 0.665 | [0.481, 0.821] |

The linear models inverted on the later event. The nonlinear result remains exploratory because its interval spans chance, event-25 participant-disjoint CV was impossible, and feature directions were unstable.

### Submitted rankings

| Model | Train | CV | Event-26 concordance | 95% CI |
|---|---:|---:|---:|---:|
| Current production score | 0.627 | 0.627 | 0.472 | [0.399, 0.554] |
| Single confidence-music input | 0.639 | 0.529 | 0.490 | [0.422, 0.551] |
| Pairwise L1 logistic | 0.892 | 0.547 | 0.500 | [0.407, 0.583] |
| Pairwise L2 logistic | 0.855 | 0.555 | 0.504 | [0.418, 0.592] |
| Pairwise boosted stumps | 0.566 | 0.515 | 0.387 | [0.306, 0.460] |

No ranking model reliably clears chance.

## Individual-question semantics found before modeling

The raw-question rebuild does not assume that every answer is a trait or that Arabic option order is an ordinal scale.

- `minimum_partner_religious_commitment` is a partner requirement. The survey does not collect the partner's self-religiosity, so directional requirement satisfaction is unidentifiable. Comparing two minimum requirements is not a substitute.
- `core_values_3` and `core_values_4` also express tolerance/support requirements without clean counterpart supply traits. Requirement-to-requirement similarity is at most a preference-alignment diagnostic.
- `match_similarity_preference` is a meta-preference. It must interact directionally with observed per-question pair similarity; it cannot be treated as a shared trait.
- `conversation_initiative_preference` and `curiosity_style` mix desired input and supplied behavior. Ordered respondent-to-partner answer combinations are required.
- The communication items describe individual conflict behavior. Their current matrix partly grades behavior quality; that component is not dyadic compatibility.
- `vibe_5` combines what a person supplies with what others must accommodate. A single symmetric AI score cannot identify those two directions.
- `expression_language`, `minimum_partner_religious_commitment`, and `social_relationship_style` are documented as profile-only but are currently scored.
- Missing/invalid answer pairs can currently become a neutral 0.5. Missingness must remain explicit and must not silently add compatibility evidence.

The complete per-question hypothesis results are recorded separately in `matching-individual-question-results-2026-09-01.csv`.

Identity/contact fields (`name`, `phone_number`) were classified as privacy/contact data and never tested as predictors. The full answer-hypothesis grid is in `matching-question-hypothesis-grid-2026-09-01.csv`.

### Implementation defects confirmed by the semantic audit

- Three fields documented as profile-only are nevertheless scored (`SurveyComponent.tsx:1152`; `balanced-compatibility.mjs:895-897`).
- Religious minimum requirements are compared with a symmetric requirement-to-requirement matrix (`balanced-compatibility.mjs:174-179,896`) even though counterpart self-religiosity is not collected.
- Invalid/missing categorical and ordinal values can resolve to neutral 0.5 (`balanced-compatibility.mjs:129-136,226-233`).
- JSON answers take precedence merely when non-empty, so an invalid/stale JSON value can block a valid typed-column fallback (`balanced-compatibility.mjs:105-113`).
- The stored `open_intent_goal_mismatch` exception is not applied by the live eligibility/scoring path.
- `humor_subtype` persistence permits `D`, while the survey/scorer domain is only A/B/C (`api/participant.mjs:1688-1691`; `balanced-compatibility.mjs:303-309`).

## Temporal coefficient stability

### Raw contract-clean models, events 20–25 only

All penalties were frozen before this check, participant overlap was purged for each held event, and event 26 was not read. Fold training sizes were 55–79 versus 316–397 individual features and 1,058–1,284 pair features.

| Held-event pair | Individual L2 cosine / sign | Pair L2 cosine / sign | Pair L1 cosine / sign |
|---|---:|---:|---:|
| 20–21 | 0.676 / 0.800 | 0.672 / 0.799 | 0.597 / 0.945 |
| 20–22 | 0.672 / 0.776 | 0.694 / 0.793 | 0.594 / 0.968 |
| 20–23 | 0.630 / 0.741 | 0.639 / 0.766 | 0.604 / 0.940 |
| 20–25 | 0.558 / 0.691 | 0.558 / 0.714 | 0.481 / 0.893 |
| 21–22 | 0.713 / 0.827 | 0.736 / 0.825 | 0.649 / 0.961 |
| 21–23 | 0.719 / 0.840 | 0.749 / 0.806 | 0.701 / 0.980 |
| 21–25 | 0.627 / 0.757 | 0.659 / 0.769 | 0.555 / 0.923 |
| 22–23 | 0.739 / 0.829 | 0.778 / 0.829 | 0.718 / 0.987 |
| 22–25 | 0.689 / 0.794 | 0.714 / 0.791 | 0.628 / 0.944 |
| 23–25 | 0.795 / 0.807 | 0.817 / 0.818 | 0.743 / 0.962 |

Mean cosine/sign agreement was 0.682/0.786 for individual L2 and 0.702/0.791 for pair L2. Pair L1 reached 0.627/0.950 only conditional on the 197–315 coefficients that were nonzero in both folds out of 930–1,196 common names; which sparse answer cells were selected remained unstable.

Nine exact/distance directions stayed positive in all five event folds under all three fixed models: closeness on early openness and lifestyle 1, plus equality on attachment 3, communication 1, curiosity style, early openness, humor subtype, lifestyle 4, and silence comfort. This is useful hypothesis evidence, but not a weight recommendation: the global models still perfectly fit training, had weak nested CV, and several corresponding single-question effects decayed or reversed on event 26.

### Normalized-score diagnostic, temporal comparison

| Target | Event-25 vs event-26 coefficient cosine | Active sign agreement | Interpretation |
|---|---:|---:|---|
| Directional connect | 0.224 | 64% | weak temporal alignment |
| Mutual connect | 0.297 | 71% | too few pairs to interpret |
| Group experience | -0.210 | 38% | reversed |
| Rankings | -0.110 | 57% | reversed/unstable |

Within-event folds looked more stable than the later-event comparison. The later-event comparison is the one relevant to production transfer.

## Locked event-26 eight-user audit

The audit cohort was selected before looking at prediction quality. Among 22 eligible people with boolean phase-2 and phase-3 feedback, choose:

```sql
ORDER BY md5('event26-both-phase-v1:' || participant_number)
LIMIT 8
```

| ID | P2 partner: frozen raw / label | P3 partner: frozen raw / label | Mean raw | P2/P3 mutual | Explicit/auto ranking rows | Group reviews +/− |
|---:|---|---|---:|---|---:|---:|
| 23 | 1823: 0.726 / Y | 1820: 0.771 / Y | 0.748 | yes/yes | 11/0 | 0/0 |
| 1103 | 1829: 0.730 / Y | 1464: 0.722 / Y | 0.726 | mixed/mixed | 13/0 | 7/4 |
| 1137 | 1820: 0.707 / Y | 1802: 0.771 / Y | 0.739 | yes/mixed | 12/0 | 12/0 |
| 1769 | 1372: 0.735 / Y | 1555: 0.784 / Y | 0.759 | mixed/yes | 11/0 | 3/3 |
| 1819 | 1555: 0.718 / Y | 1372: 0.706 / N | 0.712 | yes/mixed | 10/0 | 0/0 |
| 1829 | 1103: 0.698 / N | 1817: 0.738 / Y | 0.718 | mixed/yes | 12/0 | 10/2 |
| 1837 | 52: 0.726 / Y | 1843: 0.820 / Y | 0.773 | yes/yes | 0/12 | 10/2 |
| 1843 | 1536: 0.731 / Y (stale) | 1837: 0.824 / Y | 0.777 | yes/yes | 12/0 | 0/0 |

Aggregate directional labels are 14 yes / 2 no. Fifteen of these raw-answer joins are event-time exact and one is stale; the stale row is shown but excluded from performance calculations. The two negatives are too few to estimate an eight-user AUC with useful precision. The auto-saved ballot for `#1837` is excluded from ranking evaluation.

This sample is a frozen audit slice, not another tuning loop. Iterating on event-26 variables "until it makes sense" would tune to the holdout and invalidate it.

## One-time post-freeze user-7 qualitative audit

Only after every model and the insufficiency decision above were frozen, the supplied user-7 lists were read once as a qualitative audit. `#70` was excluded as ambiguous and `#1778` remained excluded. Four romantic and ten friendly IDs were treated as positive only for an overall liked-versus-disliked check; they were not pooled to train a model, and the friendship/romance distinction was not inferred.

- Frozen raw-answer score: coverage 18/18; AUC **0.607**. Positive mean/median 0.794/0.797 versus negative 0.784/0.784. Only 5 of 14 positives ranked above the highest negative.
- Current production score: exact-current coverage 15/18, but only two negatives were covered; subset AUC **0.846**. This is too fragile to validate the system or a reweight.

| Raw rank | ID | Audit label | Frozen raw | Current exact score |
|---:|---:|---|---:|---:|
| 1 | 1586 | romantic | 0.823 | 77.99 |
| 2 | 223 | friendly | 0.823 | 80.45 |
| 3 | 1414 | friendly | 0.815 | 75.33 |
| 4 | 287 | friendly | 0.814 | 78.87 |
| 5 | 1566 | romantic | 0.808 | 71.06 |
| 6 | 277 | disliked | 0.800 | 71.86 |
| 7 | 975 | romantic | 0.798 | 80.86 |
| 8 | 1381 | friendly | 0.798 | 78.24 |
| 9 | 1775 | friendly | 0.796 | 73.84 |
| 10 | 1524 | romantic | 0.793 | 77.70 |
| 11 | 1101 | disliked | 0.786 | 74.84 |
| 12 | 312 | disliked | 0.782 | unavailable |
| 13 | 1372 | friendly | 0.781 | 81.42 |
| 14 | 567 | friendly | 0.780 | 77.63 |
| 15 | 1853 | disliked | 0.768 | unavailable |
| 16 | 23 | friendly | 0.766 | unavailable |
| 17 | 122 | friendly | 0.765 | 76.99 |
| 18 | 1688 | friendly | 0.758 | 73.82 |

The audit does not rescue either model: the raw model barely separates liked from disliked people, and the production result rests on two covered negatives. It also cannot say which liked people are romantic versus friendly because no relationship-type target was trained.

## Why no production recommendation is allowed

The requested promotion gates are not met:

1. No contract-clean model beats the current baseline with a confidence interval excluding chance across all relevant outcomes.
2. Same-gender directional event-26 data has positives but no negatives, so the required segment gate cannot be evaluated.
3. Group and ranking results contradict the directional shortcut model.
4. Feature directions are not temporally stable.
5. Mutual data is too small.
6. No friendship-versus-romance target exists.
7. Assigned pairs are selected by an earlier matching system, creating range restriction and collider bias.
8. Current pair features are symmetric, so they cannot predict which member of a one-sided pair rejects.
9. Event 26 is not a genuinely untouched event-time holdout.

## Exact additional data required

Before another production decision, collect and freeze the following minimum design. The class-count targets are conservative: roughly 53 positive and 53 negative independent observations are needed for 80% power to distinguish AUC 0.65 from 0.50 at two-sided 5%; the targets below approximately double that allowance for reviewer/pair clustering and segment checks.

- At least **three future events** under the same survey/schema and outcome definitions: two development events and one untouched final event.
- Immutable, versioned event-time survey snapshots and feature hashes for every exposed candidate pair.
- Directional target: in the two development events combined, at least **100 positive and 100 negative decisions per explicit relationship context**; repeat **100/100 per context** in the untouched event. Collect context as friendship, romance, either, or neither.
- Mutual target: at least **100 mutual-positive and 100 reciprocal non-mutual pairs** in development, plus at least **60/60** in the untouched event. Report asymmetric and both-no negatives separately.
- Rankings: at least **50 independent reviewers and 1,000 explicit within-reviewer comparisons** in development, with at least **30 new reviewers and 500 comparisons** in the untouched event.
- Group target: at least **200 positive and 200 negative pair-reviews** across the two development events and **100/100** in the untouched event, with participant-disjoint validation possible.
- Randomized or deliberately exploratory pair exposure for a documented fraction of rounds, so the model sees more than pairs preselected by the old score.
- Separate questions for supplied behavior and desired partner behavior where the current survey conflates them; add self-religiosity only if religious requirement satisfaction is intended to be modeled.
- Explicit missingness and provenance fields; never feed AI confidence/evidence quality into compatibility.

The final event must be sealed before any outcome inspection, and its labels may be read exactly once after the model, feature schema, thresholds, segments, and bootstrap procedure are frozen.
