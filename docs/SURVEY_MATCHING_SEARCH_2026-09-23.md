# Broad survey-based matching search — 23 September 2026

**A more promising scheme was found, but a reliably highly accurate universal matcher was not established.** The clearest direction is to learn whether a person wants to connect from both people’s surveys, with prior rankings as a secondary training signal, and score the two directions separately. The research produced a portable offline prototype. Production matching and database records remain unchanged.

## Scope

Tested **72 new fixed candidate configurations**: 20 nonlinear/answer-interaction models, 12 continuous survey-neighbor and tensor-kernel models, 10 direct-connection models, and 30 survey-weighted peer-history models. Additional tests cover ensembles, conservative blends, older-event training, auto-save removal, historical profile timing, and User 7 exclusion. Earlier factor/semantic/personal-history experiments were reviewed rather than misrepresented as new wins.

The preceding [16-MBTI comparison](MBTI16_V12_COMPARISON_2026-09-23.md) did not establish a benefit from fixed types. This broader search retains individual questionnaire answers, allowing preferences to vary within a type. The original V12 reference is the frozen artifact matching the live version marker `2026-09-03-v12-event26-archetype-ai-chemistry-100`; the database provides no artifact checksum. Full assigned mutual-plus-AI scores are unavailable for the tested feedback, so this compares survey models, not every component of historical production matching.

Approved minimized data covers **254 distinct event participants**, plus 4 benchmark-only people, 4,233 saved ranking directions (3,717 explicitly submitted), 680 retained one-to-one responses, and 1,372 group-experience ratings. Historical events 20–25 supplement recent events 26–28. The final later-event one-to-one test has 192 directed responses from 70 people, including 126 yes and 66 no. Twelve explicit non-meetings were excluded. Names, contacts and free-text feedback were not exported.

Recent ranking search uses 1,539 explicitly submitted rows. The direct-connection joint models use the original 1,966 ranking rows as auxiliary labels; a separate manual-only sensitivity removes the 427 auto-saved rows. These are different, explicitly documented training protocols.

## The most promising scheme

1. Encode both questionnaires into categorical self/partner answers, directed answer-pair interactions, equality/missingness indicators and current-focus overlap. IDs locate records but never become predictors.
2. Learn a directional connection utility. The final recent-data selection is a regularized linear pair model with **75% total training weight on actual wantConnect outcomes and 25% on ranking percentiles**. Reviewer/event ballots are weighted to keep prolific respondents from dominating. The 75/25 mixture is loss weighting, not a post-hoc average of two displayed scores.
3. Score A→B and B→A independently. The prototype exposes both utilities and their minimum so one-sided enthusiasm does not automatically imply a strong mutual match.
4. Use the score to order eligible candidates. These are uncalibrated utilities, not claims of romance, attraction, or a specified chance of success. The candidate scorer does not implement event eligibility or force assignments.

Model/regularization selection uses only earlier-event data and three inner folds that purge held people from both ends of training pairs. The later-event evaluation selects on Event 26 before testing Event 27, then selects on Events 26–27 before testing Event 28. The selected family differs between these tests; the final all-recent fit selects the 75/25 model. The final fitted model itself has not received prospective validation.

| Later-event one-to-one metric | Original V12 | Updated ranking V12 | Direct-connection selection |
| --- | --- | --- | --- |
| Pooled AUC | 0.443 | 0.518 | 0.576 |
| Mean per-event AUC | 0.420 | 0.516 | 0.550 |
| Within-person AUC | 0.394 | 0.455 | 0.591 |
| Positive top choices | 62.1% | 68.2% | 72.7% |
| Reciprocal AUC on 73 fully observed pairs | 0.476 | 0.544 | 0.624 |

There are 66 chooser/event sets with at least two rated partners. The model selects the top ceil(20%) of each set; with these small sets that means one recommendation each, retaining 66 of 181 options (36.5% option coverage). It gets **48/66 positive choices**, compared with 41/66 for original V12 and 45/66 for updated ranking V12. Random selection within the same chooser sets would average 65.9% positive. This is a retrospective choice among partners actually met, not evidence that unobserved alternative matches would have succeeded.

