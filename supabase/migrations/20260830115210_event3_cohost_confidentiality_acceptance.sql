create table public.event3_cohost_agreements (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  agreement_version text not null,
  agreement_hash text not null check (agreement_hash ~ '^[0-9a-f]{64}$'),
  agreement_text text not null check (char_length(agreement_text) between 100 and 20000),
  accepted_at timestamptz not null default now(),
  constraint event3_cohost_agreements_session_version_key unique (session_hash, agreement_hash)
);

alter table public.event3_cohost_agreements enable row level security;
revoke all on table public.event3_cohost_agreements from public, anon, authenticated;
grant select, insert on table public.event3_cohost_agreements to service_role;
revoke update, delete, truncate on table public.event3_cohost_agreements from service_role;

comment on table public.event3_cohost_agreements is
  'Append-only confidentiality acknowledgments. Stores the exact terms, entered name and server timestamp; no passwords, bearer tokens or attendee data.';
