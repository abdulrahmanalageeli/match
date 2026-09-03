-- Activate v12: archetype-personalized mutual base plus a validated semantic
-- chemistry correction from the AI current-curiosity and hobbies axes.

comment on column public.compatibility_cache.total_compatibility_score is
  'Final displayed/priority score. v12 = archetype-personalized mutual base plus AI semantic chemistry (+12, 0, or -8), clamped to 0..100.';

create or replace function public.v12_ai_chemistry_score_valid(
  p_breakdown jsonb,
  p_vibe_axes jsonb,
  p_persisted_total numeric
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  personalized jsonb;
  base_score numeric;
  a_to_b numeric;
  b_to_a numeric;
  chemistry_ready boolean;
  chemistry_score numeric;
  chemistry_adjustment numeric;
  expected_chemistry numeric;
  expected_adjustment numeric;
  expected_total numeric;
begin
  if pg_catalog.jsonb_typeof(p_breakdown) <> 'object'
    or pg_catalog.jsonb_typeof(p_vibe_axes) <> 'object' then
    return false;
  end if;
  personalized := p_breakdown -> 'personalized';
  if pg_catalog.jsonb_typeof(personalized) <> 'object'
    or personalized ->> 'scoreModelVersion' <> '2026-09-03-v12-event26-archetype-ai-chemistry-100'
    or pg_catalog.jsonb_typeof(personalized -> 'totalScore') <> 'number'
    or pg_catalog.jsonb_typeof(personalized -> 'aToB' -> 'score') <> 'number'
    or pg_catalog.jsonb_typeof(personalized -> 'bToA' -> 'score') <> 'number'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'personalizedBase') <> 'number'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'aiChemistryAdjustment') <> 'number'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'aiChemistryReady') <> 'boolean'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'finalScore') <> 'number' then
    return false;
  end if;

  base_score := (personalized ->> 'totalScore')::numeric;
  a_to_b := (personalized -> 'aToB' ->> 'score')::numeric;
  b_to_a := (personalized -> 'bToA' ->> 'score')::numeric;
  chemistry_ready := (p_breakdown ->> 'aiChemistryReady')::boolean;
  chemistry_adjustment := (p_breakdown ->> 'aiChemistryAdjustment')::numeric;
  if base_score not between 0 and 100
    or a_to_b not between 0 and 100
    or b_to_a not between 0 and 100
    or pg_catalog.round(pg_catalog.sqrt(a_to_b * b_to_a), 6) <> base_score
    or (p_breakdown ->> 'personalizedBase')::numeric <> base_score then
    return false;
  end if;

  if chemistry_ready then
    if pg_catalog.jsonb_typeof(p_breakdown -> 'aiChemistryScore') <> 'number'
      or pg_catalog.jsonb_typeof(p_vibe_axes -> 'current_curiosity' -> 'score') <> 'number'
      or pg_catalog.jsonb_typeof(p_vibe_axes -> 'hobbies' -> 'score') <> 'number'
      or pg_catalog.jsonb_typeof(p_vibe_axes -> 'current_curiosity' -> 'confidence') <> 'number'
      or pg_catalog.jsonb_typeof(p_vibe_axes -> 'hobbies' -> 'confidence') <> 'number'
      or coalesce(p_vibe_axes -> 'current_curiosity' ->> 'reason', '') <> ''
      or coalesce(p_vibe_axes -> 'hobbies' ->> 'reason', '') <> '' then
      return false;
    end if;
    if (p_vibe_axes -> 'current_curiosity' ->> 'confidence')::numeric
      + (p_vibe_axes -> 'hobbies' ->> 'confidence')::numeric <= 0 then
      return false;
    end if;
    expected_chemistry := pg_catalog.round(
      0.5 * ((p_vibe_axes -> 'current_curiosity' ->> 'score')::numeric / 5)
      + 0.5 * ((p_vibe_axes -> 'hobbies' ->> 'score')::numeric / 3),
      6
    );
    chemistry_score := (p_breakdown ->> 'aiChemistryScore')::numeric;
    expected_adjustment := case
      when expected_chemistry >= 0.75 then 12
      when expected_chemistry < 0.55 then -8
      else 0
    end;
    if chemistry_score <> expected_chemistry
      or chemistry_adjustment <> expected_adjustment
      or (p_breakdown ->> 'aiChemistryBand') <> (case
        when expected_adjustment = 12 then 'high'
        when expected_adjustment = -8 then 'low'
        else 'neutral'
      end) then
      return false;
    end if;
  else
    if p_breakdown -> 'aiChemistryScore' <> 'null'::jsonb
      or chemistry_adjustment <> 0
      or p_breakdown ->> 'aiChemistryBand' <> 'pending' then
      return false;
    end if;
  end if;

  expected_total := pg_catalog.round(greatest(0, least(100, base_score + chemistry_adjustment)), 6);
  return (p_breakdown ->> 'finalScore')::numeric = expected_total
    and p_persisted_total in (expected_total, pg_catalog.round(expected_total, 2), pg_catalog.round(expected_total, 0));
