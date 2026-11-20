# What BlindMatch teaches نصفين about compatibility

The pairing experiments below are research history. Wudayn’s current product plan gives members the full eligible profile directory with questionnaire-based percentages and lets them choose whom to contact. See the [directory and feedback plan](matching-model-and-feedback.md).

**5 November 2026.** The most useful finding was how often interest went only one way. A person can like somebody’s conversation style without being the sort of partner the other person is looking for. Ask each person what they do and what they want from a spouse. Use both directions to explain a recommendation.

## What “clicked” meant at the event

The November read-only check counted an explicit yes to wanting to connect after an assigned meeting. A mutual yes required two explicit yes answers about the same meeting. The unit was a pair **in one event and round**, so people could appear more than once.

| Event cohort | Individual yes / recorded directions | Both yes / complete pairs | One yes | Neither yes |
| --- | ---: | ---: | ---: | ---: |
| 20–28 | 499 / 677 | 166 / 288 | 100 | 22 |
| 26–28 (subset) | 167 / 253 | 47 / 97 | 41 | 9 |

In events 26–28, 41 of 97 meetings with two replies were split. Missing replies were left unknown. Of the 677 directions, 86 carried explicit confirmation that the meeting took place. Earlier forms often omitted this field, and the audit admitted those legacy records when there was no explicit non-meeting. There were no later event match rows available to validate a newer cohort. Group rapport, wanting to connect, romantic intent, formal engagement and marriage are distinct outcomes. BlindMatch measured the first two.

## Which questions are worth asking again?

These four questions had relatively promising but weak individual results in the [September question audit](../../docs/matching-individual-question-analysis-2026-09-01.md). The live cross-check below had structured answers on both sides that were last updated before assignment for **92 of 288** complete pairs across seven events. In that restricted set 46 of 92 pairs both said yes.

| Event question | Both said yes when answers matched | Both said yes when answers differed | Useful marriage adaptation |
| --- | ---: | ---: | --- |
| Q11, `attachment_3` | 19 / 30 | 27 / 62 | Ask how quickly closeness develops and how much reassurance or space each partner prefers. Use ordinary words. |
| Q17, `lifestyle_4` | 16 / 37 | 30 / 55 | Ask whether shared days off are planned in advance or left flexible, and what arrangement would work with a spouse. |
| Q36, `conversation_depth_pref` | 19 / 46 | 27 / 46 | Ask whether a difficult subject is easier to discuss through one idea in depth or through lived examples and stories. Both styles can be thoughtful. |
| Q39, `curiosity_style` | 22 / 36 | 24 / 56 | Ask what invites meaningful conversation: questions about motivations, sharing experiences, or gentle humor. |

Reading these four rows as rules would reward sameness in two places and difference in two. They describe selected participants and meetings. Assignment, event mix, repeated people, missing answers, revisions to prompts and the search over many questions limit interpretation. A person who likes to ask questions may want a partner who shares stories. Measure that preference explicitly rather than guessing it from the two self-answers. The controlled historical rebuild did not identify an individual question strong enough for a production reweight. Its event-26 directional AUCs for these four questions were 0.581, 0.587, 0.587 and 0.564, respectively. These metrics measure ordering, not likelihood of marriage.

The [later multi-event comparison](../../docs/SURVEY_MATCHING_SEARCH_2026-09-23.md) evaluated 192 one-to-one responses from 70 people in events 27–28, including 126 yes answers. A procedure that trained mainly on wanting contact and scored both directions selected a wanted contact in 48 of 66 chooser sets, versus 41 of 66 for the older V12 procedure. Choosing at random among the same met partners averaged 65.9%. Its reciprocal AUC was 0.624 on 73 pairs with both responses. The interval for the top-choice gain over V12 included zero. The final fixed model had no prospective evaluation. The [V14 implementation](../../docs/SHARED_CONNECTION_MODEL_V14.md) used the lower of the two directional utilities. Transfer the two-sided design to نصفين, then validate weights on its own voluntary outcomes.

