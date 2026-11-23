# Wudayn launch functionality verification

23 November 2026 · Local release checkout · Synthetic accounts only

All 32 approved capabilities have passing behavioral checks. The test runs recorded 89 passing Node tests, two browser workflows and both TypeScript checks. One additional legacy demo scenario failed and remains reproducible. PostgreSQL ran in PGlite. The hosted Auth tables, sessions, push provider responses and model responses were simulated. The browser workflows used the shipped React components and the migrated database.

| # | Approved capability | Passing local observation |
|---|---|---|
| 1 | Launch overview | Riyadh date windows, custom dates, gender breakdowns and exclusions matched a known population. |
| 2 | Unfinished signups | Profile-less accounts appeared in search. Stage, last step, visibility, tier and 24-hour/seven-day stalls were checked separately. |
| 3 | Registration funnel | Reached, completed, resumed and error totals matched applicable cohorts. Luna recorded grounded answers carried into structured questions, including zero. |
| 4 | Activity and retention | Repeated actions counted once per active member. Day-one and day-seven return rates used the eligible approval cohorts. |
| 5 | Trials, paid access and opt-outs | Free choice, checkout, reservation, trial, conversion, expiry, refunds, billing retry and grants reconciled with seeded transactions. An early upgrade ended the trial count. A later paid renewal did not create another conversion. |
| 6 | Discovery and introductions | Zero eligible candidates, time to first outgoing/incoming request, acceptance and signed communication were measured on seeded pairs. |
| 7 | Launch problem queue | A simulated receipt/access mismatch appeared in the queue and opened the affected account list. Tests also covered registration incident grouping. |
| 8 | Find and inspect accounts | Exact account and verified-contact lookup, profile-less members, sign-in methods and case-authorized contact disclosure. Account lookup through the admin screen reached the real SQL result. |
| 9 | Membership repairs | Extended a grant from its existing end, scheduled access after paid entitlement, revoked a grant and rechecked a recorded receipt. A repeated command preserved the original result. |
| 10 | Profile and identity corrections | Compared old and new values, reopened an exact answer and enforced member proof for identity or a replacement phone. |
| 11 | Recovery and selective reset | Verified-channel recovery handoff, session revocation, photo/Luna reopen and saved-draft resumption. Tested provider acceptance and failure with a controlled transport. |
| 12 | Chat and Luna investigations | Assignment, selected surrounding messages and evidence expiry constrained access. Only opted-in, confirmed Luna summaries were visible, and consent withdrawal removed access. |
| 13 | Suspend, restore and delete | Confirmed the affected member, required fresh owner MFA and member authorization for deletion, and independently tested suspension, appeal and restoration. |
| 14 | Case ownership | Assigned and replied to cases, recorded internal notes, verified actions and prevented another support worker from taking over an assigned case. |
| 15 | Staff permissions and audit | Tested owner, support, reviewer and moderator permissions, MFA, searchable audit entries, session validity and revocation. |
| 16 | Missing profile after social sign-in | Distinguished Google and email identities, located incomplete accounts and rejected sending password recovery to an unverified alternative. |
| 17 | Discovery visibility | A member-authorized check measured one eligible result before and zero after the actual age filter. Stored the counts without the search values or identities. |
| 18 | Accepted pair unable to chat | Distinguished pending and accepted requests, both signatures, slot use and blocked pairs. The permitted repair notified both sides. |
| 19 | Stale Luna/profile information | Verified dated field confirmation, latest pair recalculation, optimistic Luna revisions and rejection of stale writes or deletion after staff repaired a draft. |
| 20 | Returning reported accounts | Linked prior safety cases for staff review, kept raw identifiers private, and checked the human appeal and decision path. |
| 21 | Incident response | Grouped affected members by platform/build and verified timestamps and drilldown. Pausing trial offers preserved existing reservations. Retried delivery without a duplicate send after a lost acknowledgement. |
| 22 | Notification troubleshooting | Distinguished queued, provider-accepted, failed and expired jobs. A missing receipt did not verify delivery or close the case. |
| 23 | Data and photo privacy | Only the member could retrieve their export. Tested portrait removal, private-photo access withdrawal, grant history and family consent. |
| 24 | Verify a support repair | Case closure stayed blocked until the relevant postcondition passed. Tested wrong accounts, absent delivery evidence and confirmed export. |
| 25 | Immediate and scheduled push | Preview counted one recipient with two devices. Tested consent revocation, timed dispatch, version and platform targeting, leasing, accepted/failed jobs and unique opens. |
| 26 | In-app announcements | Published through the admin composer, opened the announcement as a member, followed its destination and verified correction, expiry and withdrawal. Existing notices stayed visible with news push disabled. |
| 27 | Remote product updates | Checked staff-only preview, compatible builds, audience rollout, supported copy, version restore and service pause/resume. A busy inbox retained active settings and an older announcement opened from push. |
| 28 | Warning and تعهّد | Staff previewed and issued the exact wording. Reading a pledge left the restriction in place until the member explicitly accepted. |
| 29 | Temporary restriction | New requests were blocked, an existing chat could continue, and a new request succeeded after expiry. The Arabic screen showed the scope and Riyadh end time. |
| 30 | Automated restriction and human appeal | A consented reported message entered the screening queue. A controlled model result led to a temporary hold. A member appealed, staff reviewed it, and the decision appeared on screen. Tested failure, replay and suspended-member access. |
| 31 | Per-member interaction statistics | Checked seven- and 30-day reach, two-way conversations, replies within 48 hours, mutual steps, family introductions and respectful closures. |
| 32 | Follow-through labels | Tested 57 conversation pairs, sparse data, the 48-hour boundary, sample-size gates, and owner activation/deactivation. This checks calculation, not predictive validity. |

