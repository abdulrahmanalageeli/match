create table public.event_state (
  match_id uuid not null,
  phase text null default 'waiting'::text,
  announcement text null,
  announcement_type text null default 'info'::text,
  announcement_time timestamp with time zone null,
  emergency_paused boolean null default false,
  pause_time timestamp with time zone null,
  current_round integer null default 1,
  total_rounds integer null default 4,
  global_timer_active boolean null default false,
  global_timer_start_time timestamp with time zone null,
  global_timer_duration integer null default 1800,
  global_timer_round integer null,
  results_visible boolean null default true,
  registration_enabled boolean null default true,
  current_event_id integer null default 1,
  constraint event_state_pkey primary key (match_id)
) TABLESPACE pg_default;

create index IF not exists idx_event_state_global_timer on public.event_state using btree (global_timer_active, global_timer_start_time) TABLESPACE pg_default;

create index IF not exists idx_event_state_results_visible on public.event_state using btree (results_visible) TABLESPACE pg_default;

create index IF not exists idx_event_state_registration_enabled on public.event_state using btree (registration_enabled) TABLESPACE pg_default;