## How to use the evidence in نصفين

- Separate a member’s own approach, desired partner approach, and explicit non-negotiables. Reserve eligibility filters for the conditions that person deliberately marked as required. Treat missing information as unknown.
- Add children, residence, timing, family involvement and household responsibilities because these are meaningful marriage decisions. BlindMatch did not establish weights for these topics.
- Explain observed alignments and useful discussion points. Preserve private answers. Keep hobbies and conversation starters available without penalizing silence, few interests, different personalities or declining to answer.
- For a pilot, count exposure, mutual acceptance, and both people agreeing to a formal step. Report each denominator and version. Compare against a simple eligible baseline on a later cohort before adjusting weights. Message volume and one-sided likes answer different questions.

## Reproducing the aggregate checks

The [read-only evidence query](blindmatch-evidence.sql) reproduces both event cohorts, the explicit meeting-confirmation count and the four question comparisons. It returns six aggregate rows.

Run read-only in the event project. Expand `public.event3_matches` phase 2, 3 and 4 partner/feedback columns, joining both numbers against `event3_participants` in the same match and event. Keep events 20–28. Omit test snapshot sessions, the standing research exclusion documented in the September audit, self-pairs, absent partners and conflicting duplicate labels. Require a JSON boolean `wantConnect`. Exclude an explicit false `meetingOccurred` or a `meetingStatus` other than missing or `met`. Deduplicate by match, event, phase, chooser and partner. Reverse join on those keys and keep each unordered pair once. Report only aggregate counts.

For the four-item cross-check use participants’ structured event answers only when both `survey_data_updated_at` values are at or before the earlier pair assignment’s `created_at`. Read `survey_data.answers`, then the legacy top-level answer or typed column where available. Normalize Arabic/Latin letter codes, keep valid answered comparisons and group by question and whether the choices match. The historical evaluation has a separate survey-availability, temporal and held-out protocol, so its denominators differ. The event audit exported no participant records, answers, contacts or free text to نصفين.

## Pilot for conversations both people want to continue

The follow-up audit ranks previously encountered options using the lower of the two directional BlindMatch scores. It keeps the latest encounter with two responses per pair and event. It includes only chooser and event sets with at least two such options and averages ties. Each pair can contribute to both people's choice sets.

| Top choice had two yes answers | All observed choice sets | Both explicitly confirmed meeting |
| --- | ---: | ---: |
| Uniform choice within each set | 24.67 / 54 | 8.33 / 19 |
| Refitted ranking model | 28 / 54 | 11 / 19 |
| Fixed 75/25 training recipe with event-specific fits | 28.83 / 54 | 11 / 19 |
| Previously selected direct-connection procedure | 27 / 54 | 11 / 19 |

This retrospective comparison uses the options people already encountered and response-complete choice sets. It gives limited evidence for importing weights. The label records willingness to connect. The survey did not measure both people's enjoyment or their intent by introduction type.

In a separate check of the public Columbia speed-dating data, both participants reported that they had never met in 1,687 eligible dates. A shared high-rated favorite among five activities raised the expected mutual yes rate at the top of each person's observed options from 18.03% to 18.21%, with gains in five of 11 waves. The rate where both rated their liking at least 8/10 went from 6.46% to 6.37%. These results support using shared activities as possible conversation starters and treating their ranking value as exploratory. The test used only pre-date activity ratings as predictors. Its outcomes are immediate romantic interest and liking in one study population. [Study](https://business.columbia.edu/sites/default/files-efs/pubfiles/867/fisman%20iyengar.pdf) · [Questionnaire and scorecard](https://web.mit.edu/17.871/www/2009/speed_dating_codebook.pdf)

### External check of pairing similar profiles

