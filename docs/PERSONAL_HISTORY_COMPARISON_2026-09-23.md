# Does individual feedback improve survey matching? — 23 September 2026

**No meaningful overall improvement was established.** The active personal layer improved a few orderings and User 7’s diagnostic benchmark, but produced no additional positive top choices. The same shared model gets 46/66 positive top choices before and after personalization; among returning people meeting new partners it gets 22/34 before and after. Production code and matching remain unchanged.

## What is different this time

The shared model learns one rule from everyone’s survey/outcome combinations. The new layer stores a separate preference adjustment for each chooser, learned only from that person’s earlier rankings and connection decisions. Two people with identical surveys can now receive different recommendations if their histories differ. A person with no informative history receives exactly the shared score.

Ten fixed alternatives were tested: five survey-similarity transfer models and five personal linear models, covering connection-only, ranking-only, and mixed histories. Each learns which surveyed qualities the individual likes more or less than the shared model expects. Sparse histories are shrunk toward the shared score; positive/negative responses are centered so a generally generous reviewer does not automatically receive higher compatibility. Candidate IDs never predict preference; chooser IDs only retrieve that chooser’s earlier history. Earlier labels about the exact candidate are excluded from personal fitting.

## Fair comparison and timing

All comparisons turn the personal layer on/off over **the same fitted shared model, the same surveys and the same possible partners**. The shared model is the fixed 75% connection /25% ranking training recipe, trained on eligible earlier events20–28. Its auxiliary rankings include auto-saves; the personal layer uses explicitly submitted rankings only.

Parameters were chosen on events23–26, then locked before testing27–28. Ranking and connection outcomes have separate predeclared selection objectives. The primary connection objective retained the shared model, while the ranking objective selected the personal ranking-only Ridge model. The active-personal tables below deliberately evaluate that selected ranking model, including its secondary connection outcomes; they do not mislabel the disabled connection layer as a personalization test.

Primary training accepts only lower-event records with ranking submission time or match-row update time before the next event’s earliest saved seating creation. Feedback updates are conservative upper bounds, not exact submission times. A September3 update reset most earlier match-row timestamps: therefore no earlier connection history can be certified during development23–26. Development falls back to a shared ranking model, and cannot establish the value of connection-history-only adapters. Before events27/28, 483/597 earlier connection responses pass the timestamp check.

An event-order sensitivity permits all earlier-event feedback, acknowledging that a late submission/edit could violate availability. A recent-base sensitivity keeps global training restricted to26→27 and26–27→28 while still allowing the personal layer all eligible earlier own history. These protocols differ from the preceding 48/66 shared-model-selection result; comparing their headline percentages directly would conflate training window, timestamps, model selection, and personalization.

## Main later-event results

| Metric | Same shared model | Active personal layer | Change |
| --- | --- | --- | --- |
| Positive top choices | 46/66 (69.7%) | 46/66 (69.7%) | 0 additional positive choices |
| Returning people, new partners | 22/34 (64.7%) | 22/34 (64.7%) | 0 additional positive choices |
| Within-person connection ordering AUC | 0.545 | 0.561 | +0.015 |
| Mean-person top-three ranking quality (NDCG) | 0.590 | 0.592 | +0.0012 |

AUC measures how often a positive-rated partner scores above a negative-rated partner; 0.5 is chance ordering. NDCG measures ranking quality and is not a successful-match percentage. There are 192 directed feedback responses from70 people, but only66 chooser/event sets with at least two rated partners and33 with both positive and negative responses. Top ceil(20%) selects one partner per eligible small set:66/181 options, so actual coverage is36.5%, not20%.

The active layer improves within-person connection ordering in **one** informative chooser/event set, worsens none, and ties32. It changes one top choice, but the positive/negative outcome of that choice is unchanged. The ranking NDCG change is +0.00121 with paired chooser-bootstrap95% interval [−0.00609,+0.00840]. The +0.01515 connection-AUC change has interval [0,+0.05129] and rests on that single informative improvement. These fixed-prediction intervals are not proof of future lift and do not capture all shared-partner or model-selection uncertainty.

| Reference under this evaluation | Positive top choices | Within-person AUC | Mean-person ranking NDCG |
| --- | --- | --- | --- |
| Original frozen V12 survey component | 41/66 (62.1%) | 0.394 | 0.563 |
| V12 recipe retrained on the same earlier rankings | 48/66 (72.7%) | 0.561 | 0.605 |
| Shared direct-connection recipe | 46/66 (69.7%) | 0.545 | 0.590 |
| Shared + active personal ranking layer | 46/66 (69.7%) | 0.561 | 0.592 |

Any improvement of shared+personal over original V12 cannot all be credited to personal history: removing the personal layer preserves all46 positive choices. Retrained V12 itself gives48/66 on this test. The frozen reference matches the live V12 version marker but lacks a database artifact checksum; full historical mutual-plus-AI scores are unavailable, so this is a survey-model comparison rather than a replay of every production component.

## Sensitivities

| Protocol | Connection selection | Shared → selected connection positives | Shared → selected ranking NDCG |
| --- | --- | --- | --- |
| Strict availability | shared | 46/66 (69.7%) → 46/66 (69.7%) | 0.590 → 0.592 |
| Event order only | personal_kernel_rankings | 45/66 (68.2%) → 45/66 (68.2%) | 0.593 → 0.592 |
| Recent global base, strict personal history | shared | 45/66 (68.2%) → 45/66 (68.2%) | 0.569 → 0.566 |

