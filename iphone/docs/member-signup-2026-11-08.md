# Member signup without an email step

At the owner's request, ordinary member registration currently creates a real
Supabase Auth account without requiring delivery or opening of a confirmation
email. The homepage uses the actual member flow; the existing private pair stays
separate at `?test=1` with its existing password rules.

The browser sends email, password and explicit age/terms/privacy choices to the
`member-signup` Edge Function, then signs in through normal Supabase password
authentication. The service key remains inside the Edge Function. No credentials
or request bodies are logged, and duplicate/reserved addresses receive the same
neutral failure. Existing accounts are never overwritten or confirmed by this
endpoint. Invalid origins, malformed/oversized requests and exhausted per-email,
per-network or global limits fail closed. Rate keys contain secret-scoped digests;
raw contact addresses and IPs are not retained in the limiter.

`email_confirm: true` enables managed password login; it is **not evidence of email
ownership or identity**. Service-owned Auth `app_metadata` stores
`signupKind: member_self_claimed_email` and `emailOwnershipVerified: false`, along
with the signup choices/version/time. No verified badge is granted. Final profile
consents remain a separate onboarding step.

The database rejects self-claimed creation/changes to reserved staff addresses.
Staff identity checks consult current Auth metadata and reject self-claimed
accounts even if an invitation is created later, a stale token claims
otherwise, or MFA is enrolled. Normal verified staff invitation claiming and MFA
requirements remain intact. No project-wide Auth confirmation settings change.

Member profiles still need onboarding, staff review and an active entitlement
(including an explicit admin-granted pilot entitlement) before discovery and
matching. Signup does not approve members or grant free access.

## Release order

1. Apply `20261108151939_member_signup_without_email_confirmation.sql` to Nisfayn.
2. Deploy `member-signup` with JWT gateway verification disabled. The handler
   validates the request itself; its preparation RPC is service-role-only.
3. Deploy the member frontend using `npm run build`.
4. Verify a disposable synthetic member through signup, draft save, logout,
   password login, draft resume and self-deletion without approving it.

Default allowed origins are `https://nisfayn-preview.vercel.app` and
`capacitor://localhost`. Additional exact HTTPS origins can be supplied through
`MEMBER_SIGNUP_ALLOWED_ORIGINS` as a comma-separated deployment setting.

Signup has no SMTP dependency. Existing email-based password recovery still
needs a working sender and approved recovery redirect; this change does not claim
delivery has been configured or tested. Native signup and real device behavior
still need their separate device verification.

Validation covers consent/input/origin boundaries, fail-closed rate/preparation
errors, server-owned metadata, duplicate handling, ordinary onboarding eligibility,
reserved-email rejection, later-invitation denial, and retained verified-staff MFA.
