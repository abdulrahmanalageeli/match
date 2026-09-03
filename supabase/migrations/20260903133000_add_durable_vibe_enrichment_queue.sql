-- Persist the deterministic archetype base as a progressive checkpoint, then
-- finalize the v12 percentage with required AI chemistry through this
-- retryable server-only queue. Deferred rows never count as complete coverage.

create table if not exists public.compatibility_vibe_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null,
  match_id uuid not null,
  participant_a_number integer not null,
  participant_b_number integer not null,
  combined_content_hash text not null,
  vibe_content_hash text not null,
  score_model_version text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compatibility_vibe_jobs_ordered
    check (participant_a_number < participant_b_number),
  constraint compatibility_vibe_jobs_status
    check (status in ('pending', 'processing', 'completed', 'obsolete', 'failed')),
  constraint compatibility_vibe_jobs_attempt_count
    check (attempt_count >= 0),
  constraint compatibility_vibe_jobs_identity
    unique (participant_a_number, participant_b_number, combined_content_hash)
);

create index if not exists compatibility_vibe_jobs_pending_idx
  on public.compatibility_vibe_enrichment_jobs (available_at, created_at)
  where status = 'pending';

create index if not exists compatibility_vibe_jobs_processing_idx
  on public.compatibility_vibe_enrichment_jobs (locked_at)
  where status = 'processing';

alter table public.compatibility_vibe_enrichment_jobs enable row level security;
alter table public.compatibility_vibe_enrichment_jobs force row level security;

revoke all on table public.compatibility_vibe_enrichment_jobs from public;
revoke all on table public.compatibility_vibe_enrichment_jobs from anon;
revoke all on table public.compatibility_vibe_enrichment_jobs from authenticated;
grant select, insert, update, delete on table public.compatibility_vibe_enrichment_jobs to service_role;