## Release checks that remain open

- A real iPhone push from the deployed worker, including physical-device display, tap and the hosted realtime connection.
- An actual Apple purchase and callback, Google/Apple sign-in, SMS delivery, and receipt of a recovery email.
- The deployed classifier endpoint, provider quality and production scheduler. Follow-through labels also need real-world calibration before activation.
- One historical demo-only test fails in PGlite when its tester submits a report while closing a conversation. It reproduces on the November 18 relationship-consent migration, before these launch changes. The separate current admin test for an already-filed report passes. The original failing scenario is retained.

## Reproduce

From `iphone/`, run the following scoped commands. The first command covers 80 tests, the next two cover three and six respectively. Both browser scripts use local Chrome. Set the Playwright module override in the script when running in another environment.

```sh
node --experimental-strip-types --test --test-concurrency=3 \
  supabase/tests/admin.test.mjs supabase/tests/support.test.mjs supabase/tests/push-wakeup.test.mjs \
  supabase/tests/phone-reuse.test.mjs supabase/tests/assessment-private-refresh.test.mjs supabase/tests/membership-environment.test.mjs \
  admin/server/push-worker.test.mjs admin/server/apns.test.mjs admin/server/webPush.test.mjs \
  admin/server/signupSms.test.mjs tests/member-password-recovery.test.mjs tests/member-recovery-entry.test.mjs \
  tests/web-push.test.mjs supabase/tests/launch-analytics.test.mjs supabase/tests/launch-cohorts.test.mjs \
  supabase/tests/launch-publications.test.mjs supabase/tests/publication-lifecycle.test.mjs supabase/tests/member-conduct.test.mjs \
  supabase/tests/member-operations.test.mjs src/onboarding/accountDraftStorage.test.mjs admin/server/conduct-classifier.test.mjs \
  admin/server/member-recovery.test.mjs tests/interview-opening-results.test.mjs

node --test --test-name-pattern='persistent tagged testers|real member edits|current admin queue' supabase/tests/admin-controls.test.mjs
node --test --test-name-pattern='family admin review|administrative approval never|drafts belong only|personal-data export|optimistic revisions|staff get only explicitly' supabase/tests/family-bridge.test.mjs supabase/tests/onboarding-drafts.test.mjs supabase/tests/guided-interview.test.mjs
node tests/launch-console.browser.mjs
node --experimental-strip-types tests/conduct-admin-member.browser.mjs
npm run typecheck
npm --prefix admin run typecheck
```

To reproduce the separate failure, run `node --test --test-name-pattern='dummy safety reports' supabase/tests/admin-controls.test.mjs`.
