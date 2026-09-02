# Algorithm-round compatibility calibration

Date: 2026-09-02  
Implemented model: `2026-09-02-v9-feedback-evidence-100`

## Scope

This calibration uses only classic Event 3 phase-3 feedback from events 21–26:

- primary outcome: directional `phase3_feedback.wantConnect`;
- secondary outcome: the same response's `compatibilityRate`;
- excluded: phase-2 choice matches, participant rankings, group reviews, choice-only event 27, known corrupt participant `#1778`, and participant `#7` during fitting/checking;
- no current production weights were treated as fixed.

The database identifies the phase-3 algorithm round, but old rows do not preserve whether operations replaced an algorithm pair with a ranking fallback or manual intervention. No ranking table was read. Future matches should persist `algorithm | ranking_fallback | manual` as immutable provenance.

There are 205 submitted directions in the broad event-21–26 inventory. The primary comparison uses only rows where both saved profile timestamps are no later than the feedback timestamp proxy: 27 directions in events 21–25 and 22 directions/14 pair clusters in event 26. Broad current-profile results are reported only as sensitivity checks because a participant may have edited a profile after an older event.

## What changed

The rejected v8 draft interpreted an invalid construction as evidence that three questions had no value. V9 fixes that mistake. Expression language, religious expectations, and social orientation remain explicit alignment dimensions with a combined 12-point budget:

| Alignment signal | Before | V9 | Interpretation |
|---|---:|---:|---|
| Expression language | 4 | 4 | ability to communicate naturally in the same language |
| Religious expectation | 4 | 5 | alignment in the importance/strictness of the expectation; not proof that either person satisfies the other's requirement |
| Social orientation | 4 | 3 | alignment in conservative/open relationship and gathering norms |

The event-25/26 interaction questions receive more influence where the later-event feedback supports them:

| Criterion | Before | V9 |
|---|---:|---:|
| Attachment scenario 1 | 2 | 4 |
| Lifestyle coordination 4 | 2 | 4 |
| Social battery | 2 | 4 |
| Humor subtype | 3 | 4 |
| Curiosity style | 4 | 8 |
| Silence comfort | 2 | 3 |

Redundant or less stable criteria were reduced to pay for that concentration: disagreement 5→4, similarity preference 2→1, humor/banter 6→4, early openness 4→3, initiative 6→4, attachment 4 3→2, lifestyle 3 3→2, lifestyle 5 2→1, communication 3 and 5 1→0.5, and conversation depth 3→2. The other weights remain unchanged. The total is exactly 100, including the 12-point semantic-vibe budget.

`core_values_3` remains excluded. It asks how tolerant the respondent is of an unspecified difference, but the survey does not record the corresponding religious/cultural trait required to know whether the pair actually differs. This is distinct from the religious-expectation question, which is retained as expectation-to-expectation alignment.

## A score that does not award fake compatibility for missing/neutral answers

The old display gave every neutral or missing fit half credit. An entirely unknown pair therefore scored 50, and many real pairs compressed into the mid/high 70s.

V9 preserves the weighted raw total for audit, but uses an evidence-above-neutral score for display and matching priority:

`evidence score = clamp((raw weighted total - 50) × 2, 0, 100)`

Neutral/missing-only evidence maps to 0, raw 75 maps to 50, and perfect evidence maps to 100. This transform is monotonic, so it cannot manufacture an AUC improvement; the ordering improvement below comes from the weights. Its purpose is to make score distances legible.

## Before/after results

| Evaluation | Previous v7 | V9 | Change |
|---|---:|---:|---:|
| Events 21–25 timestamp-valid AUC | 0.524 | 0.611 | +0.087 |
| Event 26 timestamp-valid AUC | 0.496 | 0.710 | **+0.214** |
| Event 26 rating correlation | 0.225 | 0.434 | **+0.209** |
| Event 26 mutual-pair AUC (8 complete pairs) | 0.600 | 0.867 | **+0.267** |
| Event 25 broad sensitivity AUC | 0.577 | 0.700 | +0.123 |
| Event 26 broad sensitivity AUC | 0.494 | 0.669 | **+0.175** |

On timestamp-valid event-26 directions, the old mean score was 76.96 for “connect” and 76.40 for “do not connect,” only a 0.55-point gap. V9 produces 54.83 versus 49.28, a 5.55-point gap. The separation is now ten times larger on the displayed scale rather than a cosmetic one-point change.

The event-26 pair-cluster bootstrap gives a V9 AUC interval of 0.463–0.905 and an AUC-change interval of 0.000–0.444. This is a materially positive retrospective result, but the sample is still small and is not a promise about future events.

## Concrete feedback check

- `#1817 × #1829`: both directions said connect (ratings 60 and 85). Previous score 82.99; V9 evidence score 65.79.
- `#287 × #1858`: available direction said do not connect with rating 0. Previous score 75.87; V9 evidence score 46.03.

The old scale separated those examples by 7.11 points; V9 separates them by 19.76 points. Lower absolute V9 numbers do not mean every pair became worse—the neutral baseline was removed.

A symmetric pair score still cannot explain asymmetric feedback. For example, `#52 × #1823` has one yes and one no and necessarily receives one shared algorithm score.

## Operational behavior

- V9 has a new model version; old cache rows become stale and are never relabeled.
- Language, religious-expectation, and social-orientation answers are restored to the cache identity.
- The cache schema rejects a V9 row unless `rawTotal`, the 50-point neutral baseline, `evidenceTotal`, and `total_compatibility_score` satisfy the same evidence-score formula.
- Standard match results plus every live/test Event 3 score slot enforce the same V9 evidence invariant; whole-number event percentages remain supported while the snapshot retains the exact evidence value.
- The database migration advances provenance guards without rewriting historical scores.
- Breakdown maxima, opposite-mode normalization, admin reason strings, and Event 3 survey lenses are synchronized with the new weights.
- `scripts/calibrate-algorithm-feedback.mjs` reproduces event-level AUC, rating correlation, pair-cluster uncertainty, and feedback examples from a privacy-minimized structured export.
- Event 27 is choice-only: V9 improves its survey compatibility evidence and group-lens normalization, but it deliberately does not override reciprocal participant rankings when selecting the final one-to-one choice match.
