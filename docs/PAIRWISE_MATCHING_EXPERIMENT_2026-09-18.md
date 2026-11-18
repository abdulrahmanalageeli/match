# Pairwise preference experiment — Events 26–28

Run date: 2026-09-18. Offline research; no production changes.

## Decision

**Do not replace the existing model with this redesign.** Simple pairwise training offers a small directional gain, but the intervals include no improvement and many participants decline. The complete factor/semantic/history model lowers primary mean-person AUC, and the User 7 full-fit regression is not fixed. Nested model selection and blending do not produce a reliable overall gain.

Simple pairwise mean-person AUC changes 0.6238→0.6379 on the primary test, 0.6518→0.6710 on manually submitted rankings, and 0.5525→0.5612 on the later-event test. The primary gain interval is −0.0123 to +0.0415; 55 people improve, 43 decline, eight tie. User 7 directional liked AUC falls 0.5450→0.4750 under the all-direction fit.

The full personalized model scores 0.6109 primary mean-person AUC and 0.5450 User 7 directional AUC. Removing all User 7 training interactions raises its User 7 diagnostic to 0.5950 versus the expanded baseline’s 0.4175, but the corresponding manual-only comparison is 0.5450 versus 0.5500. This is useful diagnostic evidence, not a universal improvement.

## Design

- Same exact data snapshot as the V12 expansion experiment: 106 unique people, 132 event ballots, 1,966 directions and 983 reciprocal exposed pairs.
- Six outer participant folds; held-out participants are removed as chooser and target across all events. Three inner folds select regularization and model family without outer labels.
- Four challenger families, each with regularization 0.003 or 0.03: pairwise linear; rank-four factor interactions; factors plus learned semantic evidence; those features plus a strongly shrunk personal history residual.
- Pairwise loss mixes 75% top-three-versus-rest ordering with 25% full ranking. Total training weight is equal per person, split across their event ballots.
- Selection criterion: 80% mean participant top-three AUC plus 20% worst-quarter mean AUC. A separately evaluated convex blend uses an inner-selected weight from 0, 0.25, 0.5, 0.75 or 1.
- Historical semantic coverage: 110/246 Event 26 pairs, 122/350 Event 27 pairs, 123/387 Event 28 pairs. Only exact-content-hash, non-fallback cached evidence is used. Missing values have an explicit indicator. No new AI generations or database writes.
- Learned mutual combiner: a regularized logistic model with nonnegative coefficients on the lower and higher directional predictions. It trains on inner held-out predictions. Both directions of each outer pair come from the same fold model.
- Mutual positive means both rank each other in their top three. “All pairs” includes every other reciprocal exposed pair as negative. “Extreme pairs” matches the prior high-vs-low proxy, excluding mixed and middle outcomes.
- These are ranking proxies, not observed romantic attraction or match-success probabilities. Auto-saved rankings are included in the controlled primary comparison and excluded in the separate sensitivity.

## Primary held-out results

| Model | Mean person AUC | Worst-quarter AUC | Mutual AUC, all pairs | Mutual AUC, extreme pairs |
|---|---:|---:|---:|---:|
| Expanded k=2, original scoring | 0.6238 | 0.3712 | 0.5830 | 0.6143 |
| expandedK2, learned mutual combiner | 0.6238 | 0.3712 | 0.3922 | 0.3857 |
| linear, learned mutual combiner | 0.6379 | 0.4242 | 0.3910 | 0.3850 |
| factor, learned mutual combiner | 0.6174 | 0.3649 | 0.3788 | 0.3720 |
| semantic, learned mutual combiner | 0.6163 | 0.3684 | 0.3895 | 0.3889 |
| personalized, learned mutual combiner | 0.6109 | 0.3587 | 0.3902 | 0.3893 |
| selected, learned mutual combiner | 0.6219 | 0.3824 | 0.3957 | 0.3902 |
| blend, learned mutual combiner | 0.6248 | 0.3827 | 0.3954 | 0.3898 |

The expandedK2 row with the learned combiner tests recalibration/combination changes on the existing model. Directional AUC is unchanged by its monotone calibration. The original two-fold reciprocal calculation reproduces the previous 0.6751 AUC; the same-model pair calculation above is a different, consistently applied evaluation.

The worst-quarter statistic takes each model’s lowest 27 participant AUCs; the membership of that quarter can change. It does not mean the same 27 people all improve.

The selected row evaluates inner model selection as a complete procedure. Individual family results are exploratory comparisons; selecting the best outer-table entry afterward would introduce selection optimism.

## Individual changes

| Model | Improve / decline / tie | Mean AUC change | 95% participant bootstrap interval |
|---|---:|---:|---:|
| linear | 55 / 43 / 8 | 0.0141 | -0.0123 to 0.0415 |
| factor | 54 / 51 / 1 | -0.0064 | -0.0442 to 0.0311 |
| semantic | 52 / 53 / 1 | -0.0075 | -0.0448 to 0.0293 |
| personalized | 50 / 55 / 1 | -0.0130 | -0.0503 to 0.0236 |
| selected | 15 / 14 / 77 | -0.0020 | -0.0146 to 0.0099 |
| blend | 13 / 12 / 81 | 0.0009 | -0.0095 to 0.0111 |

Intervals resample participants while holding predictions fixed; they do not refit the pipeline or correct for repeated experimentation. The mutual bootstrap resamples participant nodes and weights each pair by both endpoint multiplicities. Its estimates are in `mutual-bootstrap.json`.

## Robustness

