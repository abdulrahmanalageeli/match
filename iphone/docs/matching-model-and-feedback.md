# Wudayn profile directory, compatibility percentages and feedback

**Members browse every profile they are eligible to see, see their existing compatibility percentages with each person, and choose whom to contact.** Every eligible profile is reachable through pagination. Members can use search, filters, or an explicit percentage sort. A low or unavailable score alone cannot hide a profile. Existing access, visibility and blocking rules apply.

Keep the current questionnaire and percentage formulas. Marriage v4 supplies 16 practical self/partner pairs, or 15 when parenting is inapplicable. Personality v2 supplies 15 self-reports, three per domain, plus five optional desired-partner ranges. Practical fit measures two-way alignment on practical answers. Personality similarity compares the 15 self-reports. The separate partner-range score measures two-way alignment with the selected ranges. It stays unavailable when either person leaves every range flexible. The same two confirmed profiles and scoring version produce the same percentages regardless of browsing history.

## What to freeze before launch

- Freeze the Arabic wording, stable IDs, option codes, practical comparison rules, A–E scoring keys, reverse items, applicability rules and partner ranges under their current versions. Keep optional ranges unset when unspecified. Never infer a desired partner from a self-answer. A complete questionnaire can legitimately contain an inapplicable topic or zero preferred trait ranges.
- Check three ambiguities with intended Arabic-speaking members before freezing the wording. Can someone enjoy quiet settings and still be sociable? Does the harsh-words item capture stress or consideration? Does understanding other viewpoints mean curiosity or empathy? Ask members to paraphrase the items and partner-range anchors. With voluntary pilot data, inspect response distributions, reverse-item correlations and repeat ratings. Version any material correction and retain the earlier scoring key. Existing members’ versions remain interpretable.
- Wudayn uses original wording. The published 15-item BFI-2-XS supports brief domain measurement with its own items. In two speed-dating studies even extensive pre-meeting questionnaires failed to predict the unique attraction between two particular people. Use local outcomes to establish what Wudayn predicts. [Soto and John](https://www.colby.edu/wp-content/uploads/2013/08/Soto_John_2017b.pdf) · [Joel, Eastwick and Finkel](https://pubmed.ncbi.nlm.nih.gov/28853645/)

## What to record for optional validation

| Private record | Minimum contents |
|---|---|
| Assessment revision | Immutable pseudonymous revision IDs, confirmation time, catalog and scoring versions, and structured inputs required to reproduce each displayed percentage. Preserve applicability and explicit partner ranges. Reference each revision across views. |
| Profile exposure | Viewer, viewed profile, mode, time, both revision IDs, exact scores presented or unavailable, active filters/sort and position. Distinguish a page returned by the server, a card visible on screen, a profile opened and a contact request. Link the request to its originating view where available. |
| Feedback | Request ID, responding side, outcome and version, value, time window and anchor, recorded time, revision/withdrawal and consent for the intended use. Deduplicate repeat submissions and exclude withdrawn data on dataset rebuild. |

Keep the join inside a restricted training environment. Use only structured, purpose-consented inputs. Exclude identifying details, Luna transcripts, chat text, photos and report narratives. Keep blocks and safety exclusions in eligibility. Suppress follow-ups after a block or withdrawal. Agree retention and deletion rules before collection, including how deletion reaches snapshots, exports and training rebuilds.

## Feedback timing and training labels

Start the clock when the second person signs the communication agreement. Opening a profile, sending a request and accepting a request are distinct events. Offer one optional in-app form at a time. Opening chat is enough to discover a due form. There are no scheduled push reminders. An answered stage remains editable during its window.

| Trigger | Private questions | Window |
|---|---|---|
| 48 hours after chat opens | Have you talked? If yes, did you enjoy it and would you like to continue? | From 48 hours until day 7 or closure. A “no” means no conversation **as of that response**. |
| Seven days after chat opens | Ask about days of contact. Stop after no contact. Otherwise ask, in order, about marriage potential, how well the other person’s interpersonal style suited the respondent, agreement on married-life expectations actually discussed, and one optional main influence. | From day 7 until day 14 or closure. Invite both people independently. |
| Either member ends an accepted match | Close immediately. Offer a private exit form to the person ending it; either participant can access it via closed history. Capture days of contact, enjoyment, willingness **at closure**, optional reason, and an optional topic if the reason concerned practical fit or personality. | From closure until seven days later, superseding routine check-ins. Blocks and reports suppress the form for both people. Unaccepted, withdrawn requests and expired requests do not count as ended connections. |
| Actual marriage milestone, separately opted in | After both agree to take a formal step, propose one check 14 days later about whether it happened, including offline. With separate longitudinal consent, propose one status/satisfaction check at 12 months. | Design only. Skip routine 90-day and six-month surveys. Ordinary closure ends routine prompts. |

The 48-hour and seven-day cutoffs are pilot design choices. Compare completion, skips, and the proportion who have yet to talk before changing the schedule. Longitudinal speed-dating research motivates measuring both first impressions and later behavior. It does not establish an optimal reminder interval. [Baxter and colleagues](https://pubmed.ncbi.nlm.nih.gov/36322750/)

The restricted [training query](connection-feedback-training.sql) produces one row per enrolled pair and closed observation window. Inputs are frozen at enrollment and precede the outcomes. They include the versioned self/partner questionnaire codes, practical evidence, and the two enrollment scores. Capturing the exact profile display revision remains separate planned work. Enroll only members who consented to this study and the use of their questionnaire data. Rebuild the dataset from current responses when a response is withdrawn. Keep research records in restricted storage.

For week-v2, two yes answers confirm mutual perceived marriage potential. One explicit no rules it out. Retain too early, not discussed, unclear, no contact and a skipped optional factor as distinct observations. Analyze personal and practical fit as each respondent’s perceptions. A factor such as respect carries no implied valence or Big Five rating. Day-two and legacy enjoyment/continuation measures have separate definitions. Use later outcomes to validate pre-contact scores, keeping members disjoint across development and new-member test cohorts.

## How to use the feedback

The [prospective marriage study protocol](marriage-study-protocol.md) specifies the marriage endpoint, early secondary outcomes, follow-up file, full-questionnaire model and reproducible evaluation.

**Choose the endpoint before fitting weights.** Week and exit reviews capture perceived marriage potential. Week-v2 collects one broad influence. Exit reviews can identify a specific helpful or difficult practical topic or personality domain, and ask whether actual family contact occurred. Two agreeing reports corroborate that event. Keep each person’s report private and distinguish nonresponse and disagreement. These fields are outcomes or explanations for a pre-contact model.

Evaluate conversation success, mutual perceived marriage potential, actual formal progression, marriage formation, and later relationship satisfaction separately. For example, if two people enjoyed speaking and one rules out marriage, the first outcome is positive and the second is negative. Evidence from established couples shows that forecasting changes in relationship quality remains difficult. The published results do not validate Wudayn’s questionnaire or establish predictive weights. [Joel et al., 43 longitudinal couples studies](https://doi.org/10.1073/pnas.1917036117)

Before interpreting even the early endpoints, compare held-out performance with a base-rate model and practical-only fit. Report how many distinct people, pairs, positive and negative outcomes, and missing responses contribute, including response rates across displayed score bands. Shared members and repeated windows require grouped evaluation. Launch traffic must establish whether personality adds predictive information with adequate precision. An annual status/satisfaction follow-up needs its own consenting cohort, including members who connected outside the app or stopped using it. Evaluate relationship quality at a defined time since marriage; a year after an introduction may be only weeks after the wedding.

The directory works from the first completed assessments. Pool voluntary feedback to study how often both people enjoyed talking and wanted to continue at different **displayed** score levels. Report sample sizes, known positives, known negatives and unknowns within each band. Examine personality within similar practical scores. Separate marriage and friendship, and distinguish early conversations, formal steps and later marriage outcomes.

Members see the percentages before deciding whom to contact. Those choices, screen position and willingness to respond affect which pairs have observable outcomes. Report findings for the members who chose to connect and state response coverage. Outcomes for pairs who never spoke remain unknown. If enough data accumulate, an internal regression can test whether personality adds information beyond practical fit on later, held-out introductions. Its output is for evaluating the questionnaire. Member-visible scores continue to come directly from the confirmed answers and the existing formulas.

## Launch handoff

The current local discovery screen starts in a recommended view capped at five and provides a separate all-profiles directory. For the planned experience, make that paginated directory the only browsing entry point. Check `src/community/discoveryMemory.ts` (initial mode), `Community.tsx` (mode controls, five-card limit, filters and pagination), and `data.ts` (live and demo defaults). Reuse `src/compatibility/model.ts` and `personality.ts` for the percentages. Verify that every eligible profile is reachable, including low scores and unavailable personality scores. Verify that opening another page or changing the list order preserves each pair’s displayed values.

The active local pilot uses server-side windows, private post-closure responses and a restricted analysis query. The preview shows one simulated event at a time. Production deployment, purpose-consented enrollment, and long-term milestone collection are separate work.
