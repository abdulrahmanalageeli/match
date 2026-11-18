# Two versus four archetypes — Events 26–28

Date: 2026-09-17. Offline experiment; production was not changed.

## Decision

**Adding two archetypes does not benefit everyone, and the current evidence does not justify switching from two to four.** The stricter held-out test is mixed and nearly flat overall, the original V12-style evaluation worsens on all five metrics, and User 7 gets worse. Some participants improve, but others decline.

This compares the two-archetype **expanded Events 26–28 candidate** from the preceding experiment with a newly trained four-archetype candidate. It is not a comparison between four archetypes and the original Event-26-only V12 model, except where that older model is explicitly included in the User 7 table.

## Controlled comparison

- Identical snapshot: 106 unique participants, 132 event ballots, 1,966 directional rankings.
- Dataset hash, trainer hash, User 7 profile hash and OOF row order verified against the preceding run before reusing its two-archetype predictions.
- Only archetype count changes: k=2 → k=4. Features, target, seed 2609, KMeans n_init=50, logistic gate C=0.1, balanced class weights, Ridge alpha=10, unweighted fit, calibration and AI correction stay fixed.
- Identical six-fold splits grouped by stable participant number. Both original ranker-only validation and stricter removal of held-out people as rankers and targets were evaluated.
- The primary recipe includes auto-saved rankings, as V12 did. Both models were separately retrained and evaluated with those rows excluded as a sensitivity check.
- User 7 labels were used only for evaluation. No parameter selection was performed against them.

## Stricter held-out results

Higher is better for each metric. Event metrics evaluate the learned ranking base; User 7's final-score test below also includes the unchanged AI correction.

| Metric, all three events | Two archetypes | Four archetypes |
|---|---:|---:|
| Pairwise ranking accuracy | 0.5666 | 0.5699 |
| Mean Spearman | 0.1983 | 0.1999 |
| Top-three ranking quality, NDCG@3 | 0.6269 | 0.6232 |
| Top-three AUC | 0.6295 | 0.6308 |
| Reciprocal high-vs-low AUC | 0.6751 | 0.6755 |

Participant-level top-three quality: **44 improve, 47 decline, 15 remain unchanged**. Of these, 34 improve by at least 0.03 and 29 decline by at least 0.03. Unchanged means unchanged NDCG@3, not necessarily identical scores or complete rankings.

The participant-averaged NDCG@3 delta is +0.0059; its bootstrap 95% interval is **−0.0144 to +0.0281**, giving no clear improvement. The table averages event ballots; the participant analysis first averages each person's repeated event ballots, which explains the different sign of the small mean change. Bootstrap intervals resample fixed predictions, not the full training pipeline.

By event, strict NDCG@3 changes as follows:

| Event | Two | Four |
|---|---:|---:|
| 26 | 0.6749 | 0.6478 |
| 27 | 0.6040 | 0.6048 |
| 28 | 0.6050 | 0.6185 |

Events 27–28 pooled show small gains, including NDCG@3 0.6045→0.6118, but their participant-bootstrap interval also includes zero (−0.0167 to +0.0353). These gains do not establish a general benefit.

## Other checks

**Original V12-style validation:** all five aggregate metrics decline. Pairwise accuracy is 0.5911→0.5858; NDCG@3 is 0.6487→0.6339; reciprocal AUC is 0.7571→0.7426. Top-three quality improves for 36 people, declines for 47 and ties for 23.

**Time-ordered evaluation:** fit both models only on Events 26–27, then evaluate Event 28 without fitting its outcomes. NDCG@3 falls 0.5540→0.5487; reciprocal AUC falls 0.6054→0.5914. Seventeen people improve, nineteen decline, ten tie. The NDCG change interval is −0.0407 to +0.0304. This tests the recipes before Event 28; it is not prospective validation of the final all-three-event artifacts.

**Manual-only sensitivity:** strict NDCG@3 nudges up 0.6263→0.6297, while reciprocal AUC is effectively unchanged, 0.6175→0.6176. Twenty-eight of 86 people improve, 37 decline and 21 tie; the participant NDCG interval is −0.0163 to +0.0256. On just the newer events, reciprocal AUC falls 0.6119→0.6049. There is no consistent advantage across these checks.

The four learned clusters contain 33, 32, 40 and 27 event ballots. All four calibration groups are populated (572, 403, 478 and 513 directional samples). The model has 2,302 nonzero scoring features. Thus the result is not due to a missing calibration group or an unusable artifact, but the extra complexity has not demonstrated a reliable benefit.

## User 7

Same 30-person benchmark: seven romantic, thirteen friendly, ten disliked; IDs 70 and 1778 excluded. Identical fixed AI evidence from the preceding current-content-hash-verified run is applied to every model.

The percentages below are AUC expressed as positive-over-negative ordering rates; they are not probabilities that a match succeeds.

| Final score orders… | Original V12 | Expanded two-archetype | Expanded four-archetype |
|---|---:|---:|---:|
| Liked above disliked | 72.0% | 62.0% | 55.0% |
| Romantic above disliked | 95.7% | 78.6% | 72.9% |
| Friendly above disliked | 59.2% | 53.1% | 45.4% |
| Romantic above friendly | 80.2% | 71.4% | 70.3% |

The directional liked-vs-disliked diagnostic also declines, 0.5450→0.5175. These labels describe User 7's preferences, not the other person's reciprocal interest.

After removing all 92 training rows involving User 7 as ranker or target, final-score liked-vs-disliked ordering declines **46%→42%**. Romantic-vs-disliked declines 47.1%→45.7%. Some other distinctions improve slightly in this subject-excluded diagnostic, but it does not rescue liked-versus-disliked separation. The benchmark is small and selected, so it is diagnostic rather than a population guarantee.

## Verification and artifacts

- All **450** Python-versus-JavaScript runtime comparisons pass, with zero score difference. This covers directional, mutual-base and final scores for 30 pairs across five models.
- Training: `scripts/compare-v12-two-vs-four-archetypes.py`.
- Runtime check: `scripts/verify-v12-four-archetypes.mjs`.
- Four-archetype candidate: `tmp/archetypes-2-vs-4-2026-09-17/candidate-k4-config.json`.
- Detailed results, individual deltas and User 7 scores: `tmp/archetypes-2-vs-4-2026-09-17/report.json`.
- OOF predictions and the runtime verification result are saved in the same directory.
- Source and dataset hashes are preserved; temporary restored participant exports were deleted after verification.

**Recommendation: keep two archetypes for now.** Four adds complexity without a convincing overall gain and further worsens User 7. This experiment does not establish that four can never help; it shows that simply increasing the count under the current recipe is not a supported improvement on this dataset.
