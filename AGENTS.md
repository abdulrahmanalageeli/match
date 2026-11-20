# Working in this repository

Prioritize speed and direct execution. Locate the relevant implementation, make the smallest correct change, and verify it in proportion to its risk. Preserve existing architecture, styling, behavior, and unrelated working-tree changes.

- For copy, spacing, colors, icons, and other localized edits, go directly to the component. A focused check is sufficient.
- For a small feature, inspect the few related files and test the affected flow. Inspect the UI visually when the change benefits from it.
- Investigate changes to authentication, payments, schemas, migrations, security-sensitive behavior, or shared state before editing.
- Resolve routine implementation choices independently. Prefer the simplest approach consistent with the codebase. Avoid unrelated exploration, broad refactors, one-off abstractions, and full-suite runs for tiny changes.

## Wudayn — Luna compatibility assessment

Current registration collects 32 practical answers (30 when parenting is inapplicable) and 15 personality self-reports. Historical applications can still use the 44-answer contract. Keep each version’s catalog IDs, option codes and final confirmation. The optional five partner ranges use private partner-prefixed personality keys outside the required receipt. Only explicitly selected domains contribute. Two complete current profiles with a preference in each direction yield an aggregate reciprocal range-fit score. Keep client and SQL scoring in sync. See `iphone/docs/assessment-questions-and-weights.md` for sources, item weights and evaluation limits.

Members browse all profiles they are eligible to see with the existing pair-specific compatibility percentages and choose whom to contact. Keep every eligible profile reachable through pagination regardless of score. Member-selected filters and sorts apply to the directory. The planned entry point and optional validation are documented in `iphone/docs/matching-model-and-feedback.md`.

Use voluntary feedback to evaluate the displayed scores. Keep individual ratings private, share willingness to continue only upon mutual agreement, and keep missing outcomes unknown. `iphone/docs/blindmatch-evidence.md` retains the historical pairing experiments. The planned directory uses member-initiated contact.

The local enrolled pilot starts its clock at mutual communication agreement. Offer optional in-app forms at 48 hours and seven days. Closing an accepted match supersedes them with a private exit form for seven days. Blocks and reports suppress collection. Keep native controls, reduced-motion support, and unanswered or uncertain outcomes. `iphone/docs/connection-feedback-training.sql` joins frozen questionnaire features to separate day-two, week and exit observations. The branded preview simulates one event at a time. Formal-step and annual follow-ups are opt-in designs only.

The week-v2 check-in collects contact days, marriage potential, interpersonal fit, practical fit and one optional broad influence. No contact ends the form after one question. Preserve the instrument version and each respondent’s uncertainty. Exit reviews retain the more specific topics and actual family-contact question.

The prospective marriage study is documented in `iphone/docs/marriage-study-protocol.md`. The offline evaluator uses the restricted baseline cohort, independent partner reports and a member-disjoint temporal holdout. Keep experimental models separate from member-facing percentages and preserve ordinary closures in the longitudinal cohort.

The notification feed opens the active check-in directly. For enrolled introductions, the two-day and weekly notices use separate read states and disappear after that member answers or the window closes. Fetch due notices with the member-scoped `marriage_conversation_pilot_notices` RPC.

### Which answers Luna can carry forward

- Luna onboarding starts with the free-text introduction in `opening-prompts.json`. The example explains carry-forward and closes 10 seconds after opening. Ask the optional open-ended next-step question only when the introduction lacks a grounded next step. Keep the private reflection editable and separate from compatibility scoring. A skip preserves the attested transcript and introduces no additional model call.

- Start with `iphone/api/_lib/interview.mjs` and `iphone/api/_lib/interview-grounding.mjs`. An exact transcript quote establishes provenance. The suggestion also needs support for its field, subject, and option. The regression example is «بناء أسرة» (“building a family”), which cannot support `personality:depth:self = E`.
- Recognized complete statements can be checked locally. Other eligible candidates share one independent catalog check per analysis. The checker receives the consent-filtered transcript and catalog options, without the first model’s proposed codes. It must independently agree and supply supporting evidence. Ambiguity, disagreement, an unavailable checker, or exhausted quota leaves the field for manual selection.
- Keep independent clauses separate. An unresolved residence preference can coexist with an explicit children preference. Never copy a self answer into the desired-partner field. Preserve consent and redaction rules, and keep interview quotes private.
- `iphone/src/interview/types.ts` defines the snapshot’s `carryForwardIds`. `InterviewPanel.tsx` uses that list to admit suggestions and gives saved manual choices precedence. A raw proposal or coverage count alone cannot skip a field.

### Card interaction

`iphone/src/interview/HybridAssessment.tsx` shows unresolved fields during forward navigation. A deliberate choice that completes a card advances to the next incomplete card. Keep Back, individual corrections, editable final review, and protection against repeated taps. Members can inspect the evidence or save pending suggestions as a batch without an extra required confirmation.

`iphone/src/interview/AnswerScale.tsx` also serves other onboarding screens. Its deliberate-commit behavior is opt-in for Luna. Arrow keys preview a score. Enter, Space, the explicit commit button, or a completed pointer selection records it. Preserve keyboard focus, recorded-answer feedback, and reduced-motion behavior when editing the cards or `hybrid-assessment.css`.

### Focused verification

Run the relevant commands from the repository root when changing this flow.

```sh
node --experimental-strip-types --test iphone/tests/interview-api.test.mjs iphone/tests/interview-profile-api.test.mjs iphone/tests/interview-ui.test.mjs iphone/tests/required-assessment-ui.test.mjs
npm --prefix iphone run typecheck
node iphone/tests/interview-hybrid.browser.mjs
```

The mobile browser fixture counts one text entry or control activation as one action. The original runs measured **63** actions with zero suggestions and **62** with one synthetic suggestion. The updated runs measured **47, 46, and 44** with zero, one, and three supported fixture suggestions respectively. All three submitted identical sets of 44 answers. The accompanying targeted run passed 123 tests and TypeScript checking.

The browser fixture mocks the interview API and writes screenshots under `iphone/.tmp/interview-hybrid/`. Use it to verify action counts, correction persistence, rapid taps, scale input, and narrow-screen layout. Live-model accuracy, provider latency, and human completion time require separate measurements.
