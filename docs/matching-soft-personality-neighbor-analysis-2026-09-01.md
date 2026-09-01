# Soft personality-neighbor matching analysis

Date: 2026-09-01  
Status: retrospective, read-only. Participant `#1778` was excluded. No production score, cache row, survey, or matching code was changed.

## Result

The useful model is **not 16 hard personality types** and it is not another global set of survey weights. It is a directional, context-specific, soft-neighbor model:

> After group round 1, predict how `A` will experience `C` in round 2 from how survey-similar reviewers reacted to `C` in round 1, after subtracting each reviewer's general positivity.

This directly tests the hypothesis that people with similar self-described interaction styles often react similarly to the same person. Event 25 selected the formula and hyperparameters; event 26 was then scored without retuning.

The usable head is positive **conversation experience** for different-gender pairs where the reviewer explicitly selected opposite-gender matching. This is not yet a romance probability. A same-gender conversation head is weaker but directionally promising. The any-gender/other-preference head failed and should be discarded.

## Strict round-1 to round-2 result

`great` or `good` group experience is the positive outcome. AUC measures ordering, not the meaning of the numeric score. Brier measures probability error and is the more important metric here.

| Directional context | Event-25 development | Event-26 holdout | Holdout AUC | New Brier | Frozen event-25 base Brier | Decision |
|---|---:|---:|---:|---:|---:|---|
| Different gender; reviewer explicitly prefers opposite gender | 55 (47/8) | 20 (16/4) | **0.773** | **0.131** | 0.176 | retain as prototype |
| Same gender | 75 (72/3) | 25 (17/8) | 0.643 | 0.226 | 0.262 | exploratory only |
| Different gender; other preference | 31 (24/7) | 8 (6/2) | 0.500 | 0.233 | **0.203** | discard |

For the main head, the strict `survey_data_updated_at <= outcome time` sensitivity leaves only 17 development rows and 14 holdout rows. The result remains similar: development AUC 0.788, event-26 AUC **0.758**, Brier **0.137** versus frozen-base Brier 0.188. This is small, but it shows the point estimate is not solely created by later profile updates.

Uncertainty is still wide because event 26 has only four negatives in the main 20-row holdout. Reviewer-cluster bootstrap AUC is approximately `[0.50, 1.00]`; target-cluster bootstrap is `[0.45, 1.00]`. This is enough to justify a shadow prototype, not a production replacement.

## Before versus after on identical rows

Exact-current v7 cache coverage exists for 18 of the main event-26 holdout rows. The current `0–100` score was calibrated on event 25 before probability comparison.

| Metric, same 18 rows | Current v7 | Soft-neighbor round-2 model |
|---|---:|---:|
| AUC / pair ordering | 0.402 | **0.777** |
| Calibrated Brier | 0.173 | **0.141** |
| Top-tercile positive rate | 66.7% | **100%** |
| Bottom-tercile positive rate | 83.3% | **66.7%** |

The current score is symmetric. The new estimate is directional:

| Direction | Current score | New positive-conversation probability | Round-2 feedback | Round-1 peer reviews |
|---|---:|---:|---|---:|
| `7 -> 567` | 77.63 | **96.7%** | positive | 1 |
| `567 -> 7` | 77.63 | **23.2%** | negative | 3 |
| `892 -> 975` | 84.10 | 78.6% | positive | 2 |
| `975 -> 892` | 84.10 | 97.5% | positive | 1 |
| `892 -> 1769` | 73.66 | 78.5% | positive | 1 |
| `1769 -> 892` | 73.66 | 92.6% | positive | 1 |

For the only three reciprocal pairs with both directions scoreable, multiplying the two directional probabilities separated the one not-both-positive pair (`7/567`, 22.4%) from the two both-positive pairs (`892/975`, 76.6%; `892/1769`, 72.7%). Three pairs are far too few to validate a mutual model, but this is the correct construction to test prospectively.

## Formula and “personality type” interpretation

For reviewer `A` and candidate `C`:

```text
prediction(A -> C)
  = shrunk round-1 positivity of A
  + sum over round-1 reviewers B of C:
      similarity(A,B)^8 * (feedback(B -> C) - shrunk positivity of B)
    / (sum of weights + 10)
```

The exponent and shrinkage were chosen on event 25, then frozen. This behaves like many overlapping personality neighborhoods: a reviewer can belong partly to many neighborhoods instead of being forced into one of 16 boxes.