-- Store the provisional cache rows and their enrichment jobs in one
-- transaction. This closes both failure windows: a durable cache row can never
-- be left without a job, and a fast worker can never be overwritten by the
-- foreground request after it has already enriched the row.
create or replace function public.store_deferred_v11_compatibility_cache(
  p_cache_rows jsonb,
  p_jobs jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored integer := 0;
  cache_row_count integer := 0;
  job_row_count integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_cache_rows) <> 'array'
    or pg_catalog.jsonb_typeof(p_jobs) <> 'array' then
    raise exception 'p_cache_rows and p_jobs must be JSON arrays';
  end if;

  cache_row_count := pg_catalog.jsonb_array_length(p_cache_rows);
  job_row_count := pg_catalog.jsonb_array_length(p_jobs);
  if cache_row_count = 0 or cache_row_count <> job_row_count or cache_row_count > 500 then
    raise exception 'Deferred cache payloads must contain the same 1 to 500 rows';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_cache_rows) as item(value)
    where coalesce(item.value ->> 'model_used', '') not like '%|fallback=deferred_ai'
      or nullif(item.value ->> 'score_model_version', '') is null
  ) then
    raise exception 'Every deferred cache row must contain current score provenance and the deferred_ai marker';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_cache_rows) as cache_item(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_jobs) as job_item(value)
      where (job_item.value ->> 'participant_a_number')::integer =
              (cache_item.value ->> 'participant_a_number')::integer
        and (job_item.value ->> 'participant_b_number')::integer =
              (cache_item.value ->> 'participant_b_number')::integer
        and job_item.value ->> 'combined_content_hash' =
              cache_item.value ->> 'combined_content_hash'
        and job_item.value ->> 'vibe_content_hash' =
              cache_item.value ->> 'vibe_content_hash'
        and job_item.value ->> 'score_model_version' =
              cache_item.value ->> 'score_model_version'
    )
  ) then
    raise exception 'Every deferred cache row must have one matching enrichment job';
  end if;

  with cache_input as (
    select parsed.*
    from pg_catalog.jsonb_populate_recordset(
      null::public.compatibility_cache,
      p_cache_rows
    ) as parsed
  ), upserted as (
    insert into public.compatibility_cache as existing (
      participant_a_number,
      participant_b_number,
      vibe_content_hash,
      mbti_hash,
      ai_vibe_score,
      mbti_score,
      attachment_score,
      communication_score,
      lifestyle_score,
      core_values_score,
      total_compatibility_score,
      last_used,
      use_count,
      combined_content_hash,
      attachment_hash,
      communication_hash,
      lifestyle_hash,
      core_values_hash,
      humor_multiplier,
      humor_early_openness_bonus,
      participant_a_cached_at,
      participant_b_cached_at,
      synergy_hash,
      interaction_synergy_score,
      intent_goal_score,
      model_used,
      score_model_version,
      score_breakdown,
      question_scores,
      vibe_axes,
      vibe_model_version
    )
    select
      participant_a_number,
      participant_b_number,
      vibe_content_hash,
      mbti_hash,
      ai_vibe_score,
      mbti_score,
      attachment_score,
      communication_score,
      lifestyle_score,
      core_values_score,
      total_compatibility_score,
      last_used,
      use_count,
      combined_content_hash,
      attachment_hash,
      communication_hash,
      lifestyle_hash,
      core_values_hash,
      humor_multiplier,
      humor_early_openness_bonus,
      participant_a_cached_at,
      participant_b_cached_at,
      synergy_hash,
      interaction_synergy_score,
      intent_goal_score,
      model_used,
      score_model_version,
      score_breakdown,
      question_scores,
      vibe_axes,
      vibe_model_version
    from cache_input
    on conflict (participant_a_number, participant_b_number, combined_content_hash)
    do update set
      vibe_content_hash = excluded.vibe_content_hash,
      mbti_hash = excluded.mbti_hash,
      ai_vibe_score = excluded.ai_vibe_score,
      mbti_score = excluded.mbti_score,
      attachment_score = excluded.attachment_score,
      communication_score = excluded.communication_score,
      lifestyle_score = excluded.lifestyle_score,
      core_values_score = excluded.core_values_score,
      total_compatibility_score = excluded.total_compatibility_score,
      last_used = excluded.last_used,
      use_count = excluded.use_count,
      attachment_hash = excluded.attachment_hash,
      communication_hash = excluded.communication_hash,
      lifestyle_hash = excluded.lifestyle_hash,
      core_values_hash = excluded.core_values_hash,
      humor_multiplier = excluded.humor_multiplier,
      humor_early_openness_bonus = excluded.humor_early_openness_bonus,
      participant_a_cached_at = excluded.participant_a_cached_at,
      participant_b_cached_at = excluded.participant_b_cached_at,
      synergy_hash = excluded.synergy_hash,
      interaction_synergy_score = excluded.interaction_synergy_score,
      intent_goal_score = excluded.intent_goal_score,
      model_used = excluded.model_used,
      score_model_version = excluded.score_model_version,
      score_breakdown = excluded.score_breakdown,
      question_scores = excluded.question_scores,
      vibe_axes = excluded.vibe_axes,
      vibe_model_version = excluded.vibe_model_version
    -- An already enriched row is strictly better than this pending score.
    -- Do not allow a delayed foreground request to downgrade it.
    where pg_catalog.strpos(coalesce(existing.model_used, ''), '|fallback=') > 0
    returning 1
  )
  select count(*)::integer into stored from upserted;

  insert into public.compatibility_vibe_enrichment_jobs (
    event_id,
    match_id,
    participant_a_number,
    participant_b_number,
    combined_content_hash,
    vibe_content_hash,
    score_model_version,
    status,
    available_at
  )
  select
    parsed.event_id,
    parsed.match_id,
    parsed.participant_a_number,
    parsed.participant_b_number,
    parsed.combined_content_hash,
    parsed.vibe_content_hash,
    parsed.score_model_version,
    'pending',
    now()
  from pg_catalog.jsonb_to_recordset(p_jobs) as parsed(
    event_id integer,
    match_id uuid,
    participant_a_number integer,
    participant_b_number integer,
    combined_content_hash text,
    vibe_content_hash text,
    score_model_version text
  )
  on conflict (participant_a_number, participant_b_number, combined_content_hash)
  do update set
    status = 'pending',
    attempt_count = 0,
    available_at = now(),
    locked_at = null,
    completed_at = null,
    last_error = null,
    updated_at = now()
  where compatibility_vibe_enrichment_jobs.status in ('failed', 'obsolete');

  return stored;
