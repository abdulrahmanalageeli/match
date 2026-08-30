# Admin connection warning follow-up — 30 August 2026

## Evidence

- At investigation time, production deployment `dpl_ApfNJPsRTuvUW9vsNdkTcJ2SMJnf` was ready on commit `3e99d49`. Vercel recorded `/api/admin` POST responses with HTTP 405 at 09:50:53, 09:51:58, and 09:53:26 UTC. No 5xx responses were returned by the query for this deployment covering 09:36–09:56 UTC.
- The main dashboard calls `get-max-event-id` on each refresh, but the API had no matching action. Executing the actual handler with synthetic database/auth dependencies reproduced HTTP 405. The existing banner classified every failed read as a connection problem, and its labels did not identify this action.
- A live database check at 09:56:09 UTC succeeded with 21 connections, one active query, and no lock waiters. A read-only aggregate of the relevant event IDs returned a maximum of 26. These checks establish availability at those moments, not a guarantee against intermittent outages.

## Fix

- Implement the missing admin-protected maximum-event read. Read at most one ID from each history table, scoped to the existing match, and include the current event even if it has no results yet. An unavailable source returns an error instead of a false maximum. No migration or event-data changes are required.
- Include POST `participants` in the bounded read wrapper. Rejected or malformed participant responses preserve the existing list and stored counts.
- Preserve HTTP status in health events without emitting a duplicate error that overwrites it. The banner distinguishes request rejection and expired sessions from connection failures, identifies affected reads, and includes an explicit page-reload button. A successful unrelated request does not clear an outstanding error.
- Include 4xx responses in the existing action/duration logs; no request bodies or credentials are added to those logs.

## Verification and release state

- Seven new regression tests cover the real handler dispatch, historical/current maximum IDs, empty data versus unavailable data, admin authorization, participant read deadlines, HTTP health events, and preserving participant rows/counts on failed reads.
- All 273 server and app-library tests passed using Node 24.19.
- Synthetic browser checks of the actual component verified HTTP 405 versus 503 versus 401 messages, persistence after an unrelated successful read, clearing after a successful retry, and the reload button. No browser console errors were observed.
- Production build passed using bundled Node 24.19. TypeScript still reports 44 existing errors outside the changed files, matching the preceding review.
- These checks were completed before release. A successful local build does not establish production deployment status; no database migration is required for this follow-up.
