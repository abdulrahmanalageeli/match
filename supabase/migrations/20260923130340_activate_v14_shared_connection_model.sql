-- Activate the fixed V14 shared survey model. Historical score rows are untouched.
-- AI chemistry remains diagnostic: it never adjusts the shared model's index.
create or replace function public.v14_shared_connection_score_valid(
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
  shared jsonb;
  base_score numeric;
  a_score numeric;
  b_score numeric;
  a_raw numeric;
  b_raw numeric;
  chemistry_ready boolean;
  expected_ready boolean := false;
  expected_chemistry numeric;
  expected_suggestion numeric;
begin
  if pg_catalog.jsonb_typeof(p_breakdown) is distinct from 'object'
    or p_persisted_total is null
    or p_persisted_total::text in ('NaN', 'Infinity', '-Infinity') then
    return false;
  end if;
  shared := p_breakdown -> 'personalized';
  if pg_catalog.jsonb_typeof(shared) is distinct from 'object'
    or shared ->> 'scoreModelVersion' is distinct from '2026-09-23-v14-shared-connection-75-25-min-100'
    or shared ->> 'sourceArtifactSha256' is distinct from 'b14be564cf25d5cfecbb88858a2e480f8bd8d32828a67a3a4be4136e3eeb021d'
    or shared ->> 'scoreMeaning' is distinct from 'relative-ranking-not-probability'
    or shared ->> 'calibration' is distinct from 'events26-28-shared-connection-reference-percentile'
    or shared ->> 'mutualFormula' is distinct from 'minimum'
    or shared -> 'personalHistoryApplied' is distinct from 'false'::jsonb
    or p_breakdown ->> 'scoringMethod' is distinct from 'shared-connection-survey-only'
    or p_breakdown -> 'aiChemistryApplied' is distinct from 'false'::jsonb
    or pg_catalog.jsonb_typeof(shared -> 'totalScore') is distinct from 'number'
    or pg_catalog.jsonb_typeof(shared -> 'priorityScore') is distinct from 'number'
    or pg_catalog.jsonb_typeof(shared -> 'rawMutualUtility') is distinct from 'number'
    or pg_catalog.jsonb_typeof(shared -> 'aToB') is distinct from 'object'
    or pg_catalog.jsonb_typeof(shared -> 'bToA') is distinct from 'object'
    or pg_catalog.jsonb_typeof(shared -> 'aToB' -> 'score') is distinct from 'number'
    or pg_catalog.jsonb_typeof(shared -> 'bToA' -> 'score') is distinct from 'number'
    or pg_catalog.jsonb_typeof(shared -> 'aToB' -> 'rawUtility') is distinct from 'number'
    or pg_catalog.jsonb_typeof(shared -> 'bToA' -> 'rawUtility') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'personalizedBase') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'finalScore') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'aiChemistryAdjustment') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'aiChemistrySuggestedAdjustment') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_breakdown -> 'aiChemistryReady') is distinct from 'boolean' then
    return false;
  end if;

  base_score := (shared ->> 'totalScore')::numeric;
  a_score := (shared -> 'aToB' ->> 'score')::numeric;
  b_score := (shared -> 'bToA' ->> 'score')::numeric;
  a_raw := (shared -> 'aToB' ->> 'rawUtility')::numeric;
  b_raw := (shared -> 'bToA' ->> 'rawUtility')::numeric;
  -- Reject JSON numbers that cannot represent finite runtime double values.
  perform a_raw::double precision, b_raw::double precision,
    (shared ->> 'rawMutualUtility')::double precision;
  if base_score not between 0 and 100
    or a_score not between 0 and 100
    or b_score not between 0 and 100
    or pg_catalog.round(a_score, 6) <> a_score
    or pg_catalog.round(b_score, 6) <> b_score
    or base_score <> least(a_score, b_score)
    or (shared ->> 'priorityScore')::numeric <> base_score
    or (shared ->> 'rawMutualUtility')::numeric <> least(a_raw, b_raw)
    or (p_breakdown ->> 'personalizedBase')::numeric <> base_score
    or (p_breakdown ->> 'finalScore')::numeric <> base_score
    or (p_breakdown ->> 'aiChemistryAdjustment')::numeric <> 0 then
    return false;
  end if;

  -- A null axis payload is valid only for genuinely pending diagnostics.
  if p_vibe_axes is not null and p_vibe_axes <> 'null'::jsonb
    and pg_catalog.jsonb_typeof(p_vibe_axes) is distinct from 'object' then
    return false;
  end if;
  if pg_catalog.jsonb_typeof(p_vibe_axes -> 'current_curiosity') = 'object'
    and pg_catalog.jsonb_typeof(p_vibe_axes -> 'hobbies') = 'object'
    and pg_catalog.jsonb_typeof(p_vibe_axes -> 'current_curiosity' -> 'confidence') = 'number'
    and pg_catalog.jsonb_typeof(p_vibe_axes -> 'hobbies' -> 'confidence') = 'number'
    and pg_catalog.btrim(coalesce(p_vibe_axes -> 'current_curiosity' ->> 'reason', '')) = ''
    and pg_catalog.btrim(coalesce(p_vibe_axes -> 'hobbies' ->> 'reason', '')) = '' then
    expected_ready := (p_vibe_axes -> 'current_curiosity' ->> 'confidence')::numeric
      + (p_vibe_axes -> 'hobbies' ->> 'confidence')::numeric > 0;
  end if;
  chemistry_ready := (p_breakdown ->> 'aiChemistryReady')::boolean;
  if chemistry_ready is distinct from expected_ready then
    return false;
  end if;
  if chemistry_ready then
    if pg_catalog.jsonb_typeof(p_breakdown -> 'aiChemistryScore') is distinct from 'number'
      or pg_catalog.jsonb_typeof(p_vibe_axes -> 'current_curiosity' -> 'score') is distinct from 'number'
      or pg_catalog.jsonb_typeof(p_vibe_axes -> 'hobbies' -> 'score') is distinct from 'number' then
      return false;
    end if;
    expected_chemistry := pg_catalog.round(
      0.5 * (greatest(0, least(5, (p_vibe_axes -> 'current_curiosity' ->> 'score')::numeric)) / 5)
      + 0.5 * (greatest(0, least(3, (p_vibe_axes -> 'hobbies' ->> 'score')::numeric)) / 3),
      6
    );
    expected_suggestion := case when expected_chemistry >= 0.75 then 12
      when expected_chemistry < 0.55 then -8 else 0 end;
    if (p_breakdown ->> 'aiChemistryScore')::numeric <> expected_chemistry
      or (p_breakdown ->> 'aiChemistrySuggestedAdjustment')::numeric <> expected_suggestion
      or p_breakdown ->> 'aiChemistryBand' is distinct from
        (case when expected_suggestion = 12 then 'high'
          when expected_suggestion = -8 then 'low' else 'neutral' end) then
      return false;
    end if;
  else
    if p_breakdown -> 'aiChemistryScore' is distinct from 'null'::jsonb
      or (p_breakdown ->> 'aiChemistrySuggestedAdjustment')::numeric <> 0
      or p_breakdown ->> 'aiChemistryBand' is distinct from 'pending' then
      return false;
    end if;
  end if;

  return coalesce(p_persisted_total in (
    base_score, pg_catalog.round(base_score, 2), pg_catalog.round(base_score, 0)
  ), false);
