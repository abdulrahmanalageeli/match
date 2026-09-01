create table if not exists public.participant_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  assigned_number integer not null,
  document_bundle_version text not null,
  terms_version text not null,
  privacy_notice_version text not null,
  acceptance_source text not null default 'participant_popup'
    check (acceptance_source in ('participant_popup', 'survey_registration', 'admin_recorded')),
  accepted_at timestamptz not null default now(),
  event_id integer,
  document_urls jsonb not null default '{"terms":"/terms","privacy":"/privacy","event":"/about"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_legal_acceptances_version_unique
    unique (participant_id, document_bundle_version)
);

create index if not exists idx_participant_legal_acceptances_version
  on public.participant_legal_acceptances(document_bundle_version, accepted_at desc);

create index if not exists idx_participant_legal_acceptances_number
  on public.participant_legal_acceptances(assigned_number, accepted_at desc);

alter table public.participant_legal_acceptances enable row level security;

revoke all on table public.participant_legal_acceptances from anon, authenticated;
grant select, insert, update, delete on table public.participant_legal_acceptances to service_role;

comment on table public.participant_legal_acceptances is
  'Versioned, append-preserving participant acceptance ledger. Access is restricted to the service-role API.';

comment on column public.participant_legal_acceptances.acceptance_source is
  'How explicit acceptance was captured; never derived from marketing consent.';

create or replace function public.record_participant_legal_acceptance(
  p_participant_id uuid,
  p_assigned_number integer,
  p_document_bundle_version text,
  p_terms_version text,
  p_privacy_notice_version text,
  p_acceptance_source text,
  p_event_id integer,
  p_accepted_at timestamptz,
  p_document_urls jsonb
)
returns public.participant_legal_acceptances
language plpgsql
security invoker
set search_path = ''
as $$
declare
  acceptance public.participant_legal_acceptances;
begin
  if p_participant_id is null or p_assigned_number is null then
    raise exception 'Participant identity is required' using errcode = '22023';
  end if;

  insert into public.participant_legal_acceptances (
    participant_id,
    assigned_number,
    document_bundle_version,
    terms_version,
    privacy_notice_version,
    acceptance_source,
    accepted_at,
    event_id,
    document_urls,
    updated_at
  ) values (
    p_participant_id,
    p_assigned_number,
    p_document_bundle_version,
    p_terms_version,
    p_privacy_notice_version,
    p_acceptance_source,
    p_accepted_at,
    p_event_id,
    coalesce(p_document_urls, '{}'::jsonb),
    p_accepted_at
  )
  on conflict (participant_id, document_bundle_version) do update set
    terms_version = excluded.terms_version,
    privacy_notice_version = excluded.privacy_notice_version,
    event_id = excluded.event_id,
    document_urls = excluded.document_urls,
    updated_at = excluded.updated_at
  returning * into acceptance;

  update public.participants
  set terms_version = p_terms_version,
      privacy_notice_version = p_privacy_notice_version,
      consented_at = acceptance.accepted_at
  where id = p_participant_id
    and assigned_number = p_assigned_number;

  if not found then
    raise exception 'Participant no longer exists' using errcode = 'P0002';
  end if;

  return acceptance;
end;
$$;

revoke all on function public.record_participant_legal_acceptance(
  uuid, integer, text, text, text, text, integer, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.record_participant_legal_acceptance(
  uuid, integer, text, text, text, text, integer, timestamptz, jsonb
) to service_role;
