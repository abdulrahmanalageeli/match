# Authentica face verification — integration status

Prepared: server-only comparison adapter in `admin/server/authenticaFace.ts`, using `AUTHENTICA_KEY` and the documented `/api/v2/verify-by-face` contract. Unit tests use synthetic bytes and mocked responses; no biometric data or paid requests were sent. This adapter is not exposed as an endpoint or connected to signup yet.

## Blocking dependency

The [API documentation](https://docs.authentica.sa/api-reference/face-verification/verify-by-face) documents two base64 images and a boolean match result. It does not document a liveness decision, capture SDK, signed evidence, session creation, or server verification of capture evidence. The [product page](https://authentica.sa/en/face-recognition-en/) advertises passive liveness and an SDK, but those claims do not specify an implementable protocol.

Obtain Authentica's Web/iOS liveness SDK documentation, session/token creation and verification contract, account entitlement, and biometric retention/deletion terms. Never embed the account API key in the browser or iOS bundle. A camera snapshot, blink animation, or local face detector alone cannot establish presentation-attack resistance. No successful still-image comparison should be recorded as liveness or government identity verification.

## Required integration once the contract is available

- Explicit biometric consent before sending either image, explaining the provider and purpose. Confirm retention and international processing disclosures before publishing them.
- Authenticated server-created, short-lived, single-use capture session. Rate-limit durably per account before paid provider calls. Bind provider evidence to that session, the authenticated member, and the hash of the exact final profile image.
- Verify both provider liveness evidence and image match on the server. Do not trust client booleans or client-supplied member IDs. Save only necessary proof/status metadata; avoid storing capture images, base64 payloads, or provider response bodies in logs.
- Add men's photo/camera step to registration and profile editing. Current onboarding photo step is women-only. Include permission denial, cancellation, retry, provider outage, and accessible capture instructions.
- Enforce approvals at portrait/gallery publication in the database/storage workflow, including direct RPC calls. Every replacement/additional image needs a matching proof; avoid verifying one blob then publishing another. Preserve existing photos while replacements fail. Define existing-member rollout explicitly.
- Test mismatch, replay, altered uploads, cross-account proof reuse, expired proof, double submission, denied camera access, and device camera flow. Test accounts must remain usable without allowing test bypasses for ordinary members.

No liveness gate or verified badge has been enabled by this preparatory change.
