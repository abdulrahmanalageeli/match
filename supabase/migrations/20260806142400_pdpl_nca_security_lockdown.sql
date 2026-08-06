-- PDPL/NCA technical control baseline. The browser no longer accesses PostgREST
-- directly; all application data access is mediated by authenticated server APIs.

alter table public.participants
  add column if not exists terms_version text,
  add column if not exists privacy_notice_version text,
  add column if not exists consented_at timestamptz,
  add column if not exists consent_withdrawn_at timestamptz,
  add column if not exists marketing_consent boolean not null default false;

create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null default 'system',
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  outcome text not null default 'success',
  request_id text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);
create index if not exists security_audit_logs_created_at_idx on public.security_audit_logs (created_at desc);
create index if not exists security_audit_logs_expires_at_idx on public.security_audit_logs (expires_at);
create index if not exists security_audit_logs_action_idx on public.security_audit_logs (action, created_at desc);

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(id) on delete set null,
  assigned_number integer,
  request_type text not null check (request_type in ('access', 'correction', 'deletion', 'withdraw_consent', 'restriction', 'objection')),
  status text not null default 'verified' check (status in ('received', 'identity_pending', 'verified', 'in_progress', 'completed', 'rejected')),
  identity_verified_at timestamptz,
  due_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists data_subject_requests_status_due_idx on public.data_subject_requests (status, due_at);
create index if not exists data_subject_requests_participant_idx on public.data_subject_requests (participant_id, created_at desc);

-- Existing browser-stored participant secrets may have appeared in URLs or logs.
-- Rotate all of them; account recovery remains available through Twilio Verify OTP.
update public.participants
set secure_token = gen_random_uuid()::text,
    updated_at = now()
where assigned_number <> 9999;

-- Do not assert consent that was not captured through the new explicit controls.
update public.participants
set terms_version = null,
    privacy_notice_version = null,
    consented_at = null,
    consent_withdrawn_at = null,
    marketing_consent = false;

-- Remove oversized provider payloads and public receipt URLs from retained data.
update public.whatsapp_messages set twilio_payload = '{}'::jsonb;
update public.participant_receipts
set receipt_url = storage_path
where storage_path is not null;
update public.participants p
set receipt_url = (
  select pr.storage_path
  from public.participant_receipts pr
  where pr.participant_id = p.id and pr.storage_path is not null
  order by pr.received_at desc
  limit 1
)
where p.receipt_url is not null
  and exists (select 1 from public.participant_receipts pr where pr.participant_id = p.id and pr.storage_path is not null);

-- Remove every permissive policy, enable RLS for every public table, and rely on
-- the service role only. This is deliberate because there are no direct browser
-- database calls in the application.
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;

  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('revoke all privileges on table public.%I from anon, authenticated', r.relname);
    execute format('grant select, insert, update, delete on table public.%I to service_role', r.relname);
  end loop;
end $$;

revoke all privileges on all sequences in schema public from anon, authenticated;
grant usage, select, update on all sequences in schema public to service_role;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select, update on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Make exposed views obey the invoker's permissions and remove public grants.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = true)', r.relname);
    execute format('revoke all privileges on table public.%I from anon, authenticated', r.relname);
    execute format('grant select on table public.%I to service_role', r.relname);
  end loop;
end $$;

-- Pin function resolution to trusted schemas to prevent search-path attacks.
do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('alter function %I.%I(%s) set search_path = pg_catalog, public, pg_temp', r.nspname, r.proname, r.args);
  end loop;
end $$;

-- Receipts contain financial information and must never be public.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']::text[]
where id = 'receipts';

do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Automated expiry for security logs and communications content.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'blindmatch-expire-security-audit',
  '17 2 * * *',
  $$delete from public.security_audit_logs where expires_at < now()$$
)
where not exists (select 1 from cron.job where jobname = 'blindmatch-expire-security-audit');
select cron.schedule(
  'blindmatch-expire-whatsapp-content',
  '37 2 * * *',
  $$delete from public.whatsapp_messages where created_at < now() - interval '180 days'$$
)
where not exists (select 1 from cron.job where jobname = 'blindmatch-expire-whatsapp-content');

notify pgrst, 'reload schema';