The event-order connection selection chooses the personal ranking kernel and slightly improves AUC, yet still produces45/66 positive choices before and after. Shuffling that chooser’s earlier labels gives the same aggregate connection-AUC and positive-choice result, weakening the interpretation of this small gain. The strict primary shuffle control uses the connection-selected shared model and is therefore uninformative about the active ranking adapter. It must not be presented as evidence that the ranking gain depends on correctly assigned personal labels.

All ten fixed candidates’ later-event results are retained in `active-personal-comparison.json` as exploratory diagnostics. No candidate was promoted because it looked best after inspecting the later events.

## More visits: does eight beat two?

Recorded roster history in the same match namespace exists only for events20–28. Older legacy data belongs to another namespace and was not pooled. Visit counts below mean observed roster records, not independently confirmed physical attendance. The table compares the same people with/without the active personal layer; it does not compare naturally different people and attribute their differences to attendance.

| Recorded visit | People with feedback | Positive top choices, shared → personal | People with manual rankings | Ranking NDCG, shared → personal |
| --- | --- | --- | --- | --- |
| First | 37 | 22/30 (73.3%) → 22/30 (73.3%) | 32 | 0.577 → 0.577 |
| Second | 23 | 13/21 (61.9%) → 13/21 (61.9%) | 22 | 0.619 → 0.619 |
| Third–fourth | 12 | 9/11 (81.8%) → 9/11 (81.8%) | 11 | 0.574 → 0.597 |
| Fifth–seventh | 3 | 2/3 (66.7%) → 2/3 (66.7%) | 3 | 0.710 → 0.711 |
| Eighth or later | 2 | 0/1 (0.0%) → 0/1 (0.0%) | 2 | 0.603 → 0.523 |

First-timer predictions stay identical. The third/fourth-visit group shows some ranking benefit, but higher-attendance groups do not show a consistent progression. Only two people are observed on an eighth visit, and only one has multiple rated one-to-one options. That is far too little evidence for an eight-versus-two outcome claim. Attendance supplies opportunity to learn; usable contrasting feedback, varied prior partners, and stable preferences determine whether that opportunity is informative.

## User 7 and the same 30-person benchmark

Every User7↔benchmark-person ranking and feedback interaction was removed from the final shared and personal training fits. Remaining ranking percentiles were rebuilt after removal so benchmark positions did not leak into retained labels. This leaves6 unrelated connection responses (5yes/1no) and37 explicit rankings across events26–28. Benchmark categories are evaluation-only; excluding User7 from development score selection leaves the selected configurations unchanged. The earlier development model fits were not rerun with every benchmark pair removed, so this is not a completely benchmark-purged selection pipeline; User7 remains a retrospective diagnostic.

| Category ordering AUC | Same purged shared model | Active personal ranking layer | Original frozen V12 |
| --- | --- | --- | --- |
| Liked vs disliked | 0.605 | 0.655 | 0.665 |
| Romantic vs disliked | 0.586 | 0.657 | 0.893 |
| Friends vs disliked | 0.615 | 0.654 | 0.542 |
| Romantic vs friends | 0.407 | 0.505 | 0.841 |

His liked/disliked AUC improves0.605→0.655 (+0.050), and romantic/disliked improves0.586→0.657. This is a useful diagnostic gain against the same shared model. Original V12 still scores0.665 and0.893 respectively, and separates romance from friendship substantially better. The frozen V12 artifact cannot be retrospectively purged of benchmark interactions, so it is a descriptive reference; the shared-on/off comparison isolates the personal layer more cleanly.

The event-order connection-selected personal kernel gives User7 liked/disliked AUC0.625, a smaller+0.020 gain. His six connection responses contain only one negative, so connection-specific personal taste remains sparsely observed. These labels do not establish the other person’s interest or a real-world relationship success probability.

[All 30 User7 scores](../tmp/personal-history-2026-09-23/user7-scores.csv) are included. Raw utilities differ in scale across model families; compare rankings rather than interpreting a utility as a probability.

## Decision and limitations

**Do not claim a measurable increase in successful matches from this personal layer yet.** This implementation demonstrates real individual learning and modest diagnostic gains, but the later-event positive-choice count does not improve. It also does not establish that personalization can never help: these are ten specific schemes tested on limited history and two later events.

Surveys were reconstructed around final-ranking timestamps, with some current structured fallbacks. Five event27 profiles and three event28 profiles have later survey-update timestamps; one event28 profile was created after the earliest seating record. Profile availability at recommendation time is therefore not fully certified. Feedback exists only for partners chosen by the previous system. The events and User7 benchmark have already been studied in previous research and are not untouched future evidence.

Code, selection manifests, timestamp audits, all candidate predictions, same-person differences, confidence intervals and independent verification live in `scripts/personal-history/` and `tmp/personal-history-2026-09-23/`. All90 model-library synthetic checks passed; independent audits reproduced132 reported values for each of the three protocols, and all80 User7 category AUCs. They cover exact fallback, other-person isolation, identifier invariance, prior-partner exclusion and temporal rejection. The four temporary raw exports were removed after verification; input hashes and read-only export queries are retained for reproducibility. No production files or database records were changed.
