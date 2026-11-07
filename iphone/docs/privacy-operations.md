# Privacy operations and remaining launch evidence

Prepared 2026-11-07 for Nisfayn. This is an operational draft, not a completed DPIA, legal opinion, certification, executed processor agreement or government registration. Do not put real member requests, credentials, identity documents or incident evidence in this repository.

## Implemented restrictions

- New verification evidence uploads/submissions are paused at the UI, Edge and database boundaries. Existing requests remain available for withdrawal and authorized review. Reopening requires a documented permitted verification method and Article 28 assessment; a user consent checkbox is not sufficient evidence of an exception.
- AI opening suggestions use a generic prompt with no profile or conversation content. Old profile-bearing requests and external tester transcript generation are rejected. Simulation replies remain local.
- Sensitive processing and publication have separate purposes. Publication defaults to false, including legacy accounts. Revoking publication hides the relevant public fields while retaining authorized private matching inputs.
- Shared tester profiles expose a public projection and server-computed compatibility rather than the peer's raw answers/preferences/contact details.
- Member export accepts the current server export version. Account deletion, optional-consent withdrawal and existing media cleanup remain available.

## Processing inventory for operator approval

| Activity | Data and purpose | Processing basis to document | Recipients / locations | Retention / open evidence |
| --- | --- | --- | --- | --- |
| Account and profile | Auth/contact, adult declaration, profile; provide requested service | Service contract for necessary processing; explicit consent for optional sensitive inputs | Supabase database region eu-central-1 (Frankfurt); confirm Storage, backups, subprocessors and support access separately | Account-linked rows cascade on deletion; establish approved inactive-account, backup and downstream deletion schedules |
| Matching | Private questionnaire answers, preferences, personality and Beena; generate compatibility indicators | Optional automated-assessment consent; separate sensitive-processing permission | Supabase; shared tester score computed in Edge; public output is a summary | Delete/replace optional answers upon withdrawal/save; profile linked to account |
| Publication | Public profile, explicitly published sensitive fields, portraits | Separate sensitive-publication and portrait permissions | Eligible members; Supabase Storage | Access revoked on removal/withdrawal; physical objects removed through cleanup queue; no guarantee of recall from recipients |
| Chats / family | Messages, attachments, participants and voluntary approvals | Document necessary service basis and relevant optional consents; no blanket staff browsing | Supabase; Agora for live audio; family-room participants | Regular closed chats are not yet subject to an approved time-based purge. Family rooms: 30 days after closure. Resolve closed-chat retention and backup deletion before public release |
| Verification history | Existing claims, documents and review/access events | Historical consent is recorded; permitted official-document basis remains unresolved | Owner and authorized MFA reviewers; private Supabase bucket | New collection blocked. Evidence: 30 days after decision / 90 days pending / 1 day drafts, followed by maintenance; legal owner must decide treatment of any existing real official documents |
| Readiness | Optional plan, grants and limited event log | Separate passport/share consent | Supabase; explicitly approved matched recipient | Grant expiry 7/30 days; events 90 days; withdrawal cleanup implemented |
| Technical operations | Limited fault counts, security/rate limits, delivery jobs | Document security/operational basis and minimization; never rely on legitimate interest for sensitive content | Supabase, Vercel; delivery provider to verify | Fault/delivery cleanup 30 days. Confirm vendor log retention and external alert destinations |
| AI suggestions | Static generic prompt and generated suggestion | No member profile/chat sent to OpenAI; business/vendor processing still needs contract review | Server-to-OpenAI; no member identity/session metadata in completion | Request uses store:false; this does not represent a zero-retention guarantee |
| Payments / notifications | Apple receipt/entitlement; device token when notifications enabled | Contract / relevant legal obligation for payment; notification permission | Apple, Supabase, server worker; APNs disabled pending setup | Confirm financial retention, receipts/refunds, vendor locations and device-token lifecycle before enabling |