The direct model’s pooled AUC improvement over original V12 is +0.133 (paired reviewer-bootstrap 95% interval +0.038 to +0.234). Against updated ranking V12, the improvement is +0.058 (−0.037 to +0.157). The top-choice precision gain versus original V12 is +10.6 percentage points with interval **−1.4 to +22.9 points**; therefore that headline precision gain is still uncertain. Within-person ordering improves versus original V12, but uncertainty includes no gain versus the updated recipe. These intervals do not refit the pipeline or correct the entire broad research search.

A fixed joint-75 candidate, as opposed to the changing nested selection procedure, reaches pooled AUC 0.570 and expected top-choice precision 71.7% under tie handling. The final selected prototype should not be assigned the aggregate procedure’s 72.7% as a guaranteed future rate.

Removing auto-saved training rankings gives within-person AUC 0.606 and 47/66 positive top choices (71.2%). The differences from the original direct-connection search remain uncertain. Older-event connection training yields event-macro AUC about 0.526 and pooled AUC 0.479; different score scales across selected event models affect the pooled statistic. It still gives 48/66 positive top choices, but does not consistently improve discrimination. More historical rows were not automatically better.

## Ranking search

The 32 new ranking candidates include target-survey appeal baselines, directed answer-pair regression, fixed questionnaire-semantic axes, cross-question interactions, pairwise logistic ranking, shallow boosted trees, extra trees, similar-person taste transfer, and continuous tensor kernels. Inner selection optimizes equal mean-person top-three AUC and NDCG@3. The selected model, an inner-selected blend with the incumbent, and an inner-selected three-model ensemble are all tested separately.

| Protocol | V12 mean-person AUC | Selected AUC | V12 NDCG@3 | Selected NDCG@3 | Ensemble NDCG@3 |
| --- | --- | --- | --- | --- | --- |
| Recent temporal | 0.581 | 0.576 | 0.596 | 0.559 | 0.576 |
| Recent nested unseen-person | 0.647 | 0.633 | 0.617 | 0.625 | 0.648 |
| Expanded-history temporal | 0.566 | 0.585 | 0.594 | 0.579 | 0.569 |

No consistent ranking replacement emerged. In recent temporal tests, top-one-in-actual-top-three success is 33.2% for the incumbent recipe and 28.1% for the automatically selected model. The best-looking individual candidate after inspecting outer results is exploratory, not a validated selection procedure. Five outer participant folds and three inner folds explicitly separate fitting, selection, and evaluation. Some winning inner candidates merely learn broad target appeal; those do not establish personalized matching.

The ensemble improves unseen-person NDCG from 0.617 to 0.648 and mean-person AUC from 0.647 to 0.659, but loses on the later-event test. The expanded-history selected procedure modestly improves AUC over its same-history V12 refit while reducing NDCG. These are useful partial gains, not consistent evidence of better future-event matching.

## Why the group-feedback results did not establish a breakthrough

Thirty peer-history schemes learn from prior event group experiences, using survey similarity to decide whose opinions matter. Development uses Event 25 history to predict Event 26, then freezes the chosen scheme for Events 27–28. The primary test permits only feedback from earlier events available before seating creation and excludes previous feedback on the exact tested pair. All 1,372 group rows were checked against actual same-round exposure; no mismatch was found.

Among 791 later-event responses, 84.3% are positive before any recommendation. The selected model reaches global AUC 0.553 and within-reviewer AUC 0.497, with 85.6% positive top choices. Original V12’s top-choice positive rate is 90.9% on that same group-feedback test. A prespecified survey-neighbor baseline reaches global AUC 0.612, but reviewer positivity alone reaches 0.608; within-reviewer AUC is only 0.512. Much of the apparent success identifies generous reviewers rather than their preferred person.

Even predicted probabilities of at least 95% are only 87.8% positive on the selected subset. A stricter profile-timing analysis and exploratory within-event adaptations do not provide convincing personal-choice gains. Historical round-start timestamps are not fully available, so within-event proxy results are explicitly unproven and are not counted as reliable improvements.

## User 7

The same 30-person benchmark is evaluated after model selection: 7 romantics, 13 friends, 10 disliked people; IDs 70 and 1778 remain outside this benchmark. Labels never enter training or selection. Full-pipeline exclusion removes every User 7 incident ranking and one-to-one feedback row before both inner selection and final fitting. The other person’s interest is not established by these labels.

