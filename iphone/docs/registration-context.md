# Registration field decisions

This inventory describes the full membership application. Profile editing, approved legacy profiles and interview fallback have different entry conditions. A means an explicit answer or agreement, B an exact derivation, C an editable suggestion or default, D a conditional input, E optional or deferred and F inapplicable in the stated circumstances. A previously recorded valid answer satisfies its field.

| Fields | Class | Rule |
|---|---|---|
| Account email, password and account agreements | A | Use the account flow and its recorded agreements. |
| Saudi mobile, verification code, SMS/device permission | D | Require explicit verification on the SMS signup path. The normalized phone format is B. |
| Display name, gender, date of birth, current city | A | Reuse valid saved identity answers. Name supplies display text only. |
| Age and canonical city | B | Compute age from the private birth date, normalize recognized city aliases. An unknown city cannot establish colocation. |
| Marital status and position on polygyny | A | Status is a present fact. Future willingness is a separate answer. |
| Current wives | D/F | Only for a currently married man. Four wives or a currently married woman are unsupported by this membership path. Remove an obsolete count on status or gender change. |
| Existing children | C/A | For never-married members suggest zero, show it at final review and allow correction. Otherwise ask. Preserve an explicit zero or positive count. There is no child-specific follow-up in this form. |
| Profession or employment status, education | A | Reuse a confirmed value independently. Spousal employment expectations come from a separate compatibility item. |
| Public bio, lookingFor, lifeTogether, valuesStatement, marriageIntent | A/C | Full application requires text. Existing deterministic copy is an editable writing suggestion. Public review and private interview consent are separate. Generic fallback wording is a remaining product decision. |
| Discovery line, interests, priority categories and compatibility hard requirements | E | Only user-chosen strictness is meaningful. Never infer a hard requirement from a topic answer. |
| Height, weight, nationality, smoking | A | Validate numeric bounds and stored options. Skin tone is D under sensitive processing. |
| Spoken languages, preferred language, openness | A | Three different meanings. One confirmed language does not imply a preference or willingness to learn. |
| Tribal background, tribe name, faith affiliation, prayer practice | D/E | Gate sensitive disclosure. Tribe name is optional for tribal background and inapplicable otherwise. Preserve non-disclosure choices. |
| Dress style and flexibility | D/F | Women's appearance path with sensitive processing. Men's partner appearance criteria are separate. |
| Marriage timing, meeting format, family involvement | A | Marriage, first meeting and preferred family involvement have separate meanings. Formal-step timing is captured independently in the 44 answers. |
| Nine criterion modes | A | Shared language, height, weight, nationality, education, profession, marital status, children, smoking. Explicit bulk flexibility applies to unresolved modes. |
| Criterion targets, minimum/maximum, inclusion/exclusion lists | D/F | Only active preferences or requirements need applicable targets. Shared language has a mode. Height/weight use ranges. No implicit acceptable partner marital status. |
| Heritage, same tribe, skin tone, dress style, dress flexibility criteria | D/E | Optional, conditional on applicable data, consent and direction. Same tribe requires a declared tribe. |
| Minimum and maximum partner age | C | New applications visibly start at 18–110. Existing ranges stay editable. Validate bounds and order. |
| Private contact | A/C | Accept the saved/default contact if valid, otherwise request a contact for mutual release. |
| Interview introduction, extracted values, interview/assessment consent, 44-answer confirmation | A/D | Consent before processing. Review extraction as a batch. Fallback follows the existing service conditions. |
| Male portrait, female avatar or blurred photo, photo consent, clear-photo reveal | D/E/F | Male portrait needs verification or the manual moderation route. Female visual choice is optional. Photo permissions and reveal settings follow the selected photo path. |
| Readiness family scenario, next formal step, membership agreement | A | Preserve both scenario responses, distinct from earlier preferences. Ask a clarification (D) for a meaningful conflict. |
| Age declaration, terms, privacy, sensitive processing/publication, submission | A/D | Keep the applicable agreements explicit. Pending review is a resulting state. |
| Legacy Beena scenarios and optional story | E/D | Separate from the twelve personality answers. New registration does not require a second personality stage. |

## All 44 compatibility fields

Each paired row below has one self ID and its existing partner ID from the catalog. Self fields need an explicit or previously confirmed answer. In a row marked C, a letter maps to the same partner letter. Every omitted letter requires an explicit partner answer. Edited partner values take precedence. An interview suggestion that needs clarification blocks the deterministic default. The final 44-field receipt distinguishes inferred partner values from member selections.

| Stored dimension | C codes | Meaning |
|---|---|---|
| children_plan | A, B | Shared future children plan |
| residence_plan | None | Staying in one's current city gives no unique partner relocation answer |
| wife_work | A, B | Joint expectation about the wife's paid employment |
| marriage_timeline | A, B, C | First formal step |
| family_authority | A, B | Family role in joint decisions |
| financial_provision | A, B, C | Shared provision arrangement |
| domestic_labor | A, B, C | Shared household responsibilities |
| housing_arrangement | A, B, C | Separate home, temporary or long-term coresidence with family |
| social_rhythm | None | Social routine |
| mixed_gatherings | None | Social expectations |
| match_disagreement_style | None | Disagreement style |
| repair_after_conflict | None | Reconnection after conflict |
| faith_routine | A, C | Explicitly individual or shared worship routine |
| closeness_pace | None | Pace of emotional closeness |
| public_event_attendance | None | Public event preferences |
| parenting_approach | None | Approach to parenting |

The twelve A personality IDs are `social_energy`, `initiative`, `depth`, `openness`, `closeness`, `reassurance`, `support`, `planning`, `novelty`, `conflict_pace`, `directness` and `quiet_comfort`. Existing children, gender, city and age supply none of these answers.

## Eligibility and outstanding decisions

The residence catalog's partner B is «يمكنه الانتقال إلى مدينتي». A different city and a willingness to move are meaningful. For two recognized identical cities, valid residence answers already receive full residence agreement. Unknown locations or missing answers cannot establish that outcome. Independent housing is a separate household decision.

Both parties' actual ages must satisfy adult eligibility. The current server checks both preferred age ranges in practical fit. A range conflict can lower composite fit using the 0.85 multiplier. Discovery also has explicit candidate-age search filters. An out-of-preferred-range member can therefore appear. A committed edit changes the next fit calculation. Client refresh, moderation timing and live recommendation propagation were not measured. Treating age preference as a hard reciprocal filter would change the matching contract.

Earlier drafts do not identify whether an 18–65 range, zero children or a family-involvement choice came from an old default. Keep these values editable and avoid rewriting member history. Adding an outcome-based residence answer would require a versioned catalog and matching decision. The current correction works with the existing codes.
