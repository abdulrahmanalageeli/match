# Marriage application service

This standalone Node service stores the iPhone app's accounts and introductions in a separate SQLite database. It never reads the event database. Use Node 22.13 or newer.

## Run locally

```sh
npm ci
npm test
npm start
```

The default address is `http://127.0.0.1:8787`, with the API at `/api`. `GET /health` returns the service status. The app's development server can proxy requests from a local browser. For an installed iPhone build, set `VITE_API_BASE_URL` to the full HTTPS API URL before building the app, for example `https://your-host.example/api`. Place the service behind an HTTPS reverse proxy for real accounts. Persist the `data` directory on an encrypted volume with restricted access and backups.

| Setting | Purpose |
| --- | --- |
| `MARRIAGE_DB` | SQLite file path. Defaults to `service/data/marriage.sqlite`. The operator commands must use the same path. |
| `MARRIAGE_HOST`, `PORT` | Bind address and port, defaulting to `127.0.0.1` and `8787`. |
| `MARRIAGE_WEB_ORIGINS` | Comma-separated browser origins in addition to Capacitor and local development defaults. |

Members register using an email address and a password. A new application enters the operator's review queue. The email address identifies the account and the application age is self-declared. An operator must independently check the adult applicant before approval. The app has no automated identity-provider integration or email verification. Avoid entering identity documents into the application.

## Operate an approved pilot

Run these commands on the service host, using synthetic email addresses in local tests.

```sh
npm run admin -- pending
npm run admin -- approve first@example.test --verified-adult
npm run admin -- approve second@example.test --verified-adult
npm run admin -- ready
npm run admin -- candidates first@example.test
npm run admin -- introduce first@example.test second@example.test
npm run admin -- reports
npm run admin -- suspend second@example.test
npm run admin -- resolve REPORT_ID
npm run admin -- close INTRODUCTION_ID
```

Each party must hold an active verified subscription before an operator can introduce them. The service checks age preferences in both directions, city, opposite genders, open proposals, prior pairings, blocks and pauses. Only one open proposal is allowed per member. Passing, reporting, blocking, pausing or operator closure ends the proposal. The personal contact field becomes visible on acceptance by both participants. Expiry hides proposals and contacts. A moderator can close an open proposal if the other party's membership expires.

Before offering a new subscription, the app uses the server's `membership.canStart` flag. An approved, unpaused applicant must have at least one other approved, unpaused candidate who passes those same reciprocal checks. Neither candidate needs to have paid yet. This anonymous signal can change and does not reserve a person or guarantee an introduction. A completed Apple transaction or restore is honored independently of current matching availability.

On the operator host, `ready` lists approved paying members with active searches and no open introduction. `candidates EMAIL` lists only currently eligible, paying counterparts for the selected member. Use the account emails in `introduce`; the lists omit profile details and private contact fields. Membership and availability are checked again when the introduction is created.

Editing an approved profile closes its current introduction and returns the member to review while preserving the App Store subscription. Resubmitting the same details leaves the existing approval and introduction in place. Reporting immediately blocks the pairing. The operator can inspect open reports, suspend a member from matching pending review, then mark a report resolved. Resolving a report preserves the block.

Every successful application submission, including resubmissions, records the accepted consent version and the time received by the server. An application must explicitly submit the current version, `2026-11-05`. Legacy applications with no consent evidence reopen as drafts for review by the member. The upgrade closes their previous introductions and preserves subscription records. Consent records are removed when the account is deleted.

## Enable App Store billing

1. In App Store Connect create an auto-renewable product `com.blindmatch.marriage.monthly` for the `com.blindmatch.marriage` app. Configure storefront availability and price in App Store Connect.
2. Obtain Apple’s current trusted root certificates from [Apple PKI](https://www.apple.com/certificateauthority/). Put the trusted DER `.cer` root files in a private directory and set `APPLE_ROOT_CERTS_DIR` to its path. Online certificate checks require outbound access to Apple.
3. Set `APPLE_STORE_ENV=Sandbox` for a sandbox server, or `APPLE_STORE_ENV=Production` and `APPLE_APP_ID` to the numeric App Store application ID for production. Isolate sandbox and production databases.
4. Set the corresponding App Store Server Notifications V2 URL to `https://your-host.example/api/storekit/notifications`. Apple-signed renewals or refunds update the same account whether the app is open or closed. Monitor delivery failures. The native client passes its account UUID into StoreKit and submits the signed transaction. The backend checks Apple's signature, environment, bundle, product, account binding, expiry, and revocation before granting access. StoreKit purchases signed only by Xcode's local configuration are not Apple-signed sandbox transactions. Use the app's separate sample mode for a no-payment walkthrough.

## API

Requests with a body use JSON. Authenticated routes require `Authorization: Bearer SESSION_TOKEN`. Errors have the form `{"error":"…"}`.

| Route | Input and response |
| --- | --- |
| `POST /api/register`, `POST /api/login` | `{email,password}` → `{token,state}`. Password length 10–128. |
| `GET /api/me` | Current account state. |
| `PUT /api/application` | `{displayName,age,gender,city,profession,bio,contact,preferredMinAge?,preferredMaxAge?,familyPreference?,consentVersion:"2026-11-05"}` → state. Gender is `woman` or `man`. |
| `POST /api/membership` | `{signedTransaction}` → state. |
| `POST /api/introduction/respond` | `{id,decision,reason?}` → state. Decision is `accept`, `pass`, `block`, or `report`. |
| `PATCH /api/settings` | `{paused:boolean}` → state. Pause controls introductions. App Store subscription management controls billing. |
| `POST /api/logout` | End this session. |
| `DELETE /api/me` | Delete the account and its local profiles, introductions, sessions, reports and receipt records. App Store subscriptions are managed separately. |

State contains `user` (including `applicationStatus`, `paused`, and `appAccountToken`), the member's own `profile`, `membership: {active,expiresAt,canStart}`, and either a single `introduction` or `null`. `canStart` applies only to inactive memberships. An introduction contains only the proposed member's public summary and consent status, plus `contact` when an introduction is mutual.
