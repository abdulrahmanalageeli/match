# Authentica profile-photo verification

Implemented for real male members: a profile photo step in onboarding/settings, explicit consent, camera-only selfie capture with preview/retake/cancel, server-side Authentica comparison, and database-enforced publication checks for profile portraits and gallery images.

## Contract and scope

Uses `POST https://api.authentica.sa/api/v2/verify-by-face`, with `AUTHENTICA_KEY` held only in the admin server environment. A match requires `success === true`, the authenticated member's `data.user_id`, and `data.result === true`.

The current endpoint documentation describes image matching. No independent liveness or national-identity claim is made. Camera capture has no file-picker fallback, but a client camera flow is not itself proof against spoofing. Provider liveness guarantees remain unconfirmed.

Existing photos are grandfathered. New male portraits and gallery uploads require successful comparison before publication. Women's privacy/blur choices and the isolated Reham/Abdulrahman testing backend are unchanged. The new onboarding UI requires a photo for men; this does not convert an existing account into an identity-verified account or guarantee account uniqueness. Private chat media are outside this profile-photo rule.

## Security

- The endpoint validates the signed-in user and current member session. Member identity and storage paths are server-derived.
- It downloads the exact pending Storage object, compares it, and records proof for that member/photo/object ID plus SHA-256. Clients cannot approve proofs.
- Profile objects cannot be overwritten. Gallery deletion cannot occur while its metadata still exists, preventing delete/re-upload substitution during verification.
- Database triggers require fresh, unused proof for publication. Failed replacements leave the previous portrait intact. Failed pending uploads are discarded safely; existing cleanup workers remove their stored objects.
- Requests require versioned explicit consent. Limits: three attempts/minute and ten/24 hours per real member. Provider timeout is 15 seconds; errors expose no provider bodies or credentials.
- Selfies are processed in memory, never saved to app Storage, and never logged by this implementation. Provider retention remains governed by Authentica's terms; no unverified retention promise is made.
- Test accounts do not receive an identity or liveness badge.

## Validation

Targeted adapter and HTTP-handler tests mock the provider. Database tests exercise publication denial, proof ownership, single-use consumption, expiry, rate limiting, object substitution, replacement preservation and female uploads. No real biometric request was made during automated tests.

iOS requires a new TestFlight build for `NSCameraUsageDescription` and bundled UI. The actual device camera and paid provider acceptance must be verified with a consenting user. Ensure `AUTHENTICA_KEY` is configured on the production `nisfayn-admin` deployment.
