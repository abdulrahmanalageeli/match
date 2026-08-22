# Supabase schema changelog

## 2026-08-22 — The Room event system

- Added a standalone, event-numbered data model for The Room: events, attendees,
  payment history, schedule generations, and round/table/seat assignments.
- Added an atomic payment RPC and an atomic schedule-replacement RPC.
- Enabled row-level security on every new table. `anon` and `authenticated`
  receive no access; only the server-side `service_role` can read or mutate this
  data through the independently authenticated `/api/the-room` endpoint.
- Kept the model isolated: there are no foreign keys or identifiers shared with
  BlindMatch, Event3, or the existing participant directory.

Migration: `20260822122616_create_the_room_event_system.sql`

Follow-up: `20260822122850_harden_the_room_access_and_indexes.sql` adds
explicit service-only RLS policies and covering indexes for every composite
foreign key reported by the database advisor.
