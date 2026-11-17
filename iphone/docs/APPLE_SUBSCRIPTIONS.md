# Wudayn monthly Apple subscriptions

Implemented catalog (Saudi storefront, monthly auto-renewal):

| Member profile | Product ID | SAR/month |
| --- | --- | --- |
| Man | `com.blindmatch.marriage.monthly.men` | 149.99 |
| Woman | `com.blindmatch.marriage.monthly.women` | 99.99 |

The client chooses from the saved profile. Native StoreKit validates monthly duration and the Saudi price, displays Apple's localized `displayPrice`, and attaches the member's `appAccountToken`. The trusted receipt RPC checks product eligibility against the database profile, ownership and signed transaction ordering. Entitlements are delivered by the verified server response before the client finishes a transaction. Restores, pending purchases and transaction replay use the existing flow. No browser checkout or client-only paid entitlement is added.

## Required setup before TestFlight testing

1. In App Store Connect, open Wudayn (`com.blindmatch.marriage`) → Monetization → Subscriptions. Create **two separate subscription groups**, one per gender. Add the corresponding auto-renewable product to each; disable Family Sharing. Separate groups prevent Apple subscription management from offering a crossgrade to the other gender's cheaper plan. Give both Arabic names, descriptions and review information. Complete Paid Apps agreements, tax and banking requirements.
2. Set each subscription to **one month**, choose Saudi Arabia as its base storefront and set the exact prices above. Check availability and the effective price date. For other countries, Apple shows their localized currency/price; do not advertise SAR as the actual foreign-currency checkout charge. If the exact Saudi price is unavailable in the console, do not substitute another price silently: the native SAR check will refuse purchase until configuration matches.
3. Existing `com.blindmatch.marriage.monthly` transactions remain supported for renewals, restores and refunds. Remove that legacy product from new sale after confirming the cutover; do not delete subscription history. Existing subscribers' renewal prices are controlled by Apple, not this code. Changing their price needs a separate App Store Connect price-change process.
4. Review and apply `supabase/migrations/20261117180000_gender_membership_products.sql`, `20261117190000_membership_tiers.sql`, `20261117200000_launch_trial_allocation.sql` and `20261117210000_membership_connection_limits.sql` in order to the **marriage project**, then deploy `verify-membership`, `membership-offer` and `apple-notifications` with the updated shared verifier. No hosted migration/deployment was performed by this code change.
5. For a test backend, configure `APPLE_STORE_ENV=Sandbox` and the trusted Apple roots described in `supabase/README.md`; set the notifications-v2 sandbox URL in App Store Connect. Keep test accounts and environment isolated from production. The verifier deliberately does not accept Xcode-signed local transactions or arbitrary decoded JSON.
6. Build/sync the Capacitor application on macOS and upload a new signed TestFlight build. JavaScript deployment alone does not replace `AppleMembershipPlugin.swift` in an installed app. Use approved test profiles of **both genders** whose membership gate is open; no eligibility gate is bypassed for testing.

## Local StoreKit UI testing (Mac/Xcode)

`ios/App/Wudayn.storekit` contains both products and Saudi test prices. Add it to the Xcode project if needed; Edit Scheme → Run → Options → StoreKit Configuration → select this file. It is intentionally **not enabled in the shared release scheme**. Use Xcode's transaction manager for purchase cancellation, pending approval, renewal, expiration and refund UI scenarios.

Local Xcode transactions are **not App Store-signed**: the live server must reject them and the app must not unlock paid access. Use Apple sandbox/TestFlight for the complete purchase → server verification → entitlement → finish cycle. Disable the local configuration for that test.

## Acceptance checklist on real iPhones

- Male approved profile: paywall and Apple sheet show SAR 149.99/month. Female profile: SAR 99.99/month. Product must match the profile; missing/unknown profile refuses purchase.
- Cancel and Ask to Buy/pending do not unlock access. Success unlocks only after the server verifies the signed JWS. Lose network after payment, relaunch and confirm transaction replay delivers once; finish follows successful server delivery.
- Restore after reinstall and restore twice: same owner recovers access without double delivery. Another Wudayn account cannot claim the transaction. Opposite-gender product is rejected by the receipt RPC, including a notification.
- Renewal extends access; refund/revocation and expiration remove access. An older transaction notification cannot reverse a newer revocation. Rejected/unsupported products never grant access.
- Confirm Apple subscription management does not offer the opposite-gender plan. The native purchase flow checks existing Wudayn entitlements before buying, preventing a second simultaneous purchase even across the two groups. Check notifications and subscription management on the sandbox account.

Automated checks: `npm run typecheck`; `node --experimental-strip-types --test tests/membership-billing.test.mjs` from `iphone/`; `node --test membership-products.test.mjs` from `iphone/supabase/tests/` with its locked dependencies installed. Native compilation and hardware sandbox acceptance require macOS/Xcode and App Store Connect configuration.

Apple references: [testing environments](https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox), [sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox), [StoreKit configuration](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode).

## Free / Premium and launch offer (17 November 2026)