| Directional benchmark AUC | Frozen V12 | Recent connection fit | Expanded connection fit | Expanded, User 7 fully excluded |
| --- | --- | --- | --- | --- |
| Liked vs disliked | 0.665 | 0.532 | 0.640 | 0.730 |
| Romantic vs disliked | 0.893 | 0.593 | 0.614 | 0.829 |
| Friends vs disliked | 0.542 | 0.500 | 0.654 | 0.677 |
| Romantic vs friends | 0.841 | 0.549 | 0.489 | 0.571 |

The expanded, fully purged model’s 0.730 liked/disliked result is encouraging, especially for friends, but its wider event results do not justify selecting it as the winner. The recent direct-connection model weakens User 7’s benchmark. Original V12 still separates his romantics from friends and disliked people better. Ranking-search full and purged procedures also fail to show a consistent User 7 upgrade. No blend was chosen to fit these 30 labels.

The [complete 30-person comparison](../tmp/survey-search-2026-09-23/user7-connection-comparison.csv) includes original V12 and all four direct-connection fits, with User 7→person, person→User 7 and minimum-direction utilities. Utility scales differ across models; compare candidate orderings rather than raw score magnitudes across columns.

## Deliverable and next decision

`scripts/survey-search/shadow.py` and `tmp/survey-search-2026-09-23/shadow-model.json` form a working **offline candidate scorer**. The portable artifact contains 910 generic feature names, scales, coefficients, an intercept, source hashes and aggregate training counts. It contains no participant records. Inference takes two survey profiles and returns forward, reverse and minimum utilities. Encoder changes fail validation instead of silently changing predictions.

Portable inference matches the fitted model on 252 tested directions to within 7e-16, including all 30 User 7 pairs in both directions. This proves serialization parity, not accuracy. Usage is in `tmp/survey-search-2026-09-23/shadow-usage.md`. The trained artifact can score new supplied surveys after the temporary training exports are removed.

**Recommendation:** retain the current matcher operationally and evaluate the frozen direct-connection prototype alongside it on the next genuinely new event, before examining that event’s outcomes. Preserve separate measures for each person’s preference, both-person connection, top-choice lift, and subgroup regressions. Do not advertise a 90–95% success rate from these data. This research found a useful candidate and exposed several misleading success metrics; it did not establish consistently highly positive matching across events and User 7.

## Interpretation and reproducibility

Events 27–28 and User 7 have already been examined in prior research. Nested evaluation prevents direct label leakage within this search, but cannot make those datasets newly untouched. The broad family search itself remains exploratory. Keeping selection inside training folds follows the model-selection bias analysis of [Cawley and Talbot](https://www.jmlr.org/papers/v11/cawley10a.html).

Historical survey reconstruction is incomplete, especially for older events; current structured fallbacks may postdate the encounter. Separate strict-profile analyses address this where possible. Feedback exists for exposed/assigned partners only and is affected by the prior matching policy. Rankings are relative to an encountered candidate set; wanting contact does not distinguish romance from friendship. Repeated-pair order stability was only 13/25 comparisons across 14 people, too sparse to establish an accuracy ceiling.

The one-to-one export lacks exact submission timestamps, so event-order training cannot rule out an earlier-event response being submitted or edited after a later encounter. Recent data includes 170 legacy rated meetings without an explicit meeting flag and 86 confirmed meetings. Reported uncertainty also does not capture all shared-partner dependence.

Scripts are in `scripts/survey-search/`; reports, folds, predictions, selection manifests, confidence intervals, verification results and the portable model are in `tmp/survey-search-2026-09-23/`. The five temporary raw exports were removed after verification. Full event/historical SQL and input hashes support audited re-export; retraining requires those inputs again. The trained scorer was verified to load and score without the raw exports. All database operations in this study were reads.

Verification passed: 3,024 independently recomputed ranking metric values, 324 ranking-model feedback AUCs, 192 ranking-model User 7 AUCs, four synthetic split/tie checks, and 3,908 independent direct-connection checks covering shortlist precision, reciprocal outcomes, and User 7 comparisons. Portable model parity passed on 252 directions. These checks establish arithmetic and implementation consistency, not additional independent evidence of prediction accuracy.