end;
$$;

create or replace function public.claim_compatibility_vibe_enrichment_jobs(p_limit integer default 12)
returns setof public.compatibility_vibe_enrichment_jobs
language sql
security definer
set search_path = ''
as $$
  with candidates as materialized (
    select jobs.id
    from public.compatibility_vibe_enrichment_jobs as jobs
    where (
      jobs.status = 'pending'
      and jobs.available_at <= now()
    ) or (
      jobs.status = 'processing'
      and jobs.locked_at < now() - interval '10 minutes'
    )
    order by jobs.available_at asc, jobs.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 12), 12))
  )
  update public.compatibility_vibe_enrichment_jobs as jobs
  set
    status = 'processing',
    attempt_count = jobs.attempt_count + 1,
    locked_at = now(),
    updated_at = now(),
    last_error = null
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
$$;

create or replace function public.finish_compatibility_vibe_enrichment_jobs(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer := 0;
begin
  if p_results is null or pg_catalog.jsonb_typeof(p_results) <> 'array' then
    raise exception 'p_results must be a JSON array';
  end if;

  with results as (
    select
      parsed.id,
      case
        when parsed.status in ('pending', 'completed', 'obsolete', 'failed') then parsed.status
        else 'failed'
      end as status,
      pg_catalog.left(coalesce(parsed.error, ''), 1000) as error,
      greatest(0, least(coalesce(parsed.retry_after_seconds, 0), 86400)) as retry_after_seconds
    from pg_catalog.jsonb_to_recordset(p_results) as parsed(
      id uuid,
      status text,
      error text,
      retry_after_seconds integer
    )
    where parsed.id is not null
  )
  update public.compatibility_vibe_enrichment_jobs as jobs
  set
    status = results.status,
    available_at = case
      when results.status = 'pending' then now() + pg_catalog.make_interval(secs => results.retry_after_seconds)
      else jobs.available_at
    end,
    locked_at = null,
    completed_at = case
      when results.status in ('completed', 'obsolete', 'failed') then now()
      else null
    end,
    last_error = nullif(results.error, ''),
    updated_at = now()
  from results
  where jobs.id = results.id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.claim_compatibility_vibe_enrichment_jobs(integer) from public;
revoke execute on function public.claim_compatibility_vibe_enrichment_jobs(integer) from anon;
revoke execute on function public.claim_compatibility_vibe_enrichment_jobs(integer) from authenticated;
grant execute on function public.claim_compatibility_vibe_enrichment_jobs(integer) to service_role;

revoke execute on function public.finish_compatibility_vibe_enrichment_jobs(jsonb) from public;
revoke execute on function public.finish_compatibility_vibe_enrichment_jobs(jsonb) from anon;
revoke execute on function public.finish_compatibility_vibe_enrichment_jobs(jsonb) from authenticated;
grant execute on function public.finish_compatibility_vibe_enrichment_jobs(jsonb) to service_role;

revoke execute on function public.store_deferred_v11_compatibility_cache(jsonb, jsonb) from public;
revoke execute on function public.store_deferred_v11_compatibility_cache(jsonb, jsonb) from anon;
revoke execute on function public.store_deferred_v11_compatibility_cache(jsonb, jsonb) from authenticated;
grant execute on function public.store_deferred_v11_compatibility_cache(jsonb, jsonb) to service_role;

comment on table public.compatibility_vibe_enrichment_jobs is
  'Server-only durable queue for required v12 AI-chemistry score finalization; deferred rows are progressive checkpoints, not complete cache hits.';
