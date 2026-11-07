# Nisfayn: Saudi onboarding and privacy release review

Reviewed 6 November 2026. Implementation guidance based on the official sources below, not a legal opinion, business-licence verification, security audit, or compliance certification. This review concerns Nisfayn only; no BlindMatch data or code was changed.

## Verified operator details

The published [BlindMatch privacy notice](https://blindmatch.app/privacy) and `../../app/lib/legal.ts` both identify **BlindMatch Establishment**, establishment/registration number **7054871681**, and **privacy@blindmatch.app**. The user authorised reuse of these details for Nisfayn. No separate verified support mailbox or postal/national address was found. No active legal environment override was found in the inspected local environment files.

These are published details, **not independent Ministry of Commerce verification**. Confirm the registered Arabic/English name, current registration status, address, mailbox ownership, and authorised business activities before public launch. BlindMatch's `../../app/routes/terms.tsx` expressly describes an event that is not marriage mediation: its service terms cannot simply become Nisfayn's marriage-service terms. Whether this activity requires an amended commercial activity or another authorisation remains unresolved; seek the competent authority's determination. Do not invent a licence or claim the existing CR proves permission.

## Rules that affect this implementation

| Topic | Finding and source |
| --- | --- |
| Sensitive information | Religious belief is sensitive personal data. Photographs are personal data; a photo is not automatically biometric data unless processed for identification. Tribal background can reveal ethnic origin and should conservatively receive sensitive-data controls. [PDPL, Article 1](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL/) |
| Skin tones | SDAIA specifically notes that skin colour can reveal racial/ethnic origin. Treat the chosen tone and avatar-derived representation as personal data, not anonymous decoration. Do not infer it from a face or name. [Controller/processor guide](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPLCP/) |
| Consent | Purpose-specific, freely given, documented consent is needed; sensitive processing and solely automated decisions require explicit consent. Withdrawal must be as easy or easier than granting. Sensitive processing triggers a documented impact assessment. Security must follow applicable NCA controls or recognised best practices where those controls do not apply. Qualifying harmful breaches require notification to SDAIA within 72 hours of awareness, and affected people without undue delay when the relevant threshold is met. [Implementing Regulation, Articles 11–12, 23–25](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL2/) |
| Controller registration | The registration rules cover controllers whose principal activity processes personal data or who process sensitive data. Nisfayn appears within these conditions; verify/register the operating entity. This registry is separate from commercial registration. [National controller-register rules, Article 2](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/Rulesandguidelinesp2/) |
| DPO | Core activities involving sensitive data trigger appointment of a qualified data-protection officer. An external contractor is permitted. A small pilot or fewer than 500 users is not itself an exemption. Nisfayn's matching model appears to trigger this requirement. [DPO rules, Articles 4–6](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/AppointingPersonalDataProtectionOfficer/) |
| Frankfurt | Hosting Saudi members' information in Frankfurt is a cross-border transfer. Document the applicable transfer route, safeguards, recipients/onward transfers, and necessary risk assessment before real sensitive-data collection. Continuous sensitive-data transfers independently trigger assessment under Article 7. EU hosting or a user checkbox does not establish compliance with Saudi transfer rules. [Current transfer regulation, Articles 4–7](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/RegulationonPersonalDataTransferOutsidetheKingdom/) |
| NCA scope | ECC directly covers government/affiliated entities and private entities owning, operating or hosting critical national infrastructure. Other organisations are encouraged to use it. Do not assume every marriage startup needs NCA approval or display an NCA-certified badge. [NCA ECC 2:2024, scope, PDF p. 11](https://cdn.nca.gov.sa/api/files/public/upload/86e09090-44e4-481f-bc28-355673607654_ECC--2024-EN.pdf) |

## Implementation contract

This is an engineering recommendation, not a claim that these changes are already deployed.

- Keep age declaration, terms acceptance, privacy-notice acknowledgement and optional processing permissions distinct. Acknowledging a notice is not blanket consent. No preselected boxes.
- Obtain sensitive consent **before** collecting/persisting religious, tribal or skin-tone answers, including browser drafts. If declined, omit/clear those fields and continue with ordinary profile questions. Do not gate account access on optional sensitive answers. Use a separate choice for sensitive publication if publication and matching are independent purposes.
- Offer “أفضل عدم الإجابة” consistently. Never infer religious practice, sect, ethnicity or skin colour from a photograph/name. A polygyny answer is self-reported relationship information, not verified religious or legal status.
- Each consent receipt should retain account ID, immutable notice version, purpose, grant/withdraw action, server timestamp and collection channel. Validate scopes on the server. Persist the exact version text. Do not collect IP/device identifiers merely for convenience.
- Add withdrawal controls in Settings. Withdrawal must remove the relevant data from display and future scoring, revoke associated access, and schedule deletion according to the approved retention policy. An email-only withdrawal process is not equivalent to an instant checkbox when it adds friction.
- Treat an avatar based on skin/head-covering choices as derived personal information. Avatar and photo are equally usable alternatives; avoid pressure, shame, preselection, or claims that a photo is necessary for marriage success.
- For blur, flatten pixels into the uploaded/delivered derivative. CSS blur of an accessible original is inadequate. Avoid sending the original unless separately needed/authorised; strip metadata and validate image content/type/size. Use private storage and scoped delivery. Blur is not anonymisation and cannot prevent screenshots.
- Distinguish profile-photo publication from private conversation-photo sharing; separate their permissions/access rules. Removal must revoke served access, while explaining that externally saved copies cannot be recalled.
- Label age as a declaration, not verified identity. Avoid collecting ID scans without a documented legal basis. Keep real-member data out of demo accounts, fixtures, public screenshots and analytics logs.

## Arabic consent copy

Use the wording only where the implementation actually matches it. Version: `2026-11-06-onboarding`.

| Purpose | Suggested text |
| --- | --- |
| Adult declaration | أقرّ بأن عمري ١٨ عامًا فأكثر. |
| Terms | أوافق على شروط الاستخدام وألتزم بالتعامل الجاد والمحترم. |
| Notice acknowledgement | اطّلعت على إشعار الخصوصية وأفهم كيف تُستخدم بياناتي وحقوقي. |
| Sensitive matching, optional | أوافق صراحةً على معالجة التفاصيل الحساسة التي أختار تقديمها عن المذهب والممارسة الدينية والخلفية القبلية ودرجة البشرة لأغراض التوافق. يمكنني التخطي أو حذف هذه الإجابات وسحب موافقتي. |
| Sensitive publication, optional | أوافق صراحةً على عرض التفاصيل الحساسة التي اخترتها في معاينة ملفي للأعضاء المؤهلين. |
| Automated assessment, optional | أوافق على تحليل إجاباتي آليًا لعرض مؤشرات التوافق ومواضيع الانسجام والنقاش. هذه المؤشرات لا تتنبأ بنجاح الزواج. |
| Profile photograph, optional | أوافق على عرض النسخة المعروضة من صورتي، بدرجة التمويه التي اخترتها، للأعضاء المؤهلين. يمكنني إزالتها أو استبدالها بصورة رمزية. |
| Blur explanation | التمويه يقلّل وضوح الملامح، لكنه لا يضمن إخفاء الهوية أو منع حفظ الصورة أو تصوير الشاشة. |
| Sensitive question helper | هذه المعلومة اختيارية. اختر ما يعبّر عنك، أو تابع دون إجابة. |
| No-upload claim, only after verification | نرفع النسخة المعالجة المعروضة فقط، ولا نرفع الصورة الأصلية. |

`src/legal/LegalNotice.tsx` supplies a readable Arabic notice with expandable sections and official links. Its `preview` label must be enabled only for a genuinely non-submitting preview. It deliberately does not claim encryption, government certification, a guaranteed response time, or completed registrations.

## Gaps observed before this change

- `src/Screens.tsx`'s original `Policy` lacked controller/contact details, countries/processors, granular retention and sensitive-data consent. Its avatar copy said the choice was separate from appearance answers; its photo copy only covered temporary private sharing. Both require updating for automatic avatars and profile portraits.
- `src/onboarding/GuidedApplication.tsx` used one final bundled consent after sensitive questions. Restoring drafts reset consent but did not itself establish lawful earlier processing.
- The original `marriage.consents` table retained member, version and recorded time; private-photo versions existed, but distinct purpose grants/withdrawals were not represented in the inspected original schema. Re-audit the new migration before release.
- Export/delete/settings routes exist; this review did not verify all production deletion paths, backups, processors, access controls, account authentication, or mailbox delivery.

## Public-launch gates

1. **Operator and service authority:** verify current registration/business activity and any service-specific authorisation; record official address and workable privacy/support contact. Obtain a service-specific legal review; do not reuse the event disclaimer.
2. **Privacy governance:** establish controller registry status and qualified DPO appointment/contact, processing records, DPIA, retention/deletion schedule, member-rights procedures and an incident response owner. No certification claims.
3. **Cross-border processing:** map Supabase/database/storage/backups/support, Vercel hosting/logs, Agora voice, email/push and any AI processor actually receiving personal data. Complete contracts, transfer legal basis/safeguards and assessment. No sensitive answers/messages/photos should reach an AI provider merely because “AI” appears in branding.
4. **Accurate full notice:** complete controller address, purposes/legal bases, exact data categories, recipient categories/locations, retention periods or meaningful criteria, rights/contact/escalation, and version history. The concise UI is not a substitute for this operational detail. [SDAIA privacy-policy preparation guidance](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/ElaborationandDevelopingPrivacyPolicyGuideline/)
5. **Enforced choice:** confirm consent precedes draft/server collection, declined data is omitted, publication is scoped, withdrawal works, receipts match the visible text, and changes re-prompt when needed. A fake preview acceptance is not a production consent receipt.
6. **Evidence of protection:** verify admin MFA, member-level access policies, storage authorisation, signed URL expiry/revocation, secret management, access logging, abuse limits, restored backups and incident escalation. Establish actual evidence before making security claims.

All gates are **unverified in this review**, not necessarily absent. Continue fictional/demo UX work while resolving them. Do not treat a successful build, migration, or set of checkboxes as regulatory approval.

## Implemented preview release

The user confirmed reuse of the BlindMatch operator details and approved the Nisfayn update. Released to `https://nisfayn-preview.vercel.app` (deployment `dpl_3RmFWxtwuxNaiz72QhdHcY8P8zPw`). Admin cleanup deployed as `dpl_7o9ATroTeMdLfYo2qBQHpLPPdf56`; `pair-test` edge version 8 is active. Only Nisfayn project `wupkifqbwhhebwrgvwai` was modified.

- Remote migrations: `20261106213610 private_profile_portraits`, `20261106213709 religious_disclosures_signup_consents`. Corresponding local files retain CLI-created versions `20261106211421` and `20261106211555`.
- Separate age, terms, privacy, optional sensitive-profile, assessment and photo choices; server validation and purpose-event history; optional current-marriage/polygyny/religious disclosures.
- Processed JPEG portraits are private, limited to 3 MiB and uploaded after consent; original files are not uploaded. Pixel blur runs in a small Web Worker with deterministic fallback. Replacement commits atomically and removed objects enter cleanup.
- Focused database tests covered purpose gates/withdrawal, real and test portrait authorization, replacement/recovery, matching access, deletion cleanup and legacy preservation. Targeted frontend, persistence, worker and render checks passed, as did app/admin typechecks and builds.
- Browser verification completed the isolated nine-step preview, including a fictional blurred portrait, questionnaire navigation, legal modal and final submission. Fixture counters stayed at zero profile saves/visits; returning restored the original settings profile. Live login, Settings preview shortcut and introduction were verified with no captured browser errors.
- Live checks confirmed the portrait bucket is private, RLS is enabled, anonymous photo RPC access is denied and members cannot query consent tables directly. The security advisor reports intentional RPC-only tables without direct policies and existing disabled leaked-password protection; address password protection in launch hardening. Admin production dependency audit found zero vulnerabilities. CLI error-log query returned no logs for the new deployment; this is not proof of future worker execution.

These implementation checks do not resolve the public-launch gates above.
