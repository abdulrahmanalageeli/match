# Updated user-7 matching analysis

Date: 2026-09-01  
Status: retrospective, read-only; no production weights, cache rows, surveys, or database records changed.

## Decision

**Insufficient evidence for either shared weights or a deployable user-7 residual.**

The expanded disliked set changes the diagnosis materially. Exact-current v7 is near chance for all three user-7 targets. A nested leave-one-person-out survey model appears better for romance, but all seven romantic labels are women, and gender eligibility alone explains at least as much separation. General-affinity and friendship models invert out of sample. Frozen user-7 answer cells do not transfer from event 25 to event 26 with adequate support.

An offline user-7 romance hypothesis may be retained for prospective evaluation, but it is not a validated compatibility score and has no production formula.

## Ground truth and exclusions

- Romantic: `975, 1455, 1470, 1524, 1566, 1586, 1623`
- Friendly: `16, 23, 122, 223, 287, 325, 539, 567, 1372, 1381, 1414, 1688, 1775`
- Disliked: `101, 277, 312, 892, 1101, 1137, 1293, 1527, 1606, 1853`
- Excluded completely: `70, 1778`

`#101` is counted once as a user-7 dislike; the statement about other people's opinion was not converted into extra labels. `#312` is one observation. Amal is resolved as `#1455`; its exact-current v7 score is 85.00. Raham is `#1470`; its exact-current v7 score is 78.39.

Raw survey coverage is 30/30. Exact-current v7 score coverage is 25/30.

## User-7 validation

The exploratory model used 156 fixed, semantically filtered raw-survey columns and ridge shrinkage. Lambda selection occurred inside each outer leave-one-person-out fold. No unrestricted cross-question search was allowed because `p >> n`. Scores below are held-out decision values, not probabilities or percentages.

| Target | Train AUC | LOO AUC | Descriptive bootstrap 95% CI | Exact-current v7 AUC |
|---|---:|---:|---:|---:|
| General: romantic + friendly vs disliked | 1.000 | 0.420 | [0.215, 0.640] | 0.516 [0.238, 0.794] |
| Romance: romantic vs everyone else | 1.000 | 0.776 | [0.590, 0.925] | 0.548 [0.246, 0.833] |
| Romance: romantic vs friendly | 1.000 | 0.769 | [0.516, 0.978] | 0.558 |
| Friendship: friendly vs disliked | 1.000 | 0.415 | [0.185, 0.669] | 0.506 [0.208, 0.805] |

The bootstrap resamples fixed out-of-fold predictions; it does not refit the full nested pipeline and therefore omits model-selection uncertainty.

On the exact-score overlap only, survey/current AUC is 0.381/0.516 general, 0.714/0.548 romance, 0.727/0.558 romance-vs-friendly, and 0.461/0.506 friendship. The apparent romance delta is not independent of gender eligibility.

### Gender eligibility sensitivity

All seven romantic labels are women. Among the 23 non-romantic labels, seven are women and sixteen are men.

- Gender-only romance AUC: **0.848**
- Gender-only romantic-vs-friendly AUC: **0.769**
- Survey-only romantic-vs-friendly AUC: **0.769**
- Survey-only romance AUC among women: **0.694**, `n=14` (7/7), CI **[0.367, 0.980]**

Gender is an eligibility/context filter, not evidence that survey questions predict romantic chemistry. There is currently no demonstrated lift beyond that filter.

### Exact replay and event-26 transport stress test

The original 156-column encoder and ridge procedure were recovered from the analysis-session history and replayed against the current rows. The replay exactly reproduced the reported romance result: leave-one-person-out AUC **0.7763975**, 156 features, full-data lambda **10**, and outer-fold lambda selections of **1 in 19 folds** and **10 in 11 folds**. This confirms which exploratory model produced the earlier number; it still does not create a historically frozen coefficient artifact because the original feature matrix, hashes, and final coefficient vector were not saved.

The model is anchored to user 7: `s7(candidate) = f(answers_7, answers_candidate)`. It is not an arbitrary-pair compatibility function `f(A,B)`. The only literal cross-user application is therefore a transport stress test in which directional `A -> B` receives `s7(B)`: whether people who resemble user 7's preferred candidates are also preferred by other reviewers.

The primary event-26 cohort required explicit opposite-gender preferences on both sides, known different genders, Boolean feedback from both people, and exclusion of user 7, `#70`, `#1778`, and all 30 user-7 training labels. It contains only **5 reciprocal pair-phases**: 10 directions (**8 yes / 2 no**) and 5 mutual rows (**3 both-yes / 2 asymmetric; 0 both-no**).

