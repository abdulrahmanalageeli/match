# Admin incident and Event3 fixes — 30 August 2026

## What caused the admin lag

Production requests were waiting on an unavailable database connection. Vercel logs from the then-current deployment (`c51f40d`) include `/api/admin` GET and POST requests ending with HTTP 504 after **300 seconds** around 09:14 UTC (12:14 Riyadh). `/api/twilio-status` also timed out. An admin WhatsApp-inbox request logged a Supabase HTTP 522 connection-timeout response. Related inbox, configuration, and upcoming-event summary failures occurred on 29 August too.

Two independent Supabase SQL health queries failed with connection timeouts around 09:19 and 09:25 UTC. PostgreSQL logs included a statement timeout at 09:10:41 UTC. This supports a database connectivity/availability incident; it does not establish whether CPU, memory, connection capacity, a particular query, or provider infrastructure caused it.

The database recovered without a restart or configuration change from this task. Successful checks at 09:32–09:33 UTC showed 14 database connections, one active query (the diagnostic itself), no lock waiters, and no other active query. Those recovery snapshots cannot explain the earlier outage or guarantee that it will not recur.

The frontend amplified the incident: admin reads had no short deadline, duplicate reads could overlap, and cohost polling could discard every successful response when it took longer than the polling interval. A partial feedback failure could also refresh the shared update time and hide stale data.

## Changes

- Database requests now have a per-request deadline: 15 seconds for reads and 60 seconds for writes. Timeout errors use `AbortError` so Supabase does not automatically repeat them. Upstream gateway HTML errors become structured availability errors. This is not a global deadline for a handler containing several sequential database calls; long matching operations are not automatically retried.
- Admin reads have a 20-second client deadline and share identical in-flight requests. Writes are never deduplicated or retried by this wrapper. Main admin stops waiting for ancillary data before displaying participants. Background polling skips hidden tabs where updated, and the shared polling hook prevents overlapping calls.
- Main admin, Event3 admin, and cohost show a connection warning for stalled or failed reads while retaining the last successful data. A partial feedback refresh no longer advances the timestamp for the whole section. Slow/failed admin responses now log their action, duration, and status without request bodies or attendee details.
- Both participant result/history response paths remove contact details and the partner's yes/no choice unless consent is mutual. Partner organizer notes are always removed. This closes the response exposure; it does not establish that anyone previously accessed it.
- Verified Event3 participants have separate rate-limit buckets, with a coarse shared-IP flood limit. Login/OTP limits remain separate. The limiter is still per server instance, not a distributed global abuse-control service.
- Phase2/Phase3 auto-rejoin initializes once per meeting instead of resetting an unfinished feedback form on each poll.
- Support messages append atomically in PostgreSQL. Concurrent first messages serialize per attendee/event. Host and cohost replies retain both messages; closed requests reject further replies. Cohost displays the full conversation with table and partner context.
- Hosts can send urgent alerts that appear during active meetings/ranking/feedback and require successful acknowledgement. Ordinary messages remain queued for safe moments. The cohost labels acknowledgement counts explicitly. Urgent delivery still requires the attendee's device to be online and polling; use in-person announcements if connectivity fails.

## Verification and database rollout

- **261 server tests passed**, including nine new reliability tests and the existing ranking-persistence suite. The suite covers completing ranking two on phase exit, including remaining attendees, and retaining saved ordering.
- New tests cover response privacy, 50 verified attendees sharing an IP, stalled fetch deadlines, the real Supabase client's no-retry behavior, read deduplication and event separation, upstream HTML failures, and the actual support migration SQL in PGlite. PGlite checks first-message serialization behavior, both organizer replies, event/participant isolation, closed requests, and denied public execution. It is not a production load test.
- The production build passed with Node 22.22. Type checking still reports 44 pre-existing errors outside the changed Event3/admin screens; the repository is not type-clean.
- Synthetic browser checks using the actual route components verified: seven-second dashboard responses update successfully; an individual-feedback outage stays visibly flagged while other data updates; cohost sees the full support conversation and partner/table; feedback survives repeated polls; an urgent alert overlays an unfinished feedback form; a failed acknowledgement stays open; a successful retry closes the alert and preserves the confirmed feedback score and step. No unexpected console errors were observed in those flows.
- Applied `20260830093718_event3_atomic_support_chat` to the production database. Live grants confirm both functions are security-invoker and executable by `service_role`, not `anon` or `authenticated`. Security advisories were unchanged: 48 total, including the existing PostgreSQL-version warning. The version upgrade requires a separate planned maintenance operation; see [Supabase's upgrade guidance](https://supabase.com/docs/guides/platform/upgrading).
- No attendee messages, real feedback submissions, attendance, rankings, or event phases were changed during verification. Browser/API failure fixtures were synthetic. The migration adds functions and an index without rewriting attendee conversations.

## Operational limits

These fixes make outages shorter and visible; they cannot repair a Supabase outage from the browser. If connection warnings return, avoid interpreting stale submission counts as missing attendee responses. Check database availability and the new action-duration logs before advancing the event. A shared ownership/attention queue and a before-advance checklist remain optional follow-up features. Venue Wi-Fi, mobile background behavior, and real SMS delivery still need an on-site rehearsal.