exception when others then
  return false;
end;
$$;

revoke all on function public.v14_shared_connection_score_valid(jsonb, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.v14_shared_connection_score_valid(jsonb, jsonb, numeric) to service_role;

do $constraints$
declare
  item record;
begin
  for item in select * from (values
    ('compatibility_cache', 'compatibility_cache_v14_shared_connection_consistent',
      'score_model_version', 'score_breakdown', 'vibe_axes', 'total_compatibility_score'),
    ('match_results', 'match_results_v14_shared_connection_consistent',
      'score_model_version', 'score_snapshot -> ''scoreBreakdown''', 'score_snapshot -> ''vibeAxes''', 'compatibility_score'),
    ('event3_matches', 'event3_matches_phase2_v14_shared_connection_consistent',
      'phase2_score_model_version', 'phase2_score_snapshot -> ''scoreBreakdown''', 'phase2_score_snapshot -> ''vibeAxes''', 'phase2_score'),
    ('event3_matches', 'event3_matches_phase3_v14_shared_connection_consistent',
      'phase3_score_model_version', 'phase3_score_snapshot -> ''scoreBreakdown''', 'phase3_score_snapshot -> ''vibeAxes''', 'phase3_score'),
    ('event3_matches', 'event3_matches_phase4_v14_shared_connection_consistent',
      'phase4_score_model_version', 'phase4_score_snapshot -> ''scoreBreakdown''', 'phase4_score_snapshot -> ''vibeAxes''', 'phase4_score'),
    ('event3_test_match_results', 'event3_test_match_results_v14_shared_connection_consistent',
      'score_model_version', 'score_snapshot -> ''scoreBreakdown''', 'score_snapshot -> ''vibeAxes''', 'compatibility_score')
  ) as guards(table_name, constraint_name, version_column, breakdown_expression, axes_expression, total_column)
  loop
    if pg_catalog.to_regclass('public.' || item.table_name) is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = item.table_name and column_name = item.version_column)
      and exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = item.table_name and column_name = item.total_column)
      and not exists (select 1 from pg_catalog.pg_constraint
        where conname = item.constraint_name and conrelid = pg_catalog.to_regclass('public.' || item.table_name)) then
      execute pg_catalog.format(
        'alter table public.%I add constraint %I check (%I is distinct from %L or public.v14_shared_connection_score_valid(%s, %s, %I) is true) not valid',
        item.table_name, item.constraint_name, item.version_column,
        '2026-09-23-v14-shared-connection-75-25-min-100',
        item.breakdown_expression, item.axes_expression, item.total_column
      );
    end if;
  end loop;
  if pg_catalog.to_regclass('public.compatibility_cache') is not null then
    comment on column public.compatibility_cache.total_compatibility_score is
      'V14 shared survey compatibility index: lower directional reference-percentile score. Not a connection probability. AI diagnostics and personal history do not adjust it.';
  end if;
