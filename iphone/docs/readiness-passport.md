# Marriage Readiness Passport

The passport is an optional private workspace, separate from discovery profiles and compatibility scoring. It does not certify suitability for marriage, safety, character, income, or marital status.

## Member experience

- Settings → جواز الجاهزية للزواج. Processing consent is separate from signup consent.
- Self-declared timeline, family discussion, and practical preparation: communication, budgeting, housing, responsibilities, and marriage education.
- A member chooses an accepted connection, specific sections, and a seven- or thirty-day sharing period. Sharing is off by default. Edits update the selected sections during that period.
- The recipient opens the shared passport from the partner's profile inside the chat. The server checks the active connection and permission on every read. Expiry, withdrawal, revocation, blocking, or ending the connection stops access. A later match does not restore the old grant.
- Withdrawal removes the passport without deleting the account. Members can export their passport. Screenshots or copies already made by a recipient cannot be recalled.

## Verification is not activated

There is currently no identity provider or course issuer connected. The feature must not describe a completed questionnaire, staff approval, email confirmation, or a fictional test account as independent verification.

The database supports scoped issuer attestations, with a named issuer, claim type, verification method, dates, expiry, and revocation. The issuer registry starts empty. Claim ingestion is service-only; members cannot write verified claims. Ingestion requires a separate, current, issuer-and-claim-specific request and an opaque evidence reference. Evidence references never go to the partner.

Before activating an issuer:

1. Obtain contractual access and confirm the permitted purpose and exact claims. Identity confirmation does not imply confirmation of income, marital status, or criminal history.
2. Complete the relevant privacy, security, retention, and cross-border processing review. The current database is in Frankfurt; user consent alone is not a declaration of Saudi regulatory compliance.
3. Implement the issuer's documented API and authenticated callbacks; verify signature, audience, issuer, subject binding, replay protection, expiry, and revocation. Do not invent undocumented Nafath or Yakeen endpoints.
4. Provide the member a provider-specific notice and consent before any verification request. The general passport consent is insufficient.
5. Keep document images, national identifiers, health information, credit data, and biometric data out of the passport. Persist only the minimum attestation needed.
6. Enable only reviewed issuer/claim combinations. Test failed, revoked, expired, and withdrawn-consent requests before launch.

## Evidence informing the design

- Saudi PDPL Implementing Regulation, especially consent/withdrawal and data minimization: https://www.uqn.gov.sa/details?p=23595
- Elm's description of Yakeen: verification within the permitted access scope and an official relationship with the subject, not unrestricted personal-data lookup: https://elm.sa/en/our-business/digital-products/Pages/Digital-identifiers.aspx

These references inform the design; they are not a legal approval or a claim that Nisfayn has provider access.