### Pricing revision awaiting Apple offer-code integration

The requested next billing sequence is a free first week for at most 50 approved men and 50 approved women, then one discounted month at SAR 149.99 / 99.99, then regular monthly renewal at SAR 199.99 / 129.99. This is **not implemented** by the current purchase bridge. Apple's introductory free trial alone renews at the regular product price. A separate subscription offer code can follow the introductory trial when App Store Connect is configured to allow both, but the code must be created, redeemed, verified, and tested. Do not change the regular App Store Connect prices to 199.99 / 129.99 or advertise the full sequence until that work is complete; the current native bridge checks 149.99 / 99.99 and would reject a mismatched Saudi product. The paywall currently displays the verified StoreKit price only. See [Apple's offer-code setup](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-subscription-offer-codes/).

Approved free members may browse every **eligible** profile (normal blocks, preferences, review, pause and exclusivity still apply), receive/accept requests and communicate after the existing mutual seriousness agreement. Luna onboarding remains before payment. They may send interest notifications for free; initiating a formal introduction request requires Premium. Only the recommended feed returns a compatibility percentage; free directory/inbox/profile responses omit the fit and its evidence. Premium members retain all existing compatibility details and initiation. Free members may have one active connection; Premium members may have three. Existing connections survive subscription expiry, but new connections require available capacity. Both tiers retain safety, privacy and consent controls. Do not interpret payment as verified identity or guaranteed seriousness.

The member seal is generated artwork at `public/brand/wudayn-member-seal.png`; its status comes from server entitlements, not a profile-edit field. Trial/manual-access members have the Premium entitlement too.

### Entitlement audit follow-up

The member-facing Premium differences are initiation of formal requests, three simultaneous connections instead of one, compatibility percentages/details across eligible profiles, minimum-percentage discovery filtering, personalized conversation prompts, and the membership badge. The comparison gives minimum-percentage filtering and agreement/disagreement details their own Premium rows, separate from directory percentages. Interest remains free. The filter UI now offers an upgrade action to free members instead of accepting a threshold the server ignores; stale free thresholds are cleared.

Pausing/resuming discovery is free and is deliberately omitted from the paywall. Settings now follows approved-member eligibility rather than paid status; the existing server pause operation preserves accepted conversations. Staff-curated introductions still require both members to have paid access in the service-only `assign` / `operator_candidates` workflow. This is an existing operational restriction, not an advertised guaranteed subscription benefit. Product approval is required before changing that workflow or marketing it as a member entitlement. This audit used the final migrated local database; hosted deployment was not checked.

### Exact billing decision

The implemented products renew at SAR **149.99/month** for men and **99.99/month** for women. The current paywall shows Apple's localized price without a crossed-out comparison or future price. This is the implemented catalog, not completion of the later requested discount sequence described above. Do not change the regular product prices independently of the purchase integration. Existing subscribers are directed to Apple for their actual renewal price, which may differ from the new-member catalog.

### First 50 men / first 50 women: Apple-approved free week

1. For each monthly product, create an introductory offer in App Store Connect: Saudi Arabia, **Free**, **1 week**. Leave the regular prices at 149.99 / 99.99. Do not also create a paid introductory discount. Decide the availability dates deliberately.
2. Create an **In-App Purchase key** under Users and Access → Integrations → In-App Purchase. Securely configure `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID` on the backend. These are server secrets; never place them in Vite variables, the app, Git or chat. This is the IAP signing key, not a Sign in with Apple key.
3. The new `membership-offer` Edge Function verifies the live member session and Apple-signed `AppTransaction`, then signs StoreKit introductory eligibility. `Product.PurchaseOption.introductoryOfferEligibility(compactJWS:)` is back-deployed to supported iOS versions with the current Xcode SDK. Confirm this in the signed native build.
4. The database campaigns start **disabled**. After migration, function deployment, keys and sandbox acceptance, an authorized operator may enable the two rows in `marriage.launch_offer_campaigns`. Capacity is constrained to 50 for each gender; do not reset claims or copy sandbox claims to production.
5. Viewing the paywall does not reserve a place. Tapping purchase reserves one for the approved member / Apple app-transaction identity under a database row lock. Repeated attempts reuse it. A cancelled or pending purchase keeps its reservation, because Apple can finish later. Thus this means the first 50 eligible members per gender who start the offer, not necessarily the first 50 completed charges. Reservations alone never grant access.
6. StoreKit receives a server-signed true/false eligibility decision **for every new purchase**. If the displayed free place becomes unavailable, the client stops and asks to refresh rather than silently charging immediately. Existing subscribers are ineligible; Apple eligibility must also pass.
7. Only verified, account-bound Apple receipts activate Premium. Introductory transactions for these products additionally need the reserved launch place; the reservation binds to one original subscription. A normal renewal at the monthly price continues through the existing receipt flow. Revocations/expired notifications still process. Cancel via Apple to avoid renewal; deleting Wudayn does not cancel Apple billing.

