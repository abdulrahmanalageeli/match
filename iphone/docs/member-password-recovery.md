# Member password recovery

The email/password login screen now includes **نسيت كلمة المرور؟**. It requests a Supabase password reset email and displays the same acknowledgement whether or not the email belongs to an account. Nothing sends email during startup, builds, or tests.

Recovery callbacks use `?auth=recovery`. The app accepts Supabase's default implicit recovery fragment (`type=recovery` with access and refresh tokens) or a custom template's `type=recovery&token_hash=…` callback. Invalid or expired links show a fresh-link action. OAuth/PKCE authorization codes are not treated as recovery credentials.

Recovery uses a separate client with no persistence or automatic token refresh. Recovery callbacks take priority over both family and demo entry routes; their credentials are captured and removed from the address bar before those screens mount. Member session restoration, discovery and chat do not mount while processing a callback. The provider verifies the user, and password updates recheck that user. Successful changes attempt global refresh-session revocation and both local member-session cleanups independently; cancellation clears the temporary recovery session. Returning from recovery requires explicit login and never restores a stored member session, even when cleanup failed. Existing issued access tokens may remain valid until their normal expiry.

## Deployment configuration required

- The web default redirect is the current origin and pathname with `?auth=recovery`. Allowlist that exact destination in the same Supabase project's Auth redirect settings. Serve the production callback over HTTPS.
- The destination must be a real production/staging web build with its matching marriage backend, not a fictional hosted demo. Hosted Vercel consumer previews currently require `build:demo` and cannot perform real recovery: they still recognize and scrub the callback, show an explicit unavailable/support state, and return to the demo gate. This change does not relax that deployment restriction or enable live access in demos.
- Native iPhone builds have no member-auth deep-link receiver. Set `VITE_MARRIAGE_PASSWORD_RESET_URL` to the HTTPS deployment of this web app connected to the **same marriage project**, and allowlist its exact `?auth=recovery` URL. The email opens the browser, where the member changes the password, then returns to the app to sign in. An unset/invalid native URL displays the support contact instead of offering a nonfunctional email action.
- Configure the verified email sender/custom SMTP for delivery to public users. Keep the standard recovery email confirmation link, or explicitly use a `type=recovery&token_hash={{ .TokenHash }}` URL pointing at this app. Never put service-role credentials in the client.
- Local-service and disconnected demo accounts do not have a simulated recovery endpoint; they display the support fallback.

These settings were not changed remotely. Before release, use an authorized test account to verify delivery, valid and expired links, password change, sign-in with the new password, and iPhone-to-browser return. Local tests exercise the callback parser and provider interaction with synthetic credentials, not a live email or real account.

Reference: [Supabase password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).
