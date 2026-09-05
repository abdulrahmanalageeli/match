alter table public.event_state
  add column if not exists event3_participant_access_locked boolean not null default false;

comment on column public.event_state.event3_participant_access_locked is
  'Host-controlled admission gate for the Event3 participant experience. The public tutorial remains available while the live game is closed.';
