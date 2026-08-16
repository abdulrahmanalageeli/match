-- Durable, service-role-only audit trail for destructive participant account merges.
-- The generic JSONB backup keeps the complete pre-merge rows so an operator can
-- reconstruct either participant records or related history if a merge is reversed.

create table if not exists public.participant_account_merge_batches (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  duplicate_phone_groups integer not null,
  merged_account_count integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.participant_account_merge_log (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.participant_account_merge_batches(id) on delete restrict,
  phone_hash text not null,
  survivor_id uuid not null,
  survivor_number integer not null,
  merged_id uuid not null,
  merged_number integer not null,
  questionnaire_donor_id uuid not null,
  questionnaire_donor_number integer not null,
  created_at timestamptz not null default now(),
  unique (batch_id, merged_id)
);

create table if not exists public.participant_account_merge_backup (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.participant_account_merge_batches(id) on delete restrict,
  source_table text not null,
  row_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists participant_account_merge_log_batch_idx
  on public.participant_account_merge_log(batch_id);

create index if not exists participant_account_merge_backup_batch_table_idx
  on public.participant_account_merge_backup(batch_id, source_table);

alter table public.participant_account_merge_batches enable row level security;
alter table public.participant_account_merge_log enable row level security;
alter table public.participant_account_merge_backup enable row level security;

comment on table public.participant_account_merge_batches is
  'Service-role-only audit metadata for participant account merge operations.';
comment on table public.participant_account_merge_log is
  'Maps every removed participant account to its surviving account and questionnaire donor.';
comment on table public.participant_account_merge_backup is
  'Complete pre-merge JSONB snapshots of participant and related rows touched by a merge.';
