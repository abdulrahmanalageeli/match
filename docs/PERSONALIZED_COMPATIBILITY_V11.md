# Personalized compatibility v12

## What the score means

The score is a prediction of how highly two people would rank one another, conditioned on each person's inferred taste archetype. The runtime calculates both directional predictions and uses their geometric mean:

`mutual = sqrt(A→B × B→A)`

This makes a one-sided prediction visibly weaker than two strong directions. That archetype-relative percentile is the base—not a literal probability of liking someone. v12 then applies the leakage-tested AI semantic-chemistry correction:

`chemistry = 0.5 × current-curiosity fit + 0.5 × hobbies fit`

- Chemistry at least 0.75: `+12`
- Chemistry from 0.55 to below 0.75: `0`
- Chemistry below 0.55: `-8`

`final = clamp(archetype base + correction, 0, 100)`

Music and friend-description axes remain visible diagnostics but do not change the final percentage in v12.

## Training evidence

- Event 26: 42 participants, 492 completed directional rankings, 246 reciprocally exposed pairs.
- Every ranking is restricted to people the ranker actually met.
- Five profiles edited after the event are reconstructed from their earliest survey-change snapshots before training.
- Incomplete free-text feedback is excluded. Completed reciprocal rankings are the target.
- The two archetypes are learned from ranking-taste signatures, while a questionnaire-only soft gate assigns new participants to them.
- Gender, age, nationality, and their preferences are excluded from the personality score. They remain separate eligibility gates.

## Leakage-safe evaluation

Six-fold grouped cross-validation holds out entire rankers, so a person's own ranking rows cannot appear in both training and validation.

| Metric | Previous direct model | v11 personalized base |
|---|---:|---:|
| Pairwise ordering | 0.465 | 0.612 |
| Mean Spearman | -0.103 | 0.311 |
| NDCG@3 | 0.479 | 0.683 |
| Top-3 AUC | 0.445 | 0.670 |
| Reciprocal high-vs-low AUC | 0.438 | 0.881 |

NDCG@3 improves for 30 of 42 Event 26 participants by at least three points; the median participant gain is 0.168.

## Runtime and cache contract

The current model version is `2026-09-03-v12-event26-archetype-ai-chemistry-100`. The trained archetype artifact lives in `server/matching/personalized-model-config.json`; the final runtime formula lives in `server/matching/balanced-compatibility.mjs`.

Changing the model version invalidates older cache rows. Batch and delta cache jobs first write progressive base-score checkpoints, queue required AI work durably, and count a pair as complete only after the AI correction is present. A minute-level background worker processes 12 AI jobs at a time and advances cache metadata automatically once coverage is genuinely complete. Refreshes skip both completed rows and already-queued checkpoints. Manual pair test mode bypasses cache and calculates the full v12 score immediately.

The old 100-point question components remain in snapshots and organizer views as diagnostics. Organizer views show the authoritative `base + AI adjustment = final` calculation explicitly.

An old v11 score could reach 100 without AI because the base is a percentile inside each inferred archetype: reaching the calibrated top boundary in both directions yields `sqrt(100 × 100) = 100`. In v12, the final score is still capped at 100, so a high base plus a `+12` correction may also display 100; the stored breakdown preserves the uncapped explanation (for example, `90.9 + 12 → 100`).

## Known limitation

Event 26 is a small training set. Archetypes reduce the damage of one global formula, but they cannot fully recover individual friendship or romantic history that is absent from questionnaire answers. The supplied User 7 examples are kept as an external use case rather than hard-coded exceptions; known misses should become future training evidence only after reciprocal outcomes are captured consistently.
