# Profile questions and optional Beena

Implementation decision, 18 November 2026. Code and tests do not establish hosted deployment.

| Information | Collection | Public presentation | Compatibility / deep report |
| --- | --- | --- | --- |
| Current city | Existing basic form / explicit reviewed Luna fact | Profile location | Existing residence compatibility |
| مدينة الأصل | Optional background field / explicit reviewed Luna fact | Profile Details, separate from residence | Excluded from scores and deep-report evidence; never infer tribe or nationality |
| Wedding size/budget, child timing, housing arrangement, expense sharing | Optional `خطط الحياة الزوجية` form; Luna captures explicit statements without extending its required interview | Profile Details and pre-save review | Context in a mutually consented deep report, not new score dimensions or inferred hard requirements |
| Existing 32 reciprocal preference answers + 12 personality answers | Luna with explicit review; established fallback forms | Existing aggregate compatibility and interpretation | Existing deterministic scoring and deep-report evidence |
| بيننا written Q&A | Optional, member-written; one selected question and one saved answer | Question and answer in About only when `story.share` is enabled and moderation allows | Not scored or sent to the deep-report provider |
| Legacy private Beena scenarios | Retained stored data; no questionnaire entry in the UI | No percentage, comparison panel, or score-change notices | Legacy backend calculation retained for compatibility; excluded from deep report |

Reuse `src/compatibility/marriagePlans.ts` for labels, keys and UI. The interview catalog and SQL validation must agree with it. `marriageBasics` carries the new optional fields; SQL stores them in `member_basics.life_plans`. Do not overload existing questionnaire codes with different meanings. A wish to have children does not specify when; budgeting style does not specify who pays.

Beena reuses its existing `story` storage and publication review. Changing the selected question edits the single saved Q&A; it does not create a collection. Existing stories and private assessment data remain intact; the private assessment UI and third percentage have been retired. Text remains private by default, and hiding/removing an answer applies through the normal profile save. Multiple public Q&As would require a separately scoped storage/consent change.

Migration `20261118054738_public_marriage_plans.sql` must be applied before releasing clients that save these fields. It also extends server-selected deep-report evidence with the four plan fields, requires old pending invitations to be reissued under the expanded explanation, and retains evidence-change invalidation. No live migration was run as part of this work. Deploy API/UI changes together with that migration. Native bundled UI needs a new iPhone build.

Validation: member typecheck; onboarding draft and profile-capture tests; interview-profile API tests; Beena model tests; deep-report API/database tests; `supabase/tests/marriage-plans.test.mjs`. The local demo fixture `tests/fixtures/beena-qa.html` exercises opt-in profile sharing. Browser checks do not replace physical-device verification.
