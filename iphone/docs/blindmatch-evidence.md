# What BlindMatch teaches نصفين about compatibility

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
