create table public.event3_pair_readings (
  id uuid primary key,
  cache_key text not null unique,
  event_id integer not null,
  participant_a integer not null,
  participant_b integer not null,
  model text not null,
  status text not null check (status in ('pending', 'complete', 'error')),
  insight jsonb,
  token_usage jsonb,
  estimated_cost_usd numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (participant_a < participant_b),
  check (status <> 'complete' or insight is not null)
);
alter table public.event3_pair_readings enable row level security;
revoke all on public.event3_pair_readings from public, anon, authenticated;
grant select, insert, update, delete on public.event3_pair_readings to service_role;
comment on table public.event3_pair_readings is 'Private AI pair readings. Access only through participant-token and exact-event-pair authorization in the server API.';