| Retrospective transport metric | Result |
|---|---:|
| Reconstructed cross-fit ensemble, pooled directional AUC | **0.406** |
| Newly refit full-data model, pooled directional AUC | **0.344** |
| Target-gender-only pooled directional AUC | **0.813** |
| Cross-fit mean-score mutual proxy AUC | **0.167** |
| Full-model mean-score mutual proxy AUC | **0.167** |

The domain-aligned direction for user 7 is male reviewer to female candidate. All five such event-26 decisions were `yes`, so that primary AUC is **undefined**: there is no negative example against which to test ranking. The two pooled directional negatives are both reverse-direction female-to-male decisions, which the user-7 romantic model was not trained to represent. Pooling them reintroduces the gender shortcut and still leaves the personalized score below chance.

This test provides no evidence that the user-7 weights transfer to other people's romantic decisions or mutual compatibility. It also confirms that reciprocal feedback alone does not solve the target mismatch. A valid test of user-7 personalization requires new eligible candidates rated by user 7; a valid shared matcher requires a separately trained pair model.

For exact replay only, the recovered encoder preserves two known defects: it includes profile-only `expression_language` and `social_relationship_style`, and duplicates each nominal equality signal with its matching ordered-pair indicator. Any cleanup produces a newly named model and must be validated again.

### Category medians and pair ordering

| Head | Positive median | Negative median | Positive-over-negative pairs |
|---|---:|---:|---:|
| General | Romantic 0.602; friendly 0.607 | Disliked 0.680 | 0.420 |
| Romance | Romantic 0.522 | Friendly 0.256; disliked 0.206 | 0.776 |
| Friendship | Friendly 0.609 | Disliked 0.653 | 0.415 |

General and friendship fail in the wrong direction. For general affinity, a liked person beats `#1137` only 15% of the time and `#1527` only 20%. For friendship, a friendly person beats `#277` and `#1606` only 7.7% of the time.

### Per-person held-out audit

`—` means no exact-current production score or not applicable to the friendship head.

| ID | Label | v7 exact | General rank/value | Romance rank/value | Friendship rank/value |
|---:|:---:|---:|---:|---:|---:|
| 16 | F | 72.65 | 1 / 1.660 | 1 / 0.935 | 9 / 0.793 |
| 23 | F | — | 28 / 0.017 | 18 / 0.256 | 22 / -0.171 |
| 101 | D | 74.26 | 13 / 0.711 | 22 / 0.137 | 16 / 0.519 |
| 122 | F | 76.99 | 5 / 0.985 | 10 / 0.371 | 6 / 0.802 |
| 223 | F | 80.45 | 7 / 0.897 | 11 / 0.352 | 4 / 0.824 |
| 277 | D | 71.86 | 9 / 0.853 | 3 / 0.630 | 3 / 0.847 |
| 287 | F | 78.87 | 26 / 0.337 | 30 / -0.392 | 19 / 0.115 |
| 312 | D | — | 16 / 0.648 | 21 / 0.170 | 13 / 0.556 |
| 325 | F | — | 11 / 0.735 | 25 / 0.020 | 12 / 0.609 |
| 539 | F | 72.61 | 10 / 0.825 | 20 / 0.233 | 5 / 0.807 |
| 567 | F | 77.63 | 29 / -0.280 | 29 / -0.391 | 21 / -0.013 |
| 892 | D | 88.74 | 23 / 0.569 | 15 / 0.273 | 18 / 0.177 |
| 975 | R | 80.86 | 27 / 0.303 | 7 / 0.532 | — |
| 1101 | D | 74.84 | 12 / 0.720 | 28 / -0.238 | 11 / 0.750 |
| 1137 | D | 74.15 | 4 / 0.992 | 6 / 0.549 | 7 / 0.802 |
| 1293 | D | 74.21 | 17 / 0.609 | 12 / 0.344 | 17 / 0.445 |
| 1372 | F | 81.42 | 18 / 0.607 | 23 / 0.090 | 10 / 0.791 |
| 1381 | F | 78.24 | 25 / 0.397 | 17 / 0.259 | 20 / 0.110 |
| 1414 | F | 75.33 | 2 / 1.593 | 5 / 0.598 | 1 / 0.976 |
| 1455 | R | 85.00 | 21 / 0.582 | 4 / 0.608 | — |
| 1470 | R | 78.39 | 3 / 1.285 | 13 / 0.289 | — |
| 1524 | R | 77.70 | 19 / 0.602 | 14 / 0.280 | — |
| 1527 | D | 83.58 | 6 / 0.946 | 19 / 0.242 | 8 / 0.799 |
| 1566 | R | 71.06 | 8 / 0.886 | 2 / 0.890 | — |
| 1586 | R | 77.99 | 14 / 0.704 | 8 / 0.522 | — |
| 1606 | D | — | 15 / 0.649 | 27 / -0.109 | 2 / 0.928 |
| 1623 | R | 71.81 | 20 / 0.586 | 16 / 0.264 | — |
| 1688 | F | 73.82 | 22 / 0.574 | 9 / 0.391 | 15 / 0.549 |
| 1775 | F | 73.84 | 30 / -0.414 | 24 / 0.059 | 23 / -0.355 |
| 1853 | D | — | 24 / 0.538 | 26 / -0.088 | 14 / 0.551 |

