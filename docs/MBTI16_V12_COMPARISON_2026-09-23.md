# 16 MBTI archetypes versus V12 — 23 September 2026

**Decision: keep the existing approach. This test does not establish an improvement from replacing the learned archetypes with 16 fixed MBTI types.** The full-questionnaire MBTI variant is mixed and slightly worse overall on ranking; the type-only variant loses substantially more ranking information. Small differences are uncertain. User 7 remains better served by original V12 overall. No production code, model configuration, scores, or database records were changed.

## What was tested

Fresh database reads confirm Event 28 (16 September) is the latest ranked event. Event 26 occurred on 30 August, Event 27 on 6 September. The live persisted model marker is `2026-09-03-v12-event26-archetype-ai-chemistry-100`; the local working-tree configuration is V13. The frozen V12 artifact has the same live version identifier, but the database does not provide an artifact checksum.

The primary test fits Event 26 and predicts Event 27, then fits Events 26–27 and predicts Event 28. It compares identical training and test data across architectures. This isolates the 16-type change from the benefit of learning from more recent events. Frozen V12 is also shown as the original operational-version reference.

Three research models use the same fixed Ridge strength (10), questionnaire pair features where applicable, and seed (2609): the recovered V12 recipe with two learned taste archetypes; fixed 16 MBTI chooser groups with shared full-questionnaire features; and a simpler directed MBTI-type-pair preference model. The MBTI groups are assigned before learning historical preferences. Parameters were not selected using these results or User 7 labels. This tests these concrete implementations, not every possible MBTI model.

## Data and MBTI coverage

There are **106 unique people, 132 event attendances, 1,966 ranking entries, and 256 usable directed one-to-one responses**. Twelve explicit non-meetings were excluded. The temporal test contains 1,474 ranking entries from 90 ballots/80 people and 192 one-to-one responses; Event 26 supplies initial training.

| Event | People | Valid MBTI answers | Ranking entries | Usable one-to-one responses |
| --- | --- | --- | --- | --- |
| 26 | 42 | 22 | 492 | 64 |
| 27 | 44 | 28 | 700 | 111 |
| 28 | 46 | 19 | 774 | 81 |

Only **53/106 unique people** have valid MBTI answers, covering 14 of the 16 types. ISFJ and ENTJ have no event-training participants; observed types have only 1–9 unique people each. The survey removed its MBTI block in August. These types are derived from four binary answers, not a full MBTI assessment or continuous dimension scores.

The mapping is A/B → E/I, S/N, T/F, J/P. All four answers must be valid. Every known event type in this export came from complete answers; no current stored-type fallback was required. Missing types remain unknown: the questionnaire model uses shared features, while the type-only model can use global target-type popularity. Unknown choosers have a separate historical percentile reference, with global fallback if absent. No missing participant was invented into one of the 16 types.

## Rankings: later events predicted from earlier events

Higher is better. Pairwise accuracy means correctly ordering two people within a participant’s ballot. NDCG@3 measures top-three ordering quality; it is not the percentage of successful matches. AUC 0.5 means chance ordering.

| Model | Pairwise accuracy | Top-three NDCG | Top-three AUC | Spearman |
| --- | --- | --- | --- | --- |
| Two learned archetypes, same earlier data | 0.5283 | 0.5889 | 0.5692 | 0.0792 |
| 16 MBTI groups + full questionnaire | 0.5295 | 0.5781 | 0.5648 | 0.0874 |
| MBTI types only | 0.5253 | 0.5598 | 0.5515 | 0.0812 |
| Frozen original V12 | 0.5201 | 0.5492 | 0.5641 | 0.0556 |

The fair same-data two-archetype baseline reaches 0.5889 NDCG versus 0.5781 for the MBTI questionnaire model. Comparing MBTI only with frozen V12 (0.5492) would misleadingly attribute learning from Event 27 to having 16 archetypes.