Welker et al. collected self-descriptions before a round robin and asked both sides of each 10-minute conversation about enjoyment and willingness to stop and talk again. Their released outcome is a centered composite of those two questions. This replay evaluates 144 conversations in 24 groups. For each group it considers the pairings with the most introductions. The similarity policy prioritizes the smallest pre-conversation Manhattan distance, then the next smallest. The comparison averages all eligible pairings uniformly. The evaluation uses each pair's lower enjoyment index and whether both indices are at least the released sample mean of zero.

| Population | Groups with a pairing choice | Random pairing, both at or above mean | Closest profiles, both at or above mean | Difference and 95% group bootstrap interval |
| --- | ---: | ---: | ---: | ---: |
| All eligible conversations | 24 | 30.6% | 29.2% | −1.4 points (−10.4 to +9.0) |
| Both rated prior familiarity at most 20/100 | 19 | 21.9% | 21.1% | −0.9 points (−8.3 to +7.0) |

The lower enjoyment index also varied in direction. The similarity policy changed it by −0.108 centered index units in the full sample and +0.045 in the low-familiarity subset. Both bootstrap intervals included zero. The bootstrap resamples whole groups for 5,000 draws. Prior familiarity was reported after the conversation and used only for the second row's restriction. The original study's convergence measure used information collected after the conversation. This replay uses pre-conversation distance and provides evidence about self-description similarity. Wudayn's five explicit partner ranges and its seven-day outcome still require their own pilot. [Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11513911/) · [Public replication archive](https://osf.io/8x5g2/)