end
$constraints$;

-- Advance current-model routines and freshness whether a deployment is at V12
-- or V13. Historical version-specific validation functions retain their bodies.
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
      and procedure.proname !~ '^v[0-9]+_.*score_valid$'
      and (pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-03-v12-event26-archetype-ai-chemistry-100%'
        or pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-11-v13-events26-27-archetype-ai-chemistry-100%')
  loop
    definition := pg_catalog.replace(pg_catalog.replace(
      pg_catalog.pg_get_functiondef(routine.oid),
      '2026-09-03-v12-event26-archetype-ai-chemistry-100',
      '2026-09-23-v14-shared-connection-75-25-min-100'),
      '2026-09-11-v13-events26-27-archetype-ai-chemistry-100',
      '2026-09-23-v14-shared-connection-75-25-min-100');
    execute definition;
  end loop;

  if pg_catalog.to_regclass('public.v_cache_freshness') is not null then
    definition := pg_catalog.replace(pg_catalog.replace(
      pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true),
      '2026-09-03-v12-event26-archetype-ai-chemistry-100',
      '2026-09-23-v14-shared-connection-75-25-min-100'),
      '2026-09-11-v13-events26-27-archetype-ai-chemistry-100',
      '2026-09-23-v14-shared-connection-75-25-min-100');
    execute 'create or replace view public.v_cache_freshness as ' || definition;
    execute 'alter view public.v_cache_freshness set (security_invoker = true)';
    execute 'revoke all on table public.v_cache_freshness from public, anon, authenticated';
    execute 'grant select on table public.v_cache_freshness to service_role';
  end if;
end
$provenance$;