| Sensitivity / cohort | Two archetypes NDCG | 16 + questionnaire NDCG | Types only NDCG |
| --- | --- | --- | --- |
| Event 27 | 0.6255 | 0.5880 | 0.5740 |
| Event 28 | 0.5540 | 0.5686 | 0.5461 |
| Only choosers with MBTI | 0.6068 | 0.5750 | 0.5497 |
| Explicitly submitted rankings only | 0.5963 | 0.5704 | 0.5751 |
| Strict unseen-person validation | 0.6269 | 0.6165 | 0.5683 |
| Strict unseen-person, manual only | 0.6263 | 0.6189 | 0.5619 |

The MBTI questionnaire model’s participant-averaged temporal NDCG change is −0.0143, with a paired 95% bootstrap interval of **−0.0445 to +0.0160**. It improves 37 people, worsens 37 and ties 6. The interval includes no difference. Among people with MBTI, the mean change is −0.0401 (interval −0.0870 to +0.0055), so missing types do not explain away the observed weakness.

Strict six-fold validation removes held-out participants as both chooser and target across all events. The type-only model’s participant-average NDCG drop is −0.0458 (interval −0.0819 to −0.0096). Repeating without auto-saved rankings also favors the two-archetype recipe. All bootstrap intervals hold predictions fixed; they do not refit training or correct repeated experimentation.

An additional raw-score diagnostic checks whether small MBTI calibration buckets introduce ranking ties. Raw temporal NDCG is 0.5875 / 0.5761 / 0.5649 for two archetypes / 16 + questionnaire / types only: the conclusion does not reverse. Type-only scores tie 30.8% of candidate comparisons even before calibration. All 4,422 calibrated temporal scores replay exactly. Complete metrics and tie counts are in `tmp/mbti16-2026-09-23/raw-temporal-report.json`.

## Actual one-to-one feedback

Models first learn earlier event rankings, then predict later directed feedback. The primary behavioral label is whether the participant wanted to connect again; compatibility ratings are a separate outcome. Several older feedback fields were constant placeholders and were not treated as useful labels.

| Model | Want-connect AUC | Compatibility-rating Spearman |
| --- | --- | --- |
| Two learned archetypes, same earlier data | 0.5180 | -0.0200 |
| 16 MBTI groups + full questionnaire | 0.5424 | 0.0277 |
| MBTI types only | 0.5207 | 0.0941 |
| Frozen original V12 | 0.4425 | -0.1129 |

The MBTI questionnaire model gains 0.0245 AUC over the equally retrained baseline, with a paired reviewer-bootstrap 95% interval of **−0.0243 to +0.0749**. This does not establish an advantage; compatibility-rating correlations are also weak. Full operational assigned scores are absent for these Event 27/28 feedback rows, so this is a controlled directional model comparison, not a replay of every historical mutual-plus-AI score.

A separate fixed exploratory sensitivity learns equally from earlier ranking percentiles and earlier one-to-one compatibility ratings. The total fitting weight stays constant, the learned two-way gate still uses rankings, and `wantConnect` remains evaluation-only. This comparison does not tune source weights on future feedback.

| Model trained on past rankings + ratings | Want-connect AUC | Compatibility-rating Spearman |
| --- | --- | --- |
| Two learned archetypes, same earlier data | 0.5060 | -0.0339 |
| 16 MBTI groups + full questionnaire | 0.5068 | -0.0209 |
| MBTI types only | 0.4997 | -0.0541 |

Adding earlier ratings gives mixed event results: the MBTI questionnaire model rises from 0.5761 to 0.6081 AUC on Event 28, but falls from 0.4994 to 0.4510 on Event 27; pooled AUC falls to 0.5068. This fixed experiment does not demonstrate that all ways of learning from one-to-one feedback are harmful.

