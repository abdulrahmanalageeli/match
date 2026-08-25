-- Canonical cache-session freshness schema. A completed timestamp is valid only
-- for the scorer version stored beside it.
create table if not exists public.cache_metadata (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null,
  last_precache_timestamp timestamptz not null default now(),
  total_participants_cached integer not null default 0,
  total_pairs_cached integer not null default 0,
  cache_session_duration_ms integer,
  ai_calls_made integer not null default 0,
  cache_hit_rate numeric,
  created_at timestamptz not null default now(),
  created_by text not null default 'admin',
  notes text,
  score_model_version text
);

create index if not exists idx_cache_metadata_event_model_freshness
  on public.cache_metadata (event_id, score_model_version, last_precache_timestamp desc);

drop function if exists public.record_cache_session(
  integer, integer, integer, integer, integer, numeric, text
);
drop function if exists public.record_cache_session(
  integer, integer, integer, integer, integer, numeric, text, text
);

create or replace function public.record_cache_session(
  p_event_id integer,
  p_participants_cached integer,
  p_pairs_cached integer,
  p_duration_ms integer,
  p_ai_calls integer,
  p_cache_hit_rate numeric,
  p_notes text,
  p_score_model_version text default null
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.cache_metadata (
    event_id,
    total_participants_cached,
    total_pairs_cached,
    cache_session_duration_ms,
    ai_calls_made,
    cache_hit_rate,
    notes,
    score_model_version
  ) values (
    p_event_id,
    p_participants_cached,
    p_pairs_cached,
    p_duration_ms,
    p_ai_calls,
    p_cache_hit_rate,
    p_notes,
    p_score_model_version
  );
end;
$$;

revoke execute on function public.record_cache_session(
  integer, integer, integer, integer, integer, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.record_cache_session(
  integer, integer, integer, integer, integer, numeric, text, text
) to service_role;

create or replace view public.v_cache_freshness
with (security_invoker = true)
as
with latest_metadata as (
  select distinct on (metadata.event_id) metadata.*
  from public.cache_metadata metadata
  order by metadata.event_id, metadata.last_precache_timestamp desc, metadata.id desc
), participant_scope as (
  select
    metadata.*,
    participant.assigned_number,
    (
      coalesce(participant.survey_data_updated_at, '-infinity'::timestamptz) > metadata.last_precache_timestamp
      or (
        participant.event_id = metadata.event_id
        and coalesce(participant.event_enrolled_at, participant.created_at, '-infinity'::timestamptz) > metadata.last_precache_timestamp
      )
      or (
        (participant.signup_for_next_event is true or participant.auto_signup_next_event is true)
        and coalesce(participant.next_event_signup_timestamp, '-infinity'::timestamptz) > metadata.last_precache_timestamp
      )
    ) as needs_recache
  from latest_metadata metadata
  left join public.participants participant
    on participant.assigned_number <> 9999
    and participant.attendance_denied_at is null
    and (
      participant.event_id = metadata.event_id
      or participant.signup_for_next_event is true
      or participant.auto_signup_next_event is true
    )
)
select
  scope.event_id,
  scope.last_precache_timestamp,
  scope.total_participants_cached,
  scope.total_pairs_cached,
  count(distinct scope.assigned_number) as total_participants_in_event,
  count(distinct scope.assigned_number) filter (where scope.needs_recache) as participants_needing_recache,
  case
    when scope.score_model_version is distinct from '2026-08-25-v7-balanced-100'
      then 'STALE_MODEL'
    when count(distinct scope.assigned_number) filter (where scope.needs_recache) > 0
      then 'STALE - ' || count(distinct scope.assigned_number) filter (where scope.needs_recache) || ' participants updated'
    else 'FRESH'
  end as cache_status,
  scope.created_at as last_cache_time,
  extract(epoch from now() - scope.last_precache_timestamp) / 3600::numeric as hours_since_cache,
  scope.score_model_version
from participant_scope scope
group by scope.id, scope.event_id, scope.last_precache_timestamp, scope.total_participants_cached,
  scope.total_pairs_cached, scope.created_at, scope.score_model_version;

revoke all on table public.v_cache_freshness from public, anon, authenticated;
grant select on table public.v_cache_freshness to service_role;