| Model | Manual-only person AUC | Later Event 28 person AUC | Manual mutual AUC, all | Later mutual AUC, all |
|---|---:|---:|---:|---:|
| expandedK2 | 0.6518 | 0.5525 | 0.4379 | 0.6122 |
| linear | 0.6710 | 0.5612 | 0.4531 | 0.6055 |
| factor | 0.6376 | 0.5747 | 0.4441 | 0.5366 |
| semantic | 0.6449 | 0.5684 | 0.4589 | 0.5344 |
| personalized | 0.6305 | 0.5684 | 0.4569 | 0.5339 |
| selected | 0.6461 | 0.5612 | 0.4500 | 0.6055 |
| blend | 0.6507 | 0.5612 | 0.4514 | 0.6055 |

Temporal models train only on Events 26–27 and predict Event 28. This is a retrospective recipe holdout; the final all-event model has not received prospective validation. Returning and new attendee results are saved separately in the temporal report.

## User 7

The 30-person benchmark remains evaluation-only: 20 liked, 10 disliked. Directional AUC is the aligned metric because the labels only describe User 7’s preferences. The mutual columns are diagnostics, not validated reciprocal interest.

| Model | Full: directional liked AUC | Full: learned mutual liked AUC | Purged: directional liked AUC | Purged: learned mutual liked AUC |
|---|---:|---:|---:|---:|
| expandedK2 | 0.5450 | 0.5350 | 0.4175 | 0.4375 |
| linear | 0.4750 | 0.4700 | 0.4350 | 0.4500 |
| factor | 0.5350 | 0.5650 | 0.5900 | 0.5250 |
| semantic | 0.5450 | 0.5650 | 0.5950 | 0.5300 |
| personalized | 0.5450 | 0.5650 | 0.5950 | 0.5300 |
| selected | 0.4750 | 0.4700 | 0.4350 | 0.4500 |
| blend | 0.4550 | 0.4900 | 0.4350 | 0.4500 |

Original frozen V12 reference: directional liked AUC 0.6625; operational mutual-plus-fixed-AI liked AUC 0.7200. Expanded k=2 reference: directional 0.5450; operational final 0.6200.

Full fits include prior User 7 event rankings. Purged fits remove all 92 directions involving User 7. No benchmark categories enter training or parameter selection. Because this benchmark has been repeatedly inspected, it is development evidence rather than a fresh test. All 30 User 7 semantic scores have verified current-content coverage; this is higher than the historical training coverage.

The new learned scores replace the old fixed AI adjustment. Do not interpret their numeric values as calibrated real-world liking probabilities. Romantic-versus-disliked and friendly-versus-disliked AUCs are available in the detailed report; no romance-specific model was trained because the event labels do not establish romantic intent.

## Follow-up: bounded mutual ranking

The first logistic combiner shrank close to the training prevalence of mutual positives. Differences in fold intercepts dominated the pooled score ordering. A follow-up replaces it with an inner-selected geometric mean or a convex combination of min/max directional scores (five weights: 0, 0.25, 0.5, 0.75, 1). Directional models and their parameters stay unchanged. This is an exploratory follow-up prompted by the first result, not a new independent test.

| Model | Primary mutual AUC, all pairs | Manual-only mutual AUC, all pairs | Later-event mutual AUC, all pairs |
|---|---:|---:|---:|
| expandedK2 | 0.5373 | 0.5433 | 0.6171 |
| linear | 0.5388 | 0.6157 | 0.5975 |
| personalized | 0.5145 | 0.6002 | 0.5403 |
| selected | 0.4995 | 0.6191 | 0.5975 |
| blend | 0.5016 | 0.6186 | 0.5975 |

The simpler combiner removes the worst collapse but still gives no consistent replacement: the primary linear candidate is 0.5388 versus 0.5830 for the original expanded baseline scoring on the same pairs. Manual-only linear AUC improves to 0.6157 versus 0.5679 for the original baseline scoring. The favorable manual-only result does not persist across all checks.

## Manual-only User 7 sensitivity

Retrained all families with only explicitly submitted rankings, with separate inner selection. The purged fit excludes 83 manual incident directions involving User 7. These use the same 30 benchmark labels and profiles.

| Model | Full-fit directional liked AUC | User 7 purged directional liked AUC |
|---|---:|---:|
| expandedK2 | 0.6225 | 0.5500 |
| linear | 0.5600 | 0.5400 |
| factor | 0.5750 | 0.5400 |
| semantic | 0.5750 | 0.5450 |
| personalized | 0.5750 | 0.5450 |
| selected | 0.5600 | 0.5400 |
| blend | 0.5600 | 0.5400 |

The existing expanded recipe benefits from excluding auto-saved labels on this fixed benchmark (0.5450→0.6225). The proposed full model improves less (0.5450→0.5750), and simple pairwise reaches 0.5600. Original frozen V12 remains higher at 0.6625 directional AUC. This comparison does not establish that manual-only training improves every future participant.

## Artifacts and verification

- `scripts/test-pairwise-matching.py`: deterministic training and nested evaluation.
- `scripts/prepare-pairwise-semantics.mjs`: exact-content cache replay, read-only.
- `scripts/verify-pairwise-matching.py`: original baseline replay, independent saved-model inference and AUC checks, production file hashes.
- `scripts/stabilize-pairwise-mutual.py`: exploratory bounded-combiner checks and manual-only User 7 sensitivity.
- `tmp/pairwise-2026-09-18/`: complete protocol, folds, predictions, model artifacts, results and verification.
- Original 1,966 out-of-fold baseline predictions reproduce exactly. All 1,200 saved-model directional/reverse replay checks pass within 2.3e-15. All 17,525 bounded-mutual score checks pass. The 120 original User 7 baseline score checks pass exactly, with unchanged semantic evidence. Production source/config hashes are unchanged.
