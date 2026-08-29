create table public.compatibility_cache (
  id uuid not null default gen_random_uuid (),
  participant_a_number integer not null,
  participant_b_number integer not null,
  vibe_content_hash text not null,
  mbti_hash text not null,
  ai_vibe_score numeric(5, 2) not null,
  mbti_score numeric(5, 2) not null,
  attachment_score numeric(5, 2) not null,
  communication_score numeric(5, 2) not null,
  lifestyle_score numeric(5, 2) not null,
  core_values_score numeric(5, 2) not null,
  total_compatibility_score numeric(5, 2) not null,
  created_at timestamp with time zone null default now(),
  last_used timestamp with time zone null default now(),
  use_count integer null default 1,
  combined_content_hash text not null default ''::text,
  attachment_hash text not null default ''::text,
  communication_hash text not null default ''::text,
  lifestyle_hash text not null default ''::text,
  core_values_hash text not null default ''::text,
  humor_multiplier numeric null default 1.0,
  humor_early_openness_bonus text null default 'none'::text,
  participant_a_cached_at timestamp with time zone null,
  participant_b_cached_at timestamp with time zone null,
  synergy_hash text not null default ''::text,
  interaction_synergy_score numeric(5, 2) not null default 0,
  intent_goal_score numeric(5, 2) not null default 0,
  model_used text null,
  score_model_version text null,
  score_breakdown jsonb null,
  question_scores jsonb null,
  vibe_axes jsonb null,
  vibe_model_version text null,
  constraint compatibility_cache_pkey primary key (id),
  constraint cache_unique unique (
    participant_a_number,
    participant_b_number,
    combined_content_hash
  ),
  constraint cache_ordered check ((participant_a_number < participant_b_number)),
  constraint humor_early_openness_bonus_check check (
    (
      humor_early_openness_bonus = any (
        array['none'::text, 'partial'::text, 'full'::text]
      )
    )
  ),
  constraint compatibility_cache_score_breakdown_object check (
    score_breakdown is null or jsonb_typeof(score_breakdown) = 'object'
  ),
  constraint compatibility_cache_question_scores_object check (
    question_scores is null or jsonb_typeof(question_scores) = 'object'
  ),
  constraint compatibility_cache_vibe_axes_object check (
    vibe_axes is null or jsonb_typeof(vibe_axes) = 'object'
  ),
  constraint compatibility_cache_versioned_payload_complete check (
    score_model_version is null
    or (
      score_breakdown is not null
      and jsonb_typeof(score_breakdown) = 'object'
      and question_scores is not null
      and jsonb_typeof(question_scores) = 'object'
      and vibe_axes is not null
      and jsonb_typeof(vibe_axes) = 'object'
      and vibe_model_version is not null
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_cache_synergy_hash on public.compatibility_cache using btree (synergy_hash) TABLESPACE pg_default;

create index IF not exists idx_cache_participant_timestamps on public.compatibility_cache using btree (participant_a_cached_at, participant_b_cached_at) TABLESPACE pg_default;

create index IF not exists idx_cache_participants on public.compatibility_cache using btree (participant_a_number, participant_b_number) TABLESPACE pg_default;

create index IF not exists idx_cache_hash on public.compatibility_cache using btree (vibe_content_hash, mbti_hash) TABLESPACE pg_default;

create index IF not exists idx_cache_combined_hash on public.compatibility_cache using btree (combined_content_hash) TABLESPACE pg_default;

create index IF not exists idx_compatibility_cache_exact_model_identity on public.compatibility_cache using btree (
  participant_a_number,
  participant_b_number,
  score_model_version,
  combined_content_hash
) TABLESPACE pg_default;

create or replace function public.touch_compatibility_cache_rows(p_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with requested as (
    select distinct requested.id
    from unnest(coalesce(p_ids, array[]::uuid[])) as requested(id)
    where requested.id is not null
    limit 200
  ),
  touched as (
    update public.compatibility_cache as cache
    set
      last_used = now(),
      use_count = coalesce(cache.use_count, 0) + 1
    from requested
    where cache.id = requested.id
      and (
        cache.last_used is null
        or cache.last_used < now() - interval '6 hours'
      )
    returning 1
  )
  select count(*)::integer
  from touched;
$$;

comment on function public.touch_compatibility_cache_rows(uuid[])
is 'Updates usage metadata for at most 200 cache rows and no more than once per row every six hours.';

revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from public;
revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from anon;
revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from authenticated;
grant execute on function public.touch_compatibility_cache_rows(uuid[]) to service_role;