The feedback report includes per-event results, known-MBTI and explicit-met-only slices, and paired bootstrap intervals. Older responses without meeting-status metadata are retained as legacy rated meetings: 170 such responses and 86 explicitly confirmed meetings comprise the 256 usable outcomes. Event 28 has 81 confirmed meetings and no legacy assumed meetings. Exact feedback submission timestamps are unavailable, so these are retrospective event-order tests; a later edit to an earlier event response cannot be ruled out.

These outcomes exist only for actual assigned partners. The experiment cannot establish how unobserved alternative matches would have gone. The historical system selected those partners, and compatibility ratings may reflect the displayed match score. Scores here are ordering signals, not calibrated probabilities of attraction or successful relationships.

## User 7 and the previously listed people

The benchmark is unchanged: **7 romantic, 13 friendly and 10 disliked people**, excluding IDs 70 and 1778. User 7 derives as **ESTJ**. Twenty-six of the 30 benchmark people also have complete MBTI answers. The categories provide no exact within-category ranking. They were used only for evaluation.

The directional score best matches the question “does User 7 like this person?” The acquaintance labels do not establish the other person’s interest. Higher AUC means better ordering of the stated categories.

| Directional AUC | Frozen V12 | Retrained two | 16 + questionnaire | Types only |
| --- | --- | --- | --- | --- |
| liked vs disliked | 0.6650 | 0.5450 | 0.5875 | 0.6025 |
| romantic vs disliked | 0.8929 | 0.7143 | 0.8714 | 0.4357 |
| friendly vs disliked | 0.5423 | 0.4538 | 0.4346 | 0.6923 |
| romantic vs friendly | 0.8407 | 0.7363 | 0.9066 | 0.3022 |

The 16-group model improves romantic separation relative to the expanded two-group model but weakens friend separation; overall liked-vs-disliked AUC remains below frozen V12. Only two distinct event participants are ESTJ, including User 7, so this group has very little independent evidence.

| User 7 sensitivity | Retrained two | 16 + questionnaire | Types only |
| --- | --- | --- | --- |
| Directional liked AUC, User 7 excluded | 0.4175 | 0.3725 | 0.5450 |
| Final liked AUC, full fit + fixed historical AI | 0.6200 | 0.6250 | 0.6675 |

The exclusion fit removes all 92 ranking directions involving User 7. His manual acquaintance categories never enter training. The original V12 final-score liked AUC is 0.7200, versus 0.6250 for the full MBTI questionnaire candidate. Final-score comparisons reuse identical **historical September 17 AI adjustments**; they are a controlled diagnostic, not freshly hash-verified September 23 operational scores. No new AI calls were made. This repeatedly inspected, selected 30-person benchmark is development evidence, not an untouched population test.

### All 30 people: directional score comparison

Scores are within-model ranking percentiles on a 0–100 scale. They are not success percentages. Full fits include User 7’s prior event ranking history.