For a separate Big Five check, 1,704 adults entering a Dutch matchmaking service completed a validated Big Five inventory. The traits did not significantly predict whether a relationship formed at three months in the main model. The study estimated associations with individual traits. It did not test our reciprocal scoring rule or mutual enjoyment shortly after an introduction. [Visser et al.](https://www.mdpi.com/2813-9844/7/2/52)

Decision for Wudayn. Use practical eligibility and preferences to create marriage introductions, and use shared topics as optional conversation openers in either mode. Keep automatic personality similarity out of ranking. Evaluate the existing explicit reciprocal OCEAN rule prospectively. Once people talk, use independent interest from both as the condition for offering a follow-up.

### What the pilot changes

1. Start with each member’s opted-in introduction type. For marriage, apply both members’ requirements and use the current questionnaire rank as the baseline. For friendship, use a shuffled eligible pool of members who both opted in. Same-gender members may be eligible for friendship.
2. Reuse the current interests picker for an optional opener. Ask what members would actually enjoy talking about or doing with someone new. Keep the existing cap and allow skipping. The offline ranking candidate is available as an exploratory comparison. It uses explicit activity choices when supplied and existing interests for earlier profiles. One shared activity gives a 5% boost to the marriage ranking value or ranks friendship candidates ahead of ties with no overlap. Two or three overlaps give the same boost as one. Supply an already eligible candidate pool with operational exclusions and availability applied.
3. Use the same introduction experience in both ranking arms. For example, the existing optional starter could ask two readers, «وش كتاب وديت تناقشه مع أحد، وليش؟». Record whether the introduction led to an actual conversation. Ask each person privately, «استمتعت بالمحادثة؟» and «ودّك تكمل الحديث؟». Ask whether they spoke if it took place outside the app. Let people skip feedback. Studies found that first-interaction ratings predicted later interaction, and that conversational prompts could increase connection between strangers. [Initial impressions study](https://pmc.ncbi.nlm.nih.gov/articles/PMC9659375/) · [Conversation experiments](https://pubmed.ncbi.nlm.nih.gov/34591541/)
4. If the pilot yields enough outcomes, test one optional second question about the first conversation. Offer light stories and humor, discussing a topic in depth, doing something while talking, or flexible. Ask for the opener someone would welcome. Watch whether the answer improves introductions beyond shared activities before giving it ranking weight. Use the existing Big Five and partner ranges as candidate predictors and test their incremental value with the same outcome. Stay with a small feature set until there is enough independent feedback to estimate pair-specific effects.
5. Offer another conversation after a confirmed first conversation when both independently opt in to continue. Keep both individual answers private. Offer a short initial conversation to learn how the pair actually interacts, then use their feedback to decide whether to reconnect them.

### Measure success

- Freeze the scoring rule, candidate pool definition, and feedback window before the cohort starts. Use a seven-day pilot window with equal invitation conditions. Randomly assign independent introduction batches to the current policy or the candidate within each mode. Prevent participants appearing in both arms of the same cohort. Keep flow and prompts identical to isolate ranking effects. Assign a stable random order to equally ranked candidates.
- Use all dispatched introductions as the denominator. Count confirmed conversations and the subset where both independently report enjoying it and wanting to continue. Report unknown separately from explicit misses. The success rate is bounded below by confirmed successes divided by all introductions and above by confirmed plus unknown divided by all introductions. Track response rate and later second conversations. Analyze marriage and friendship by intended mode, with batch-level uncertainty.
- Use later cohorts and keep participants out of both train and held-out sets when fitting a model. Compare each participant's proposed partners within the same eligible pool and compare mutual outcomes. Track how often the model improves those choices, beyond ranking generally popular members. Use consented answers and outcome flags. The score has no probability interpretation until its calibration is checked on later introductions.

### Run the local tools

```sh
python scripts/survey-search/audit-mutual-shortlist.py tmp/survey-search-2026-09-23/connection-recent-predictions.json
python scripts/survey-search/audit-shared-activities.py "Speed Dating Data.csv"
python scripts/survey-search/audit-conversation-self-similarity.py regression_data.csv
node --experimental-strip-types --test iphone/scripts/conversation-pilot.test.mjs
node --experimental-strip-types iphone/scripts/conversation-pilot.mjs < eligible-pool.json
node --experimental-strip-types iphone/scripts/conversation-pilot.mjs summarize < closed-introductions.json
node --experimental-strip-types iphone/scripts/conversation-pilot.mjs followups < closed-introductions.json
```

The ranking input is `{ mode, member, candidates }`. Profiles use current Wudayn fields plus explicit `introductionModes` and optional `activitiesToDo` using catalog IDs. Supply candidates in pre-shuffled order for ties. The outcome tools accept one record per introduction with `id`, `mode`, `arm`, optional `talked`, and the two private responses `first` and `second` with boolean `enjoyed` and `continue` fields. Use `baseline` and `candidate` as arm values. Omit unknown values. Use local pseudonymous IDs and export aggregate counts. The follow-up command returns eligible introduction IDs.

For the similarity replay, use [regression_data.csv from the public replication archive](https://osf.io/download/msb59/). Its SHA-256 is `a26fe2fe6f208b672d113c56f70622e053005dd63ae9e48fcada872b0fee7250`. The script prints aggregate results and keeps source rows out of the project.

### Collect outcomes in Wudayn

**Current pilot revision.** The schedule and collection details below describe the earlier prototype. The [current feedback contract](matching-model-and-feedback.md) starts at mutual agreement, adds independent week and exit responses, and includes a restricted training query.

The local marriage app has an optional feedback form under «خيارات المحادثة». It appears when the request has been enrolled and both people have agreed to communicate. During the first seven days, each person can independently answer, edit, or withdraw whether they talked, enjoyed it, and want to continue. The form explains that mutual willingness to continue is visible to both when they agree. Individual ratings stay private. When both choose to continue, the form offers a return to the conversation. During the second week, each person can privately report whether they talked again on another day. The operator gets counts without chat content, individual answers, or member identifiers.

Before acceptance, the service role calls `public.marriage_enroll_conversation_pilot(request_key, assigned_arm)` for a pending, discovery-linked request. This freezes the two current score values at enrollment and leaves the assigned arm fixed. The function records the scores available at that moment. The existing offer record identifies the discovery request and preserves its original version and fit band. Treat this sample as conditional on a request being sent. A randomized policy comparison covering everyone offered an introduction still needs assignment recorded at offer time.

The service role calls `public.marriage_conversation_pilot_totals()` after seven days. The output groups by assigned arm, scoring version, and practical and personality score deciles (0 means 0–9, 10 means 100). A null band means the score was unavailable. It shows enrolled requests, confirmed conversations, mutual willingness to continue, mutual enjoyment with willingness to continue, known failures, and unknown outcomes. A distinct second-week count includes only observation windows that closed after day 14 and pairs who both opted to continue. It records a repeat conversation when both say they talked again, and tracks unknown follow-ups. Compare personality bands within practical bands and check how much missing feedback could change the conclusion. Enrollment and deployment are pending. Friendship can use the offline tools with mutually opted-in pairs.

### Compare the two ranking policies before introductions go out

The offline cohort runner prepares one one-to-one round for marriage or friendship. Form blocks of two comparable, disjoint batches in the same mode. List each batch's permitted pairs before randomization. Account for opt-in, availability, exclusions, and previous meetings. A participant can appear in only one batch across the cohort.

The runner randomly assigns one batch in each block to the baseline and the other to the personality candidate. Marriage starts from the practical questionnaire rank and existing Beena adjustment. Friendship starts from a seeded random ordering of allowed pairs. The candidate applies only the current reciprocal OCEAN multiplier. Friendship uses preferences specifically given for meeting friends. Both arms maximize the number of eligible pairs before prioritizing their strongest pairs. This isolates the effect of personality on who meets whom. The runner shows how many pairs would change under the other policy in each roster. With zero changed pairs, the cohort cannot test the effect of personality on who meets.

Use a new cohort ID for each trial. Save the generated plan and its fingerprint before anyone sees the offers or records outcomes. Offer the same starter and the same feedback window in both arms. An operator dispatches the frozen pair list separately. Keep the arm and the other member's answers private. Count all randomized participants in the policy comparison and record whether each planned offer was dispatched.

```sh
node --experimental-strip-types iphone/scripts/conversation-cohort.mjs plan < consented-roster.json > cohort-plan.json
node --experimental-strip-types iphone/scripts/conversation-cohort.mjs report < cohort-results.json
```

- The plan input is `{ id, dispatchAt, blocks }`. Use an ISO timestamp with an explicit time zone. A block has `id`, `mode`, and two `batches`. Each batch has `id`, `participants` using current questionnaire fields and `introductionModes`, and `eligiblePairs` as arrays of two pseudonymous participant IDs. For friendship, collect any explicitly chosen trait ranges in `friendshipTraitPreferences` using the same `partner_*` keys and range codes. Ask what would feel comfortable with a new friend. Treat skipped ranges as flexible. The tool generates a random seed and records it in the plan. Use that seed only to reproduce the frozen plan.
- The report input is `{ plan, results, asOf }`. Each result has the offer `id`, optional `dispatched` boolean, and optional private `first` and `second` answers in the listed member order. An answer includes `talked` and, if true, `enjoyed` and `continue`. For pairs where both want to continue, include an optional `followup` map with `first` and `second` booleans for a conversation on another day. Follow-up totals appear separately after 14 days. The report rejects early reads, edited plans and outcomes outside the cohort. It counts both people talking, enjoying it and wanting to continue as success. An explicitly undispatched offer is a miss. Missing status or incomplete answers remain unknown when success is still possible.
- Report the equal-weight difference across matched batches in confirmed successes per randomized participant. Report lower and upper limits by assigning unknown outcomes to the least and most favorable arms. These limits reflect missing data. Statistical uncertainty still needs replicate batches. Review results by mode before changing weights.

The cohort runner has been tested locally using synthetic participants. It is separate from the current Wudayn service report, which enrolls after the request is sent. Real pilot offers and outcomes are still needed for both modes.