This inventory must be completed with the controller's verified national address, DPO identity/contact, processor legal entities, countries (including support/backups), executed terms, legal bases and retention approvals. A Frankfurt primary database is not a complete transfer map.

## Rights-request procedure

1. Route requests through `privacy@blindmatch.app` and the app's export/edit/delete controls. Assign an accountable owner and backup, test the mailbox, and monitor it daily. The app does not send an email automatically.
2. Record a case in a restricted operational system: reference, receipt date, verified account reference, request type/scope, identity-check method, due date, handler, action and response date. Do not copy chat text or ID scans into the register.
3. Verify ownership proportionately using an existing authenticated session or verified contact. Do not solicit an official-document copy as the default verification method.
4. Act without undue delay and within 30 calendar days. If the statutory grounds for extension apply, document them and notify the person before extending, by no more than 30 additional days. Record refusals and lawful reasons.
5. Export only the requesting person's data without disclosing other participants' private data. Respect access restrictions and use an authenticated/appropriately secured delivery channel.
6. For correction/withdrawal/deletion, follow through to relevant processors, storage queues, published copies and backups as legally required. Record any justified exception and expiry. UI disappearance alone is not completion.
7. Confirm outcome and available complaint route to the person. Use a separate, approved retention schedule for request records. Do not commit these records to Git.

## Breach-response procedure

Owner, deputy and 24-hour escalation contacts: **operator must appoint and test**.

1. Record discovery and awareness times in UTC, scope, reporter and incident reference. Preserve minimal evidence in a restricted incident store; never paste tokens, chat content or documents into public logs/issues.
2. Contain the affected access (revoke compromised sessions/keys/grants, isolate affected feature) without indiscriminate deletion. Keep a timeline and preserve necessary evidence.
3. Assess affected data/categories, approximate people/records, likely harm, rights/interests, processors, onward transfers and whether sensitive information is involved. Record the notification decision and legal review.
4. Where the threshold in Implementing Regulation Article 24 is met, notify SDAIA within 72 hours of awareness. Do not wait for a complete forensic report; supply available information and follow up with missing details and reasons.
5. Notify affected people without undue delay where the applicable harm/rights threshold is met. Explain the incident, risks, mitigation, contact point and practical protective steps in clear language.
6. Coordinate with processors and any separately applicable regulator/contract. Keep notification copies, corrective actions and recovery evidence. Run a tabletop exercise before unrestricted launch.

## Impact assessment worksheet — not signed off

| Risk | Current mitigation | Required decision / evidence |
| --- | --- | --- |
| Sensitive religion/tribal information revealed without choice | Independent publication permission, server redaction, private matching | DPO review of purpose separation, free-text risks and inference from matching summaries |
| Third-party AI receives intimate text | Generic-only API, old payloads rejected, local simulation | Verify deployed payloads and vendor agreement; no reactivation of personal-text AI without a new assessment |
| Official documents copied without permitted authority | New uploads paused, private history/withdrawal preserved | Saudi legal determination of permitted evidence/provider, minimization and treatment of existing real evidence |
| Foreign access/processing lacks safeguards | Recipient notice, restricted access, generic-only AI | Execute relevant DPAs; identify lawful transfer mechanism and perform transfer risk assessment; no claim of adequacy from EU hosting alone |
| Deleted material restored or retained by vendors | Access revocation + queues; account deletion | Restore drill, approved backup/processor deletion process, reconciliation of revoked/deleted records |
| Account compromise or staff misuse | Admin MFA, role boundaries and audit events | Leaked-password protection warning, independently reviewed security tests, response exercise, access review |
| Paying customers misunderstand service | Compatibility disclaimers, Apple management/refund links | Verify registered activity, merchant disclosures, address, invoice/tax handling, actual price/renewal/cancellation/refund flow |

## Evidence needed to close the assessment