| ID | Known category | MBTI | Frozen V12 | Retrained two | 16 + questionnaire | Types only |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | friendly | ISFJ | 43.7500 | 69.3601 | 27.5641 | 75.0000 |
| 23 | friendly | ENFJ | 83.2661 | 60.3579 | 30.1282 | 78.8462 |
| 101 | disliked | ESTJ | 38.9113 | 95.6074 | 63.4615 | 99.0000 |
| 122 | friendly | INTJ | 23.9919 | 44.4143 | 35.2564 | 28.8462 |
| 223 | friendly | ISFP | 24.3952 | 66.4317 | 50.6410 | 26.2821 |
| 277 | disliked | INFP | 74.3952 | 1.0000 | 1.0000 | 27.5641 |
| 287 | friendly | INTP | 34.8790 | 12.3102 | 1.0000 | 96.7949 |
| 312 | disliked | INFP | 68.7500 | 81.9414 | 86.5385 | 27.5641 |
| 325 | friendly | ESFP | 38.9113 | 13.0694 | 21.1538 | 21.1538 |
| 539 | friendly | ESTJ | 11.4919 | 25.0000 | 27.5641 | 99.0000 |
| 567 | friendly | ESTP | 70.7661 | 65.0217 | 40.3846 | 7.0513 |
| 892 | disliked | ESTP | 40.1210 | 33.3514 | 8.3333 | 7.0513 |
| 975 | romantic | ISFP | 93.7500 | 79.0130 | 77.5641 | 26.2821 |
| 1101 | disliked | ENFP | 22.3790 | 71.5293 | 50.6410 | 91.6667 |
| 1137 | disliked | ISFP | 61.8952 | 74.0239 | 68.5897 | 26.2821 |
| 1293 | disliked | ISTP | 14.7177 | 30.7484 | 35.2564 | 14.7436 |
| 1372 | friendly | ENFP | 23.9919 | 1.6811 | 1.0000 | 91.6667 |
| 1381 | friendly | ENFP | 76.0081 | 52.6573 | 67.3077 | 91.6667 |
| 1414 | friendly | unknown | 76.8145 | 84.7614 | 75.0000 | 75.0000 |
| 1455 | romantic | INTP | 91.7339 | 82.8091 | 87.8205 | 96.7949 |
| 1470 | romantic | ISTJ | 79.6371 | 20.2278 | 54.4872 | 21.1538 |
| 1524 | romantic | ESTP | 79.6371 | 73.4816 | 78.8462 | 7.0513 |
| 1527 | disliked | ESTP | 15.1210 | 8.5141 | 5.7692 | 7.0513 |
| 1566 | romantic | ENFP | 76.8145 | 42.8959 | 67.3077 | 91.6667 |
| 1586 | romantic | ENTP | 64.3145 | 88.0152 | 85.2564 | 13.4615 |
| 1606 | disliked | ENTP | 59.8790 | 35.7375 | 35.2564 | 13.4615 |
| 1623 | romantic | ESTP | 80.8468 | 98.5358 | 99.0000 | 7.0513 |
| 1688 | friendly | unknown | 50.2016 | 3.8503 | 8.3333 | 75.0000 |
| 1775 | friendly | unknown | 92.1371 | 95.0651 | 86.5385 | 75.0000 |
| 1853 | disliked | unknown | 91.7339 | 61.8764 | 60.8974 | 75.0000 |

The type-only approach cannot distinguish people with the same type: for example, romantic IDs 1524 and 1623 and disliked ID 1527 are all ESTP and receive identical type-only directional scores. The questionnaire model retains information that separates them.

## Recommendation and reproducibility

Do not replace the current matcher with hard 16-type matching based on this evidence. Keep detailed questionnaire signals and learn from actual past feedback. MBTI can remain an optional research feature, but the present sparse coverage and inconsistent held-out results do not justify making it the main grouping rule. Collect complete personality inputs before making claims about a fully typed population, and reserve a future event for a genuinely new evaluation before promotion.

Research scripts: `scripts/evaluate-mbti16.py`, `scripts/evaluate-mbti16-feedback.py`, `scripts/diagnose-mbti16-raw.py`, `scripts/verify-mbti16.py`, `scripts/report-mbti16.py`. Use the pinned versions in `scripts/personalized-compatibility-requirements.txt`. Approved SQL export queries are saved at the project root as `.tmp-mbti16-20260923-export.sql` and the corresponding User 7 export.

Artifacts are in `tmp/mbti16-2026-09-23/`: dataset hashes and protocol, data audit, event/fold results, per-row held-out predictions, User 7 comparisons, feedback confidence intervals, and raw-score checks. Nine independent synthetic checks cover MBTI parsing, missing types, metrics, temporal separation, participant purging and User 7 label isolation; 14 saved-feedback metric checks also pass (maximum AUC difference 1.1e-16). Temporary raw survey exports were excluded from Git and removed after verification; pseudonymous score comparisons and prediction evidence remain local.
