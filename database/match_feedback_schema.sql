create table public.excluded_pairs (
  id uuid not null default gen_random_uuid (),
  match_id uuid not null,
  participant1_number integer not null,
  participant2_number integer not null,
  created_at timestamp with time zone null default now(),
  created_by text null default 'admin'::text,
  reason text null default 'Admin exclusion'::text,
  constraint excluded_pairs_pkey primary key (id),
  constraint different_participants check ((participant1_number <> participant2_number))
) TABLESPACE pg_default;

create index IF not exists idx_excluded_pairs_match_id on public.excluded_pairs using btree (match_id) TABLESPACE pg_default;

create index IF not exists idx_excluded_pairs_participants on public.excluded_pairs using btree (participant1_number, participant2_number) TABLESPACE pg_default;

create unique INDEX IF not exists idx_excluded_pairs_unique_bidirectional on public.excluded_pairs using btree (
  match_id,
  LEAST(participant1_number, participant2_number),
  GREATEST(participant1_number, participant2_number)
) TABLESPACE pg_default;