The current v7 ranking also has severe errors: disliked `#892` scores 88.74 and `#1527` scores 83.58, above nearly everyone user 7 likes.

## Question support and hypotheses

All 44 inspected categorical questions vary in both event cohorts. Variation is not the bottleneck. Six fields have more than 20% missingness: `attachment_2`, `attachment_5`, and `mbti_1` through `mbti_4`; each is present for only eight independent-cohort participants per event.

Within user 7's 30 labels, rare cells are common. Several questions contain cells supported by one or two people, and current-focus answers form 21 distinct sets among 26 respondents. Therefore unrestricted pair matrices and learned cross-question mergers are not estimable.

The romance head's recurrent cells were frozen before the independent event check:

| Frozen user-7 cell | User-7 direction | Event 25 AUC/support | Purged event 26 AUC/support | Classification |
|---|---:|---:|---:|---|
| `attachment_3` A→B | positive | 0.607 / 3 | 0.556 / 6 | direction retained, far too sparse |
| `intent_goal` B→A | negative | 0.700 / 2 | 0.569 / 2 | far too sparse |
| `core_values_5` A=A | negative | 0.693 / 6 | 0.344 / 7 | reversed |
| `humor_subtype` A=A | positive | 0.479 / 7 | 0.400 / 1 | conflicting |
| `lifestyle_1` C=C | negative | 0.386 / 7 | 0.438 / 2 | conflicting |
| `lifestyle_5` A=A | negative | 0.464 / 1 | 0.475 / 5 | unsupported |
| `curiosity_style` A=A | negative | 0.500 / 0 | 0.469 / 3 | unsupported |
| Partner `social_battery=B` | negative | 0.386 / 7 | 0.388 / 15 | conflicting |

No cell qualifies as shared/global. Religion and support requirements were omitted because their necessary counterpart supply traits are not collected.

## Event 25 to event 26 validation

After excluding user 7, every user-7-labeled participant, `#70`, and `#1778`:

- Directional raw timestamp-valid: event 25 `n=19` (14/5); event 26 `n=25` (19/6), falling to `n=21` after participant-overlap purge.
- Current exact-v7 directional: event 25 `n=9`, AUC 0.700 [0.214, 1.000]; event 26 `n=22`, AUC 0.571 [0.278, 0.825].
- Operational mutual exact-v7: event 25 `n=4`; event 26 `n=9`. Not estimable.
- Rankings: exact-v7 concordance reverses from 0.680 on 25 comparisons to 0.402 on 92 comparisons.
- Group experience and mutual outcomes contain only 3–4 exact-current negatives per event; apparent point estimates are not reliable.
- No explicit friendship-versus-romance platform outcome exists.

The expanded exclusions leave too little event-25 development data for a defensible fresh global regularized model. Event 26 is retrospective rather than untouched.

## Semantic defects in the current score

- Profile-only language, religion requirement, and social-style fields are scored.
- Minimum partner religiosity is compared requirement-to-requirement even though partner self-religiosity is not collected.
- Missing or invalid answers silently receive 0.5 compatibility credit.
- JSON values override typed columns without validation.
- Friendship/romance context is absent from the scorer.
- Communication matrices mix individual behavioral quality with dyadic compatibility.

These are specification/data issues to correct before another weight search; the present data cannot determine replacement weights.

## Required next evidence

For user-7 romance, freeze the exploratory model and collect a genuinely prospective, romantically eligible holdout with at least 20 new women, including at least eight independently labeled romantic positives and twelve non-romantic comparisons. Do not refit until that holdout is scored. A larger 30/30 eligible-class sample is preferable for a stable AUC estimate.

For a shared platform model, collect at least two new development events plus one sealed final event with immutable event-time surveys. The final event should contain at least 100 positive and 100 negative directional decisions per explicit relationship context; other outcome-specific sample requirements remain separate.

Until then, do not ship new shared weights, mergers, nonlinear cells, or a user-7 residual.
