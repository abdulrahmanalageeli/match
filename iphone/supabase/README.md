# Marriage app database and functions

Run the Supabase CLI from the **iphone directory**. This Supabase workdir belongs exclusively to the new marriage project. Its migration history, auth identities, contacts, matching data and Apple purchases are independent of the event app. The only seed data are catalog codes and Arabic labels.

## Database shape

| Area | Relations inside the private `marriage` schema |
| --- | --- |
| Account and application | Members linked to `auth.users`, profiles, cities, contact details, preferences, consent versions and consent events, operator review history |
| Matching | Interests, member interests, questions, allowed question options, member answers, private introductions and one consent decision per participant |
| Membership | Apple original transaction ownership and signed individual transactions, including expiry and revocation |
| Discovery and safety | Explicit member requests, mutually accepted message threads, blocks and operator reports |
| Chat delivery | Messages with idempotent sender keys; a private read position per participant and accepted thread |

The public Data API exposes only purpose-built RPCs. All private tables use RLS and deny member table privileges. Public RPCs run as invokers and delegate to narrowly privileged private routines. Each member read/write checks its live Supabase Auth session. Contact data is returned only to a qualifying participant after reciprocal acceptance. The service role is reserved for the operator and cryptographically verified Apple callbacks.

## Local verification and dedicated deployment

