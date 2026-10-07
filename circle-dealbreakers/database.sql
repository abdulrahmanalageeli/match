create table if not exists public.circle_dealbreakers (
  id uuid primary key,
  text text not null check (char_length(text) between 3 and 600),
  created_at timestamptz not null default now()
);

alter table public.circle_dealbreakers enable row level security;
revoke all on table public.circle_dealbreakers from public, anon, authenticated;
grant select, insert on table public.circle_dealbreakers to service_role;

comment on table public.circle_dealbreakers is
  'Anonymous event submissions. Access only through the server-side submission function.';
