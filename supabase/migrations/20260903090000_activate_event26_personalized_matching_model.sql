-- Activate the Event 26 archetype-personalized scorer under its fresh model tag.
-- Historical rows remain intact; cache/status routines classify every older
-- score model as stale so progressive cache jobs can replace it safely.

comment on column public.compatibility_cache.total_compatibility_score is
  'Final displayed/priority score. Current v11 scores are the geometric mean of two archetype-personalized directional ranking percentiles; diagnostic component columns remain available as evidence.';

create or replace function public.v11_personalized_score_valid(
  p_personalized jsonb,
  p_persisted_total numeric
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    case
      when pg_catalog.jsonb_typeof(p_personalized) = 'object'
        and p_personalized ->> 'scoreModelVersion' = '2026-09-03-v11-event26-archetype-personalized-100'
        and pg_catalog.jsonb_typeof(p_personalized -> 'totalScore') = 'number'
        and pg_catalog.jsonb_typeof(p_personalized -> 'aToB' -> 'score') = 'number'
        and pg_catalog.jsonb_typeof(p_personalized -> 'bToA' -> 'score') = 'number'
      then
        (p_personalized ->> 'totalScore')::numeric between 0 and 100
        and (p_personalized -> 'aToB' ->> 'score')::numeric between 0 and 100
        and (p_personalized -> 'bToA' ->> 'score')::numeric between 0 and 100
        and pg_catalog.round(
          pg_catalog.sqrt(
            (p_personalized -> 'aToB' ->> 'score')::numeric
            * (p_personalized -> 'bToA' ->> 'score')::numeric
          ),
          6
        ) = (p_personalized ->> 'totalScore')::numeric
        and p_persisted_total in (
          (p_personalized ->> 'totalScore')::numeric,
          pg_catalog.round((p_personalized ->> 'totalScore')::numeric, 2),
          pg_catalog.round((p_personalized ->> 'totalScore')::numeric, 0)
        )
      else false
    end,
    false
  );
$$;

revoke all on function public.v11_personalized_score_valid(jsonb, numeric) from public, anon, authenticated;
grant execute on function public.v11_personalized_score_valid(jsonb, numeric) to service_role;

alter table if exists public.compatibility_cache
  drop constraint if exists compatibility_cache_v11_personalized_consistent,
  add constraint compatibility_cache_v11_personalized_consistent
  check (
    score_model_version is distinct from '2026-09-03-v11-event26-archetype-personalized-100'
    or public.v11_personalized_score_valid(score_breakdown -> 'personalized', total_compatibility_score)
  ) not valid;

alter table if exists public.match_results
  drop constraint if exists match_results_v11_personalized_consistent,
  add constraint match_results_v11_personalized_consistent
  check (
    score_model_version is distinct from '2026-09-03-v11-event26-archetype-personalized-100'
    or public.v11_personalized_score_valid(score_snapshot -> 'scoreBreakdown' -> 'personalized', compatibility_score)
  ) not valid;

alter table if exists public.event3_matches
  drop constraint if exists event3_matches_phase2_v11_personalized_consistent,
  add constraint event3_matches_phase2_v11_personalized_consistent
  check (
    phase2_score_model_version is distinct from '2026-09-03-v11-event26-archetype-personalized-100'
    or public.v11_personalized_score_valid(phase2_score_snapshot -> 'scoreBreakdown' -> 'personalized', phase2_score)
  ) not valid,
  drop constraint if exists event3_matches_phase3_v11_personalized_consistent,
  add constraint event3_matches_phase3_v11_personalized_consistent
  check (
    phase3_score_model_version is distinct from '2026-09-03-v11-event26-archetype-personalized-100'
    or public.v11_personalized_score_valid(phase3_score_snapshot -> 'scoreBreakdown' -> 'personalized', phase3_score)
  ) not valid,
  drop constraint if exists event3_matches_phase4_v11_personalized_consistent,
  add constraint event3_matches_phase4_v11_personalized_consistent
  check (
    phase4_score_model_version is distinct from '2026-09-03-v11-event26-archetype-personalized-100'
    or public.v11_personalized_score_valid(phase4_score_snapshot -> 'scoreBreakdown' -> 'personalized', phase4_score)
  ) not valid;

alter table if exists public.event3_test_match_results
  drop constraint if exists event3_test_match_results_v11_personalized_consistent,
  add constraint event3_test_match_results_v11_personalized_consistent
  check (
    score_model_version is distinct from '2026-09-03-v11-event26-archetype-personalized-100'
    or public.v11_personalized_score_valid(score_snapshot -> 'scoreBreakdown' -> 'personalized', compatibility_score)
  ) not valid;

do $migration$
declare
  routine record;
  definition text;
begin
  for routine in
    select procedure.oid
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind in ('f', 'p')
      and (
        pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-02-v9-feedback-evidence-100%'
        or pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-03-v10-v7-restored-100%'
      )
  loop
    definition := pg_catalog.replace(
      pg_catalog.pg_get_functiondef(routine.oid),
      '2026-09-02-v9-feedback-evidence-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    definition := pg_catalog.replace(
      definition,
      '2026-09-03-v10-v7-restored-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    execute definition;
  end loop;

  if pg_catalog.to_regclass('public.v_cache_freshness') is not null then
    definition := pg_catalog.replace(
      pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true),
      '2026-09-02-v9-feedback-evidence-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    definition := pg_catalog.replace(
      definition,
      '2026-09-03-v10-v7-restored-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    execute 'create or replace view public.v_cache_freshness as ' || definition;
    execute 'alter view public.v_cache_freshness set (security_invoker = true)';
    execute 'revoke all on table public.v_cache_freshness from public, anon, authenticated';
    execute 'grant select on table public.v_cache_freshness to service_role';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind in ('f', 'p')
      and (
        pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-02-v9-feedback-evidence-100%'
        or pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-03-v10-v7-restored-100%'
      )
  ) then
    raise exception 'A public score-provenance routine still references an older score model';
  end if;
end
$migration$;