Similarity uses 32 individual self/style questions with equal question influence and missing-aware comparison. It excludes demographics, eligibility, partner requirements, intent, names, and AI-written prose. Partner requirements are not compared to other partner requirements as though they were personal traits.

The personality weighting adds some ordering beyond simply averaging all prior reviewers:

| Context | Similarity-weighted AUC | Unweighted-peer AUC | Similarity-weighted Brier | Unweighted Brier |
|---|---:|---:|---:|---:|
| Main different-gender head | **0.773** | 0.688 | 0.131 | **0.130** |
| Same-gender head | **0.643** | 0.629 | **0.226** | 0.233 |

The AUC gain for the main head is useful, but the paired bootstrap is not decisive at this sample size. Treat personality similarity as a promising neighbor selector, not as proven immutable types.

## Individual-question pattern

Among reviewer pairs who reacted to the same target, overall personality similarity tracked agreement in both events for the main context:

| Event | Low-similarity agreement | Middle | High-similarity agreement | Correlation of similarity and agreement |
|---|---:|---:|---:|---:|
| 25 | 63.4% | 80.0% | 92.3% | 0.222 |
| 26 | 46.7% | 85.7% | 84.6% | 0.301 |

The most repeatable same-answer signals were:

- early-conversation openness level;
- curiosity style in a first meeting;
- value-boundary response to respectful religious/cultural disagreement (`core_values_3`);
- social battery after meeting new people;
- preferred contact frequency with a close friend (`lifestyle_2`);
- for same-gender conversations, behavior under stress in a disagreement (`communication_4`) also repeated.

A supervised event-25 question reweight was tested. It did **not** improve event-26 performance over equal question influence: main-head AUC/Brier changed from `0.800/0.107` to `0.786/0.114` in the non-temporal leave-one-review analysis. Therefore these questions are useful hypotheses, but fixed per-question production weights would currently overfit.

## Hard archetypes and user 7

Hard clustering is not supported. On event 25, only `K=2` met a basic size floor, with weak silhouette `0.110` and cluster sizes `32/10`; the small cluster was gender-skewed. MBTI is missing for half of each event, so 16-personality cells are not estimable.

User 7 maps to the large soft neighborhood. A frozen event-25 similarity threshold produced an exploratory event-26 same-gender conversation AUC of 0.786 for reviewers similar to user 7, but only 17 rows, five reviewers, and three negatives. The corresponding different-gender result was 0.420 on 26 rows. There is no defensible special “user-7 romance type” yet.

User-7 private labels were used only after all formulas were frozen. In the non-temporal post-group audit, the three covered romantic labels scored high (`#1470` 90.9%, `#1455` 86.8%, `#975` 97.7%), but romance-versus-female-friend ordering was only 0.556 on six people. Same-gender friendly-versus-disliked ordering was 0.700 on nine covered people versus 0.500 for current v7 on its eight exact-score rows. This is mildly useful for friendship-like conversation, not validation of romance.

## What this should be used for

1. Keep cold-start survey compatibility separate.
2. After round 1 closes, recompute a directional round-2 conversation score from only already-submitted feedback.
3. Run two heads: the retained main context and the exploratory same-gender context. Do not pool them.
4. Show peer count/confidence. One-peer predictions can be extreme and should not be displayed as high-confidence percentages.
5. Construct mutual likelihood only from two directional estimates; do not reuse a symmetric score.
6. Shadow-test it on the next event before it influences assignments.

The existing [history-confidence module](../server/matching/history-confidence.mjs) already contains related collaborative-neighbor logic for prior events. The validated prototype here differs by using only self/style questions, separating contexts, subtracting reviewer positivity, and exploiting round-1 feedback for round 2. Its current profile extractor also includes `match_*` requirements in reviewer similarity; that should be removed before a production experiment.

## What did not work

- Hard 16-like personality types.
- The different-gender/other-preference head.
- Using this group-conversation score as a submitted-ranking predictor: event-26 ordering stayed near chance.
- Using it as a later `wantConnect` predictor: main-context AUC was only 0.591.
- Treating opposite-gender conversation feedback as romance or same-gender feedback as friendship.

The useful outcome is narrower but real: **a directional, personality-neighbor estimate for the next group conversation, updated after round 1, beats the present symmetric score on event 26 and survives a strict timestamp sensitivity check.**
