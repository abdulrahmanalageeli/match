# Personalized compatibility v13

## Outcome

The ranking-based base model is now trained on Events 26 and 27. The AI semantic-chemistry layer is unchanged.

The final training corpus contains:

- 74 unique participant profiles across 86 event attendances.
- 61 people with deliberate ranking ballots.
- 70 participant-event ballots.
- 967 directional ranking labels.
- 391 reciprocal exposed pairs.
- 225 timer-auto-saved directions excluded from the primary fit.

Event 28 has no completed outcome data yet and is not part of training.

## Recovered Event 26 recipe

The original v11 base, retained unchanged by v12, was trained on Event 26:

- 42 participants.
- 492 directional rankings and 246 reciprocal exposed pairs.
- Target: `(candidate_count - rank) / (candidate_count - 1)`.
- Ranking-taste signatures clustered with `KMeans(k=2, n_init=50, random_state=2609)`.
- Questionnaire-only soft gate with `LogisticRegression(C=0.1, class_weight="balanced", random_state=2609)`.
- Directional `Ridge(alpha=10, solver="lsqr")`.
- Raw utilities calibrated to an empirical percentile inside the chooser's primary archetype.
- Mutual base: `sqrt(A→B × B→A)`.

The recovered trainer regenerates all 1,348 Event 26 coefficient keys. The largest coefficient difference from the checked-in artifact is below `5e-10`, which is numerical solver drift only.

## v13 safeguards

The retrain preserves the original questionnaire features while correcting the hard-coded parts of the old temporary script:

- Source rows are scoped to the Event3 match UUID as well as event ID.
- Event-time survey answers are reconstructed per answer key from all later survey-change history.
- Seven Event 26 profiles and two Event 27 profiles are restored in the current export; the original run recorded five Event 26 restorations because two later edits had not happened yet.
- Gender, age, nationality, and eligibility preferences remain excluded from personality scoring.
- Auto-saved ranking directions are excluded from the primary fit and retained as a sensitivity analysis.
- Six-fold validation groups by stable participant number across both events.
- A held-out person is removed from training as both a ranker and a ranked target.
- Event and ballot weighting prevents Event 27's longer ballots from dominating.
- Archetype names are aligned to the incumbent gate so KMeans label swapping cannot silently rename them.
- Training is deterministic with seed 2609 and a recorded privacy-minimized dataset hash.

## Validation

The most relevant comparison is Event 27, because the incumbent Event 26 model had not been trained on it. These figures use the 36 deliberate Event 27 ballots and full-participant-purged out-of-fold predictions for the combined candidate.

| Metric | Incumbent v12 | Combined v13 candidate |
|---|---:|---:|
| Pairwise ordering | 0.534 | 0.576 |
| Mean Spearman | 0.101 | 0.219 |
| NDCG@3 | 0.641 | 0.659 |
| Top-3 AUC | 0.608 | 0.654 |
| Reciprocal high-vs-low AUC | 0.639 | 0.685 |

The candidate improves NDCG@3 for 23 of 36 deliberate Event 27 ballots, with a median delta of +0.0315. The mean delta is +0.0173; its participant-bootstrap 95% interval is -0.0468 to +0.0751, so the direction is encouraging but not conclusive at this sample size.

On deliberate Event 26 ballots, adding Event 27 improves pairwise ordering (0.565→0.584), Spearman (0.202→0.227), NDCG@3 (0.613→0.647), and top-3 AUC (0.629→0.677). Reciprocal AUC falls from 0.566 to 0.530 on only 54 labeled high/low pairs; this is the main regression to watch.

Including structurally complete auto-saved ballots as a sensitivity check does not reverse the overall result, but those rows remain excluded because they were not explicitly submitted and the production history-confidence logic also excludes them.

## Runtime

The base model predicts both directions and takes their geometric mean. It remains an archetype-relative ranking percentile, not a literal probability that two people will like each other.

The unchanged AI adjustment is:

- Chemistry at least 0.75: `+12`.
- Chemistry from 0.55 to below 0.75: `0`.
- Chemistry below 0.55: `-8`.

The prepared local code version is `2026-09-11-v13-events26-27-archetype-ai-chemistry-100`. Once deployed, the version change invalidates old cache rows; the additive v13 migration advances database provenance without rewriting historical results.

## Reproducibility

- Trainer: `scripts/train-personalized-compatibility.py`
- Frozen incumbent comparison: model artifact from commit `35550c4` (loaded by the trainer with `git show`).
- Privacy-minimized export query: `scripts/export-personalized-training.sql`
- Pinned ML packages: `scripts/personalized-compatibility-requirements.txt`
- Artifact: `server/matching/personalized-model-config.json`
- Runtime: `server/matching/personalized-compatibility.mjs`
- Activation migration: `supabase/migrations/20260911120000_activate_v13_events26_27_model.sql`

The raw export is deliberately not committed because it contains participant survey answers. Event 28 should be used as the next untouched, out-of-time validation set before treating the gains as settled.
