# Wudayn guided compatibility interview

The optional **جلسة التوافق** turns a member's own answers into editable preference, personality, and Beena suggestions. It is an input method for the existing assessment, not a new matching formula or an identity, honesty, mental-health, or admission assessment.

## Model and conversation

`api/interview.mjs` calls the dedicated service in `api/_lib/interview.mjs`. Both conversational extraction and final review use **`gpt-6-luna`**, independently of the older generic assistant's model setting. The server uses the existing `OPENAI_API_KEY`, strict JSON output, `store:false`, low reasoning effort, an 18-second provider timeout, and no provider retries. It supplies no tools, session tokens, member IDs, profile photos, private match conversations, or other members' data to the model.

Six themes cover timing, disagreements, closeness, family, work/finances, and everyday life. The server limits the interview to twelve answers and two questions per theme, with a typical target of eight to twelve answers. Members can skip, review early, continue from review, or return to the existing questions. Structured factual registration remains separate. Personality uses the existing twelve statements and A–E self-report scale inside this conversation; contextual follow-ups target uncovered areas without filling gaps by guesswork.

Each extraction is constrained to the existing preference, personality, and Beena catalogs. A proposal includes its field, own-versus-desired-partner interpretation, valid option codes, and literal supporting excerpts from submitted answers. The server rejects unknown fields, invalid codes, invented excerpts, and evidence from skipped turns. Personality interpretations must describe the member's own stated behavior and frequency, never writing style, demographics, or desired partner traits. Uncertain interpretations are marked for review and excluded from the clear-answer selection shortcut. A fluent or schema-valid output is not proof that its interpretation is correct; the member reviews it before use.

## Confirmation and compatibility

The member can include, exclude, and edit proposed answers. Confirmation only applies those selections to the current onboarding/profile draft. **The normal final profile save is still required** to publish the changed assessment and refresh matching, explanations, and chat starters through existing application behavior.

New-member onboarding presents the interview and direct questions as alternative input paths. Confirming interview choices immediately merges them into the private onboarding draft and requests its normal account save. Preference, personality, and Beena questionnaires then show only valid unanswered perspectives, including the missing half of a self/partner pair. Restored drafts use the saved answers to reconstruct this coverage; no separate path marker is required. Members can explicitly review all answers, set optional priorities/requirements, or add a private Beena story. A new interview confirmation resets the remaining-question navigator, without clearing any answers. Personality interpretations have their own review group showing the exact statement, editable scale choice, and original evidence. The personality chapter offers continuing the interview or optional direct questions for remaining items; a complete set shows a saved summary without another questionnaire. Structured registration fields remain explicit.

The interview never silently creates mandatory partner requirements, unconfirmed personality answers, public biographies, public Beena stories, or numerical compatibility scores. Unknowns remain unknown. Existing assessment completeness/version gates still control displayed percentages, so a partial interview need not produce a visible percentage. Already-entered answers outside the selected changes remain intact.

Readiness notes and clarification points are separate self-reported outputs. They cannot approve, reject, suspend, or certify a member. Sharing their limited summary with membership reviewers is optional and off by default. The member can withdraw sharing or delete the session. Deleting the session does not undo answers the member has already saved to their profile; those remain editable in the existing assessment.

## Persistence and privacy

The `marriage_interview` RPC derives ownership from the current authenticated member session or a valid existing private tester session. New members can use it before their public profile or membership review is complete. Abdulrahman and Reham have isolated interview records. No caller-supplied owner identifier selects another person's record.

An interview-specific consent version, `wudayn-interview-v1`, is recorded before starting. Transcripts, drafts, evidence and proposals stay in private database records. They are not stored in browser storage, placed on public profiles, or shared with matches or family chats. The database retains the session for thirty days after its last save; expired reads are hidden and cleanup removes expired records. Member export includes the private record, and account deletion cascades to it.

Only active owners or membership reviewers with a current MFA session can read an explicitly shared, confirmed readiness/clarification summary. The projection omits transcripts, evidence quotes, and preference proposals and records an audit event. It is labeled self-reported. Ordinary staff roles and the service role cannot directly read the private tables through the API.

`store:false` does not establish zero provider retention. OpenAI's default abuse-monitoring retention and any applicable processor/transfer arrangements remain distinct from the application's thirty-day database retention. Saudi database location alone does not establish Saudi AI processing. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) and the application's privacy notice.

## Recovery and operating limits

Draft text is privately autosaved. A submitted answer is saved before contacting Luna. Optimistic revisions prevent a stale browser or late model reply from overwriting newer state; request IDs prevent duplicate answers on network retries. Revisions remain distinct across delete/restart operations.

Provider failure or a reached quota preserves the transcript and offers guided questions plus a retry. The UI distinguishes pending analysis from completed interpretation. New answers clear older derived conclusions while awaiting reanalysis, so a correction cannot leave a stale interpretation available for confirmation. Confirmation and review sharing are blocked while analysis remains pending. Members can still use the ordinary questionnaire.

Durable limits are six model reservations per minute and forty per UTC day per account, plus two thousand per UTC day globally. They survive session deletion and model failures. Skips, loading, drafting, and confirmation do not call the model. Prompt version `wudayn-interview-2` adds personality; both prompt versions remain valid in storage. Existing completed sessions can use «تحديث قراءة الجلسة» to reanalyse their saved words without deletion or automatic profile changes. Prompt, model and document versions are saved with the session; raw answer text and provider error contents are not logged by this endpoint.

## Verification and rollout

Run the focused backend, mapping, and database tests, then the app typecheck/build:

```text
node --test tests/interview-api.test.mjs
node --experimental-strip-types --test tests/interview-confirmation.test.mjs tests/interview-ui.test.mjs
node --test supabase/tests/guided-interview.test.mjs
npm run build
```

Database tests cover new and existing member access, private tester isolation, revoked sessions, consent, optimistic revisions, private table grants, budgets, shared summary authorization, expiry, export, and account deletion. Backend tests cover provider configuration, bounded requests, exact evidence, code validation, timeout recovery, replay, skips, review/resume, user-edited confirmation, and stale-interpretation prevention.

Before broad promotion, check real Luna output with synthetic Saudi-Arabic cases: a clear timeline, uncertainty, a correction, different self/partner preferences, multiple acceptable Beena approaches, a skipped answer, a prompt-injection attempt, and a deliberately ambiguous family/work situation. Review interpretation accuracy and naturalness with Saudi speakers; measure response latency and correction rates. Keep simulated profiles and test answers out of claims about real member outcomes. Compare completion and mutual progression with the existing questionnaire before claiming improved matching.

After the original Nisfayn interview migration, apply `20261113054335_guided_interview_personality.sql` before deploying personality output. It expands only the private document validator, preserving stored sessions and authorization. Then deploy the frontend API/UI and verify the live flow. Bundled native UI changes require the next iPhone build; publishing the website does not replace an already-installed native bundle.
