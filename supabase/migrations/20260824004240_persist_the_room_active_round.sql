-- Keep the live round authoritative across organizer and projector devices.
-- Browser clients continue to use the authenticated server API; this does not
-- grant anon or authenticated roles any direct table access.
alter table public.the_room_events
  add column active_round integer not null default 1;

alter table public.the_room_events
  add constraint the_room_events_active_round_within_event
  check (active_round >= 1 and active_round <= round_count);

comment on column public.the_room_events.active_round is
  'Server-authoritative live round shared by every organizer and projector device.';
