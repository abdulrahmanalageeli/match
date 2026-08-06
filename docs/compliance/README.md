# Privacy and cybersecurity control register

Baseline date: 2026-08-06. Scope: BlindMatch participant web application, administrator consoles, Supabase, Vercel, Twilio and OpenAI.

This repository implements the technical controls. Legal authorization also depends on completing the owner actions below; source code alone cannot certify PDPL or NCA compliance.

## Implemented technical controls

- Explicit, versioned acceptance of terms and privacy notice; marketing consent is separate and optional.
- OTP identity verification for phone recovery and event entry. Phone-only token disclosure and default administrator passwords are disabled.
- Server-mediated database access using the Supabase service role; anonymous/authenticated table grants are revoked and RLS is enabled on every public table.
- Four-hour signed, `HttpOnly`, `Secure`, `SameSite=Strict` administrator sessions, throttling, and security audit events.
- Private receipt storage with MIME/size controls and ten-minute signed review URLs.
- Data access, withdrawal and deletion-request portal; request tracking with a 30-day internal due date.
- 90-day security-log expiry and 180-day WhatsApp-content expiry; minimized Twilio payloads and OpenAI requests configured with `store: false`.
- Security headers, payload-size limits, Twilio signature validation, and elimination of sensitive request logging.

## Owner actions required before production

1. Set the exact registered legal entity name and CR number in `VITE_LEGAL_ENTITY_NAME` and `VITE_CR_NUMBER`; appoint the privacy request owner and working mailbox.
2. Execute and archive processor/data-transfer terms with Supabase, Vercel, Twilio and OpenAI. Record transfer mechanism, countries/subprocessors and the Saudi PDPL transfer assessment.
3. Determine whether the organization is within NCA mandate or NCNI Essential Cybersecurity Controls scope. If it is, have the accountable executive approve the control mapping and evidence.
4. Configure and test Supabase point-in-time recovery/backups; upgrade the database from the advisor-flagged Postgres release.
5. Rotate production service-role, administrator/co-host, Twilio and OpenAI secrets after deployment. Do not place secrets in `VITE_` variables.
6. Publish SPF, DKIM and DMARC for the organizational domain and secure the privacy mailbox with MFA.
7. Approve the retention schedule, DPIA, legitimate-interest assessment and incident contacts. Train administrators before participant data is collected.
8. Decide whether SDAIA controller registration, DPO appointment or additional records are required based on the entity, activity, scale and any official direction.

Evidence should be reviewed at least annually and after any material change, incident, new vendor, data category or processing purpose.