exception when others then
  return false;
end;
$$;

revoke all on function public.v12_ai_chemistry_score_valid(jsonb, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.v12_ai_chemistry_score_valid(jsonb, jsonb, numeric) to service_role;

alter table if exists public.compatibility_cache
  add constraint compatibility_cache_v12_ai_chemistry_consistent
  check (
    score_model_version is distinct from '2026-09-03-v12-event26-archetype-ai-chemistry-100'
    or public.v12_ai_chemistry_score_valid(score_breakdown, vibe_axes, total_compatibility_score)
  ) not valid;

alter table if exists public.match_results
  add constraint match_results_v12_ai_chemistry_consistent
  check (
    score_model_version is distinct from '2026-09-03-v12-event26-archetype-ai-chemistry-100'
    or public.v12_ai_chemistry_score_valid(score_snapshot -> 'scoreBreakdown', score_snapshot -> 'vibeAxes', compatibility_score)
  ) not valid;

alter table if exists public.event3_matches
  add constraint event3_matches_phase2_v12_ai_chemistry_consistent
  check (
    phase2_score_model_version is distinct from '2026-09-03-v12-event26-archetype-ai-chemistry-100'
    or public.v12_ai_chemistry_score_valid(phase2_score_snapshot -> 'scoreBreakdown', phase2_score_snapshot -> 'vibeAxes', phase2_score)
  ) not valid,
  add constraint event3_matches_phase3_v12_ai_chemistry_consistent
  check (
    phase3_score_model_version is distinct from '2026-09-03-v12-event26-archetype-ai-chemistry-100'
    or public.v12_ai_chemistry_score_valid(phase3_score_snapshot -> 'scoreBreakdown', phase3_score_snapshot -> 'vibeAxes', phase3_score)
  ) not valid;

do $phase4$
begin
  if pg_catalog.to_regclass('public.event3_matches') is not null
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event3_matches' and column_name = 'phase4_score_model_version')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event3_matches' and column_name = 'phase4_score_snapshot')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event3_matches' and column_name = 'phase4_score') then
    alter table public.event3_matches
      add constraint event3_matches_phase4_v12_ai_chemistry_consistent
      check (
        phase4_score_model_version is distinct from '2026-09-03-v12-event26-archetype-ai-chemistry-100'
        or public.v12_ai_chemistry_score_valid(phase4_score_snapshot -> 'scoreBreakdown', phase4_score_snapshot -> 'vibeAxes', phase4_score)
      ) not valid;
  end if;
end
$phase4$;

alter table if exists public.event3_test_match_results
  add constraint event3_test_match_results_v12_ai_chemistry_consistent
  check (
    score_model_version is distinct from '2026-09-03-v12-event26-archetype-ai-chemistry-100'
    or public.v12_ai_chemistry_score_valid(score_snapshot -> 'scoreBreakdown', score_snapshot -> 'vibeAxes', compatibility_score)
  ) not valid;

do $provenance$
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
      and procedure.proname not in ('v11_personalized_score_valid', 'v12_ai_chemistry_score_valid')
      and pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-03-v11-event26-archetype-personalized-100%'
  loop
    definition := pg_catalog.replace(
      pg_catalog.pg_get_functiondef(routine.oid),
      '2026-09-03-v11-event26-archetype-personalized-100',
      '2026-09-03-v12-event26-archetype-ai-chemistry-100'
    );
    execute definition;
  end loop;

  if pg_catalog.to_regclass('public.v_cache_freshness') is not null then
    definition := pg_catalog.replace(
      pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true),
      '2026-09-03-v11-event26-archetype-personalized-100',
      '2026-09-03-v12-event26-archetype-ai-chemistry-100'
    );
    execute 'create or replace view public.v_cache_freshness as ' || definition;
    execute 'alter view public.v_cache_freshness set (security_invoker = true)';
    execute 'revoke all on table public.v_cache_freshness from public, anon, authenticated';
    execute 'grant select on table public.v_cache_freshness to service_role';
  end if;
end
$provenance$;
