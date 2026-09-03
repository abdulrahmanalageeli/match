# Personalized compatibility v11

## What the score means

The score is a prediction of how highly two people would rank one another, conditioned on each person's inferred taste archetype. The runtime calculates both directional predictions and uses their geometric mean:

`mutual = sqrt(A→B × B→A)`

This makes a one-sided prediction visibly weaker than two strong directions. The percentage is calibrated against observed Event 26 ranking utilities within the chooser's archetype; it is not the sum of the legacy question bars.

## Training evidence

- Event 26: 42 participants, 492 completed directional rankings, 246 reciprocally exposed pairs.
- Every ranking is restricted to people the ranker actually met.
- Five profiles edited after the event are reconstructed from their earliest survey-change snapshots before training.
- Incomplete free-text feedback is excluded. Completed reciprocal rankings are the target.
- The two archetypes are learned from ranking-taste signatures, while a questionnaire-only soft gate assigns new participants to them.
- Gender, age, nationality, and their preferences are excluded from the personality score. They remain separate eligibility gates.

## Leakage-safe evaluation

Six-fold grouped cross-validation holds out entire rankers, so a person's own ranking rows cannot appear in both training and validation.

| Metric | Previous direct model | v11 personalized |
|---|---:|---:|
| Pairwise ordering | 0.465 | 0.612 |
| Mean Spearman | -0.103 | 0.311 |
| NDCG@3 | 0.479 | 0.683 |
| Top-3 AUC | 0.445 | 0.670 |
| Reciprocal high-vs-low AUC | 0.438 | 0.881 |

NDCG@3 improves for 30 of 42 Event 26 participants by at least three points; the median participant gain is 0.168.

## Runtime and cache contract

The current model version is `2026-09-03-v11-event26-archetype-personalized-100`. The trained artifact lives in `server/matching/personalized-model-config.json`; runtime scoring lives in `server/matching/personalized-compatibility.mjs`.

Changing the model version invalidates older cache rows. Batch and delta cache jobs progressively write exact v11 snapshots, and refreshes resume from already completed v11 rows. Manual pair test mode bypasses cache and calculates both directions immediately.

The old 100-point question components remain in snapshots and organizer views as diagnostics. They do not determine the final v11 percentage.

## Known limitation

Event 26 is a small training set. Archetypes reduce the damage of one global formula, but they cannot fully recover individual friendship or romantic history that is absent from questionnaire answers. The supplied User 7 examples are kept as an external use case rather than hard-coded exceptions; known misses should become future training evidence only after reciprocal outcomes are captured consistently.