**Release boundary:** Apple does not provide a storefront-wide numeric cap on ordinary introductory offers. This implementation enforces the cap through Wudayn's signed purchase flow and receipt gate. Do not promote these subscriptions for out-of-app purchase or ship older builds that omit the signed eligibility option. Test App Store / Manage Subscriptions entry points before release: an out-of-flow trial without a reservation is rejected by the entitlement server and may require Apple cancellation/support. If unrestricted external redemption must be supported, use a separately designed capped offer-code campaign instead; do not claim the App Store offer itself is capped at 100.

The local StoreKit file includes the one-week offer for UI testing, but Xcode signatures are deliberately not trusted by the hosted verifier. Test the full allocation/signature/renewal flow in Apple's sandbox with the actual signing configuration. No live campaign activation or App Store offer creation has been performed by this code change.

### Resume validation

- Member: `node --experimental-strip-types --experimental-vm-modules --test tests/membership-billing.test.mjs tests/membership-offer.test.mjs tests/membership-recovery.test.mjs tests/membership-screen.test.mjs tests/compatibility-live-ui.test.mjs`, then `npm run typecheck`.
- Database: `node --test membership-tiers.test.mjs membership-products.test.mjs` from `supabase/tests`.
- Browser previews: `tests/fixtures/membership-qa.html` (`?gender=woman`, `?trial=false`, `?active=true`) and `tests/fixtures/explore-qa.html?tier=free`. Fixtures use local fictional data and do not make purchases.
- Native acceptance: both genders, eligible/ineligible/exhausted campaign, wrong Apple account, old build, cancellation/Ask to Buy, restore on another device, trial conversion, refund/revocation, subscription expiry with continuing accepted chat, App Store external entry paths. Windows/browser checks cannot establish these outcomes.

### Pre-submission audit fixes (17 November 2026)

- Changed trial eligibility or storefront price invalidates the displayed offer before checkout and exposes refresh; missing prices cannot advertise a free week.
- Failed background receipt delivery retries while visible, on reconnect and on resume; it finishes only after successful server verification for the same signed-in account.
- The call-provider identity follows account access rather than Premium status, so upgrading or expiry does not remount an allowed call or the member UI.
- Shared-tier database tests exercise free voice-call consent/token access, family invitations/consent and exclusivity after Premium expiry. Existing family/relationship suites use approved-member fixtures rather than obsolete intake data; voice assertions preserve access after expiry.
- Browser checks cover trial, no trial, active membership and unavailable-price states at 375×812, 390×844 and 430×932. Fixed low-contrast offer refresh and added space before the management button when there is no expiry date. These are browser layouts, not native safe-area or StoreKit acceptance.
- Deployment, signing keys, campaign activation, App Store Connect prices/offers, a signed native build, and Apple sandbox purchase/restore/renewal/refund checks remain release gates. Local tests and browser previews do not establish those outcomes.

References: [Apple introductory eligibility signatures](https://developer.apple.com/documentation/storekit/generating-jws-to-sign-app-store-requests), [introductory offers](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/).

## وسام الجدية (new higher tier)
Create `com.blindmatch.marriage.monthly.seriousness` as a monthly auto-renewable subscription at SAR 299.99 for men, and `com.blindmatch.marriage.monthly.seriousness.women` at SAR 199.99 for women. Place each in its corresponding gender's existing Premium subscription group, ranked above that Premium product. The local StoreKit catalog models these two upgrade paths. No introductory trial is offered by this integration for the higher tier. Checkout fetches Apple's localized price; native SAR validation expects 299.99 / 199.99. The original seriousness product remains accepted for legacy receipts from either gender, while new checkout selects the gender-specific product.

Capacity is now Free **1**, Premium **2**, وسام الجدية **3** simultaneous connections. Verified, unexpired higher-tier transactions activate its teal badge and a bounded discovery preference: a 0.05 ranking bonus among eligible filtered candidates and 2× weighted random ordering in the returned directory. This does not change compatibility scores, bypass filters/blocks, or guarantee a position. Free compatibility previews are limited to three stable weekly recommendations; directory percentages and full details remain paid.

Apply the local migrations `20261117220000_seriousness_membership.sql`, `20261117230000_membership_tier_capacity.sql`, `20261117235900_membership_entitlements.sql` and `20261117235930_membership_discovery.sql` in order, and deploy the updated membership-offer and receipt verification functions before testing purchases. These follow the earlier membership migrations listed above. The native bridge no longer mistakes an existing Premium receipt for a completed higher-tier upgrade. Local receipt tests cover stale replays, product substitution, revocation and tier capacity; discovery tests cover visibility, filters and the free preview cap. No hosted migration, Apple configuration, signing or deployment has been performed. Native Sandbox purchase/upgrade/restore/renewal/revocation checks remain release gates.

The higher tier also initiates Luna's shared deep compatibility report from an accepted chat; the recipient can participate on any tier. Deploy `20261118010000_deep_compatibility.sql` and its server endpoint after the membership changes. See [DEEP_COMPATIBILITY.md](DEEP_COMPATIBILITY.md) for disclosure review, privacy boundaries, retention, and release checks.
