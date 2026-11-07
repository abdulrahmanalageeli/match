# Private voice calls

This backend belongs only to Nisfayn (`wupkifqbwhhebwrgvwai`). It does not touch the BlindMatch event project. Agora carries microphone audio; SQL stores call lifecycle metadata, never recordings or audio. This first version supports foreground calls and private Realtime wakeups, without background incoming-call push or CallKit.

## Server contract

All RPCs require a confirmed Supabase user with an existing, unexpired `auth.sessions` row. Calls require an accepted conversation, eligible/unblocked accounts, and active paid memberships for both participants.

- `marriage_call_start(request_id uuid, client_id uuid)` starts ringing. Reuse the same random UUID nonce when retrying a network request.
- `marriage_call_state(call_id uuid = null)` returns the requested participant-owned call. Without an ID it prefers a live call, then the latest call ended within five minutes, otherwise `null`. Do not show an unsolicited ended call on initial mount.
- `marriage_call_act(call_id uuid, action text)` accepts `accept`, `decline`, or `end`. Only the recipient can accept/decline ringing; either participant can end active audio. Terminal calls never reopen.

The returned object is:

```ts
type VoiceCall = {
  id: string; requestId: string;
  status: 'ringing' | 'active' | 'ended';
  direction: 'incoming' | 'outgoing';
  createdAt: string; ringingUntil: string;
  acceptedAt: string | null; endedAt: string | null;
  endReason: 'declined' | 'cancelled' | 'ended' | 'missed' | 'expired' | 'unavailable' | null;
  person: PublicPerson | null;
}
```

Timestamps are ISO8601. A revoked conversation/account/membership returns no peer card. Existing private `marriage:member:<user UUID>` broadcasts send only the empty `changed` invalidation. Refresh state after wakeups and every five seconds while calling; keep the UI consistent with server state.

`POST /functions/v1/voice-token` accepts exactly `{ "callId": "uuid" }`, with the current user's Bearer JWT. It returns `{ appId, channel, uid, token, expiresAt, callId }` only for an active, mutually accepted call. It validates Supabase Auth, then invokes `marriage_call_token_grant(call_id)` under the same JWT. The SQL grant supplies only channel/UID/time metadata, never a signed Agora token. The Edge Function obtains the Agora certificate only from its environment.

The channel is `n_` plus the call UUID without hyphens. Caller/recipient UIDs are stable `1`/`2`; zero is never used. Credentials expire in at most 120 seconds. Renew at 60 seconds and on the SDK expiry callback. Any renewal failure, ended/revoked state, logout or foreground-only teardown must stop microphone capture and leave the Agora channel immediately.

## Bounds and configuration

Ringing expires after 45 seconds. Each participant must renew their own three-minute lease; one party cannot indefinitely keep an abandoned peer busy. Calls have a two-hour maximum. One live call per member is serialized with ordered member-row locks. Starts are limited to three per five minutes and ten per hour; token grants to six per minute per participant. Expiration occurs transactionally on state/start/action/grant RPCs, so no cleanup worker is required for eligibility or busy recovery.

Configure Edge-only `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` on Nisfayn. Enable Agora certificate-based token authentication. The official pinned `agora-token@2.0.7` AccessToken2 builder grants only channel join and audio publication; no video/data publication privileges are added. **Agora's enforcement of individual publish privileges also requires Co-host authentication enabled for the Agora project**; this provider setting is separate from client voice-only UI. The frontend must create only a microphone track.

Call end/block/revocation stops further token issuance immediately after the checked transaction. Already-issued provider tokens cannot be revoked by a database update and can remain usable for their remaining lifetime (at most 120 seconds); the client must also leave on server state changes. Do not claim instantaneous provider-side revocation or device testing unless verified separately.

Edge deployment uses `verify_jwt=false` because the function explicitly authenticates the JWT and SQL checks live session state. The function does not use a service-role key. Calls to any other Supabase project are refused by the handler. Responses are `no-store`; request/error logs must never include tokens, certificates, JWTs or peer profiles.

## Verification

`node --test voice.test.mjs` from `supabase/tests` tests participant isolation, direct permission denial, mutual consent, stable UID/channel, private wakeups, opposite-direction/busy starts, duplicate/late transitions, lease/ring/hard expiration, block/account/membership/session denial, and rate limits in disposable PostgreSQL. Ordered-lock race behavior is validated by state-transition tests and code review; the in-process harness does not simulate multi-connection transactions.

`deno test --allow-env --config functions/deno.json tests/voice_edge_test.ts` from `supabase` verifies actual Agora signatures and privilege payloads with synthetic credentials, rejects malformed/cross-call inputs, and tests the production Auth/RPC path through mocked HTTP. No live user or Agora account is used by these tests. A real two-device microphone test remains a separate release check.

Primary references: [Agora token server](https://docs.agora.io/en/realtime-media/rtc/build/authenticate-users/deploy-token-server), [official Node token builder](https://github.com/AgoraIO/Tools/tree/master/DynamicKey/AgoraDynamicKey/nodejs), [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth).