1. Controller registration and qualified DPO appointment/contact, where required by the published rules; verified controller address.
2. Signed DPIA / processing register / retention schedule and a lawful verification method.
3. Processor/subprocessor contracts, actual processing locations and transfer mechanism/risk assessment.
4. Working rights-request and breach-response ownership, mailbox delivery and exercises.
5. Isolated staging, successful database/media restore drill, external alerting and documented security review. Do not enable paid infrastructure without owner authorization.
6. Exact commercial activity/sector permission confirmation, e-commerce disclosures and validated subscription/invoice/refund journey.
7. Recheck official amendments before launch. The October 2026 consultation is not treated as enacted legislation by this change.

## Official references checked 2026-11-07

- [PDPL](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL/): Articles 12–13, 18–22, 28–29 and 31.
- [Implementing Regulation](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL2/): Articles 3–4, 8, 11–12, 17 and 23–25.
- [Current transfer regulation, official gazette](https://www.uqn.gov.sa/details?p=25412).
- [Controller registration](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/Rulesandguidelinesp2/) and [DPO appointment](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/AppointingPersonalDataProtectionOfficer/).
- [NCA ECC-2:2024](https://cdn.nca.gov.sa/api/files/public/upload/86e09090-44e4-481f-bc28-355673607654_ECC--2024-EN.pdf): establish scope; do not assume every private app is within mandatory ECC scope.
- [E-Commerce Law](https://misa.gov.sa/app/uploads/2025/07/E-Commerce-Law.pdf).

## Release verification — 2026-11-07

This records the deployment and test results reported during this release; it is not regulatory approval or a completed production end-to-end audit.

| Layer | Verified release status |
| --- | --- |
| Live Nisfayn database | Applied `20261107093757_restrict_manual_verification_uploads.sql` and `20261107093912_separate_sensitive_publication.sql`. New document collection is blocked server-side, and sensitive publication requires its separate permission. Existing verification history, authorized review and withdrawal remain available. |
| Live Supabase Edge Functions | `manual-verification` version 3 and `pair-test` version 15 deployed. The verification restriction returned HTTP 403 in the live check. |
| Vercel website / AI API | The user explicitly approved publication. Production deployment `dpl_FELgJpqmwokjzuNJaknHH1oRL37m` is READY and was promoted to [the live site](https://nisfayn-preview.vercel.app). Live-domain checks passed on 2026-11-07 at 09:56 UTC. The production frontend asset hashes match the tested preview. |
| Local validation | Typecheck and build passed. The final app unit run passed all 232 tests (0 failed), including verification restrictions and preserved review/withdrawal, separate sensitive-publication choices, AI payload restrictions, and member export versions 1/2 with rejection of unknown versions. Log: `artifacts/privacy-amendments-app-tests-final.log`. |
| Production checks | Public live-domain requests returned HTTP 200 for the updated HTML, HTTP 403 (`personal_text_disabled`) for synthetic `demo_reply`, and HTTP 400 (`invalid_request`) for a synthetic opener containing a profile. These requests are rejected before external AI processing. The same API checks passed against the staged production deployment before promotion. |
| Live browser checks | Test-member sign-in, discovery and settings loaded successfully. The verification screen visibly pauses new submissions while preserving existing request history. Profile editing displays the separate-publication notice and optional sensitive-processing control. No consent was granted, profile saved or document submitted during verification. These checks are not an exhaustive end-to-end audit. |
| Final database security advisor | One warning remains: leaked-password protection is disabled. The 106 informational RLS-without-policy findings correspond to private/RPC-mediated tables; they are not evidence of public access. Enable the password safeguard and complete the independent access/security review before unrestricted launch. |

The website, AI API, database and Edge amendments are now deployed to production. Existing open browser sessions may still display cached older UI until refreshed; server restrictions also apply to those clients. Publishing these amendments does not establish full PDPL/NCA compliance: the governance, transfer, verification authority, retention and operational evidence listed in this document remain unresolved.