1. With Docker available and Supabase CLI v3 installed, run `supabase start` and `supabase db reset` in `iphone` for a disposable local stack. For database-only tests without Docker, run `npm ci` then `npm test` in `iphone/supabase/tests`. These tests run the actual migration SQL in PostgreSQL/WASM and provide a minimal Auth fixture for role and session checks.
2. Set Auth email verification and redirect URLs to the marriage service's own verified web origin. Enable the Data API for the `public` schema only; keep `marriage`, `auth` and any operator secrets private. If using the mobile shell with email confirmation, configure an allowed confirmation landing page; users can confirm there and sign in to the app.
3. Check the exact new project reference before any hosted change. With CLI v3, `supabase db push --dry-run --remote=NEW_MARRIAGE_REF` previews the migrations; `supabase db push --remote=NEW_MARRIAGE_REF` applies them after confirmation. Use `supabase migration list --remote=NEW_MARRIAGE_REF` and `supabase db advisors --remote=NEW_MARRIAGE_REF` to inspect the result.
4. Deploy `membership-offer`, `verify-membership`, `apple-notifications` and `reconcile-membership` after applying the launch offer and membership lifecycle migrations. Use their stored `verify_jwt=false` configuration. The member endpoints check Supabase Auth and the session. Notifications require Apple's signature. The reconciliation worker authenticates the scheduler independently.
5. In Edge Function secrets, set `APPLE_STORE_ENV` to **Sandbox** or **Production**, `APPLE_ROOT_CERTS_BASE64` to comma-separated base64 DER Apple trust anchors from [Apple PKI](https://www.apple.com/certificateauthority/), and `APPLE_APP_ID` to the numeric App Store app ID for production. The functions use the platform's Supabase URL, publishable key and secret key (or legacy platform keys). Never bundle service keys in the iPhone app.
6. In App Store Connect configure bundle `com.blindmatch.marriage`, products `com.blindmatch.marriage.monthly.men` and `com.blindmatch.marriage.monthly.women` (see [subscription setup](../docs/APPLE_SUBSCRIPTIONS.md)), and notifications v2 at `https://NEW_MARRIAGE_REF.supabase.co/functions/v1/apple-notifications`. Keep sandbox and production credentials/endpoints isolated. Confirm purchase, renewal, refund, expiration and restore using real Apple sandbox transactions. The client submits the signed JWS to `verify-membership`; that function validates Apple signatures, bundle, product, environment and account binding before recording a transaction. Missing credentials fail closed.
7. Set Edge secrets `APPLE_IAP_PRIVATE_KEY` (App Store Connect In-App Purchase private key in PEM format), `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID` and a random `APPLE_RECONCILE_SECRET`. In Supabase Vault set `wudayn_apple_reconcile_secret` to the same secret and `wudayn_apple_reconcile_url` to this project's HTTPS URL ending in `/functions/v1/reconcile-membership`. The migration registers the five-minute pg_cron job. It claims eight due Apple originals per run, retries failures after 15 minutes and schedules successful checks six hours later. Inspect pg_net responses and worker logs for failed checks. Keep production and sandbox settings in their respective projects.

The seven-day pilot defaults off. Enabling it in `marriage.testing_signup_config` makes the offer available to approved first-time members with a verified mobile number. Acceptance is explicit, once per member and verified number, and never changes moderation status. Disabling the offer preserves issued access until its expiry. Historical trial participants with a verified number at migration time are included in the repeat-claim check. Previously deleted records cannot be backfilled. Review past pilot approvals against moderation records separately.

## Operator workflow

New applications record the version and time of the honesty acknowledgment privately. Automatic admission checks the stored birth date, 18+ declaration, verified phone, assessment, privacy and readiness agreements, and required portrait. The birth date and adulthood declaration are self-reported. An applicant who passes can enter immediately, including on the free tier.

Reviewers and owners can open **متابعة التسجيل** for follow-up. A verified phone or device shared with a suspended account, or an open safety report, flags an admitted member for review. Check the underlying evidence and record a reason when closing the flag. Closing a flag preserves access. Confirmed misconduct can be handled through the existing suspension workflow. Existing suspensions, reviews explicitly requested by staff, and corrections to previously submitted profiles retain their own safeguards.

Use an authorized SQL Editor/database operator, or call the service-only public RPCs from a trusted server. The following examples use symbolic member IDs.

```sql
select * from public.marriage_review_queue();
select public.marriage_review('MEMBER_UUID','approve');
select * from public.marriage_candidates('MEMBER_UUID');
select public.marriage_assign('MEMBER_UUID','CANDIDATE_UUID');
select id, reported_id, reason, created_at from marriage.reports
where resolved_at is null order by created_at;
select public.marriage_review('REPORTED_MEMBER_UUID','suspend');
update marriage.reports set resolved_at=now() where id='REPORT_UUID' and resolved_at is null;
```

Changing publicly visible profile details returns an approved application to review. Updating matching-only preferences rechecks recommendations while preserving accepted conversations, subject to safety and membership rules. Purchased transactions remain intact. Both participants must have active subscriptions for discovery, introductions and messaging. Pausing search closes active connections independently of Apple billing.

The member-requested account deletion migration defines `marriage_delete_account()` for an explicit request by the authenticated member. Installing it performs no deletion. Calling the function revokes that member's Auth sessions, removes the Auth user and cascades their member data. It does not cancel an Apple subscription.

## Client calls

The chat delivery migrations use a private Realtime channel per authenticated member (`marriage:member:<auth uid>`). Database broadcasts contain no message text, peer identity or read position. On a signal the client fetches through authorized RPCs; it polls while visible if the connection drops. `marriage_thread_page` reads up to 50 messages at a time. `marriage_mark_thread_read` advances only the caller's cursor; `marriage_unread_count` returns their total. A block, pause or expired membership prevents protected reads. This channel updates the open application; it does not send iOS lock-screen push notifications.

Authenticate via Supabase Auth, then use `marriage_state()`, `marriage_catalog()`, `marriage_apply(payload)`, `marriage_pause(paused)`, and `marriage_respond(proposal_id,decision,reason)`. The current iPhone assessment submits `assessmentVersion: "marriage-v1"` and `consentVersion: "2026-11-06-assessment"`. Profiles can include optional `interestIds`, paired `surveyAnswers`, `hardRequirements` and `priorityCategories`. The legacy client keeps its earlier consent version for its original inputs. See the [closed-pilot rules and metrics](../docs/closed-pilot.md).

The discovery migration defines `marriage_discover`, `marriage_request`, `marriage_inbox`, and member-owned request/message operations. Mutual discovery requests unlock private in-app chat; a mutual curated introduction releases the contact that each member explicitly supplied for that purpose. From the repository root run `node --test iphone/supabase/tests/*.test.mjs`. With Deno installed, run `deno check supabase/functions/verify-membership/index.ts supabase/functions/apple-notifications/index.ts` and `deno test supabase/tests/edge_test.ts` from `iphone`. The tests cover role isolation, forged receipts, signed-out sessions, mutual contact visibility, bilateral matching, cross-feature block handling and chat authorization.

## Reported-message screening

Members can opt in when reporting a specific incoming message. The database checks the selected excerpt locally for a narrow set of explicit threat statements. A local match prioritizes the existing staff report. The optional classifier receives only a categorical finding and whether the selected report category agrees. Its maximum action is a one-hour restriction on new requests with immediate access to human review.

The admin deployment schedules `/api/conduct-screening` every five minutes. Set `WUDAYN_CONDUCT_CLASSIFIER_ENABLED=true`, `WUDAYN_CONDUCT_MODEL_ENDPOINT` (an approved HTTPS Chat Completions endpoint), `WUDAYN_CONDUCT_APPROVED_MODEL` (the exact version returned by that endpoint), and `WUDAYN_CONDUCT_MODEL_KEY` to enable it with the existing cron and database credentials. Missing configuration, unsupported output, and provider failures leave the report available for human review. No historical messages are scanned.

For a separately operated approved worker, configure a private `WUDAYN_CONDUCT_SIGNING_SECRET` of at least 32 characters. POST `{command,ticket,model,decision}` to `/api/conduct-classifier`. Use a fresh UUID ticket for `claim`, then the same ticket for `finish` within three minutes. A claim uses a null decision. A finish accepts `review` or `hold`. Supply the Unix seconds in `x-conduct-timestamp` and hex HMAC-SHA256 of `JSON.stringify(['conduct-v1', timestampString, command, ticket, model, decision])` in `x-conduct-signature`. The included scheduled worker uses the database queue directly.

## Publishing and launch administration

Apply the Wudayn migrations in filename order before deploying the member and staff clients. The owner dashboard opens on Riyadh-time launch metrics. The measurement start shown in the dashboard is the first date for the new instrumentation. Individual follow-through labels stay disabled until their calibration gate is met.

The publishing page previews the audience, schedules content in Riyadh time, and supports correction, withdrawal and version rollback. Push recipients must enable device notifications and explicitly opt in to Wudayn news. Use the registered test device selector to verify the production APNs path. A provider acceptance records handoff to the provider. The open count records an authenticated opening in Wudayn.

Native publication targeting reads CFBundleVersion. Set VITE_WUDAYN_WEB_BUILD to the positive numeric release number for a separately versioned web bundle. Unsupported settings fall back to bundled copy. The two pause controls affect new Luna searches and new launch offer reservations. Removing a setting restores the previous active setting or the shipped default.

### Member updates and maintenance

1. Apply the member release policy migration before deploying the clients. Both platforms start with minimum and recommended builds of zero and maintenance off. A fresh launch needs a successful policy check before entering the member app.
2. Ship the first gate-enabled iPhone and web builds with those defaults. Use a new integer `CFBundleVersion` or `VITE_WUDAYN_WEB_BUILD` for each release (1–999999). Previously distributed binaries and already-open web bundles that predate the gate cannot display it.
3. Once the replacement build is available to members, open **النشر والتحديثات → إصدارات التطبيق والصيانة** as an MFA-verified owner. Select iPhone or web. For iPhone, check the listing opens Wudayn in the intended storefront. Preview the recommended or required threshold, then confirm. The minimum is inclusive.
4. For an outage, select a maintenance duration of up to 24 hours. The screen shows the expected return in Riyadh time. The admin site stays accessible. To reopen early or undo a mistaken version requirement, preview and confirm the rollback in the same panel. Open member sessions recheck on foreground, reconnect, and every minute while visible.

Deploy the admin recovery endpoint with WUDAYN_MEMBER_RECOVERY_URL pointing to the member recovery route registered with Supabase Auth. The staff console sends recovery mail through the verified account channel. Case deletion requires member confirmation and a fresh staff MFA challenge. Member corrections and private exports open inside the member's authenticated session.
