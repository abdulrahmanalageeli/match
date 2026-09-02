-- Advance every database-side provenance guard to the feedback-evidence model.
-- Existing cache/match rows remain immutable and are deliberately classified as
-- stale by the new version rather than rewritten as if they used the new model.

alter table public.compatibility_cache
  drop constraint if exists compatibility_cache_v9_evidence_consistent,
  add constraint compatibility_cache_v9_evidence_consistent
  check (
    case
      when score_model_version = '2026-09-02-v9-feedback-evidence-100' then
        coalesce(
          case
            when pg_catalog.jsonb_typeof(score_breakdown -> 'rawTotal') = 'number'
              and pg_catalog.jsonb_typeof(score_breakdown -> 'neutralBaseline') = 'number'
              and pg_catalog.jsonb_typeof(score_breakdown -> 'evidenceTotal') = 'number'
            then (score_breakdown ->> 'neutralBaseline')::numeric = 50
              and (score_breakdown ->> 'rawTotal')::numeric between 0 and 100
              and (score_breakdown ->> 'evidenceTotal')::numeric between 0 and 100
              and pg_catalog.round((score_breakdown ->> 'evidenceTotal')::numeric, 2) = total_compatibility_score
              and pg_catalog.round(
                greatest(0::numeric, least(100::numeric, ((score_breakdown ->> 'rawTotal')::numeric - 50) * 2)),
                6
              ) = (score_breakdown ->> 'evidenceTotal')::numeric
            else false
          end,
          false
        )
      else true
    end
  );

alter table public.match_results
  drop constraint if exists match_results_v9_evidence_consistent,
  add constraint match_results_v9_evidence_consistent
  check (
    case
      when score_model_version = '2026-09-02-v9-feedback-evidence-100' then coalesce(
        case
          when pg_catalog.jsonb_typeof(score_snapshot -> 'scoreBreakdown' -> 'rawTotal') = 'number'
            and pg_catalog.jsonb_typeof(score_snapshot -> 'scoreBreakdown' -> 'neutralBaseline') = 'number'
            and pg_catalog.jsonb_typeof(score_snapshot -> 'scoreBreakdown' -> 'evidenceTotal') = 'number'
            and pg_catalog.jsonb_typeof(score_snapshot -> 'totalScore') = 'number'
          then (score_snapshot -> 'scoreBreakdown' ->> 'neutralBaseline')::numeric = 50
            and (score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric between 0 and 100
            and pg_catalog.round(
              greatest(0::numeric, least(100::numeric, ((score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric - 50) * 2)),
              6
            ) = (score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric
            and (score_snapshot ->> 'totalScore')::numeric in (
              (score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric,
              pg_catalog.round((score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 2),
              pg_catalog.round((score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 0)
            )
          else false
        end,
        false
      )
      else true
    end
  );

alter table public.event3_matches
  drop constraint if exists event3_matches_phase2_v9_evidence_consistent,
  add constraint event3_matches_phase2_v9_evidence_consistent
  check (
    case
      when phase2_score_model_version = '2026-09-02-v9-feedback-evidence-100' then coalesce(
        case
          when pg_catalog.jsonb_typeof(phase2_score_snapshot -> 'scoreBreakdown' -> 'rawTotal') = 'number'
            and pg_catalog.jsonb_typeof(phase2_score_snapshot -> 'scoreBreakdown' -> 'neutralBaseline') = 'number'
            and pg_catalog.jsonb_typeof(phase2_score_snapshot -> 'scoreBreakdown' -> 'evidenceTotal') = 'number'
            and pg_catalog.jsonb_typeof(phase2_score_snapshot -> 'totalScore') = 'number'
          then (phase2_score_snapshot -> 'scoreBreakdown' ->> 'neutralBaseline')::numeric = 50
            and (phase2_score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric between 0 and 100
            and pg_catalog.round(greatest(0::numeric, least(100::numeric, ((phase2_score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric - 50) * 2)), 6)
              = (phase2_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric
            and (phase2_score_snapshot ->> 'totalScore')::numeric in (
              (phase2_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric,
              pg_catalog.round((phase2_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 2),
              pg_catalog.round((phase2_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 0)
            )
          else false
        end,
        false
      )
      else true
    end
  ),
  drop constraint if exists event3_matches_phase3_v9_evidence_consistent,
  add constraint event3_matches_phase3_v9_evidence_consistent
  check (
    case
      when phase3_score_model_version = '2026-09-02-v9-feedback-evidence-100' then coalesce(
        case
          when pg_catalog.jsonb_typeof(phase3_score_snapshot -> 'scoreBreakdown' -> 'rawTotal') = 'number'
            and pg_catalog.jsonb_typeof(phase3_score_snapshot -> 'scoreBreakdown' -> 'neutralBaseline') = 'number'
            and pg_catalog.jsonb_typeof(phase3_score_snapshot -> 'scoreBreakdown' -> 'evidenceTotal') = 'number'
            and pg_catalog.jsonb_typeof(phase3_score_snapshot -> 'totalScore') = 'number'
          then (phase3_score_snapshot -> 'scoreBreakdown' ->> 'neutralBaseline')::numeric = 50
            and (phase3_score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric between 0 and 100
            and pg_catalog.round(greatest(0::numeric, least(100::numeric, ((phase3_score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric - 50) * 2)), 6)
              = (phase3_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric
            and (phase3_score_snapshot ->> 'totalScore')::numeric in (
              (phase3_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric,
              pg_catalog.round((phase3_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 2),
              pg_catalog.round((phase3_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 0)
            )
          else false
        end,
        false
      )
      else true
    end
  ),
  drop constraint if exists event3_matches_phase4_v9_evidence_consistent,
  add constraint event3_matches_phase4_v9_evidence_consistent
  check (
    case
      when phase4_score_model_version = '2026-09-02-v9-feedback-evidence-100' then coalesce(
        case
          when pg_catalog.jsonb_typeof(phase4_score_snapshot -> 'scoreBreakdown' -> 'rawTotal') = 'number'
            and pg_catalog.jsonb_typeof(phase4_score_snapshot -> 'scoreBreakdown' -> 'neutralBaseline') = 'number'
            and pg_catalog.jsonb_typeof(phase4_score_snapshot -> 'scoreBreakdown' -> 'evidenceTotal') = 'number'
            and pg_catalog.jsonb_typeof(phase4_score_snapshot -> 'totalScore') = 'number'
          then (phase4_score_snapshot -> 'scoreBreakdown' ->> 'neutralBaseline')::numeric = 50
            and (phase4_score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric between 0 and 100
            and pg_catalog.round(greatest(0::numeric, least(100::numeric, ((phase4_score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric - 50) * 2)), 6)
              = (phase4_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric
            and (phase4_score_snapshot ->> 'totalScore')::numeric in (
              (phase4_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric,
              pg_catalog.round((phase4_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 2),
              pg_catalog.round((phase4_score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 0)
            )
          else false
        end,
        false
      )
      else true
    end
  );

alter table public.event3_test_match_results
  drop constraint if exists event3_test_match_results_v9_evidence_consistent,
  add constraint event3_test_match_results_v9_evidence_consistent
  check (
    case
      when score_model_version = '2026-09-02-v9-feedback-evidence-100' then coalesce(
        case
          when pg_catalog.jsonb_typeof(score_snapshot -> 'scoreBreakdown' -> 'rawTotal') = 'number'
            and pg_catalog.jsonb_typeof(score_snapshot -> 'scoreBreakdown' -> 'neutralBaseline') = 'number'
            and pg_catalog.jsonb_typeof(score_snapshot -> 'scoreBreakdown' -> 'evidenceTotal') = 'number'
            and pg_catalog.jsonb_typeof(score_snapshot -> 'totalScore') = 'number'
          then (score_snapshot -> 'scoreBreakdown' ->> 'neutralBaseline')::numeric = 50
            and (score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric between 0 and 100
            and pg_catalog.round(greatest(0::numeric, least(100::numeric, ((score_snapshot -> 'scoreBreakdown' ->> 'rawTotal')::numeric - 50) * 2)), 6)
              = (score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric
            and (score_snapshot ->> 'totalScore')::numeric in (
              (score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric,
              pg_catalog.round((score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 2),
              pg_catalog.round((score_snapshot -> 'scoreBreakdown' ->> 'evidenceTotal')::numeric, 0)
            )
          else false
        end,
        false
      )
      else true
    end
  );

comment on column public.compatibility_cache.total_compatibility_score is
  'Final displayed/priority score. For v9 this is evidence above the neutral baseline; the auditable raw weighted total is score_breakdown.rawTotal.';

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
      and pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-08-25-v7-balanced-100%'
  loop
    definition := pg_catalog.replace(
      pg_catalog.pg_get_functiondef(routine.oid),
      '2026-08-25-v7-balanced-100',
      '2026-09-02-v9-feedback-evidence-100'
    );
    execute definition;
  end loop;

  if pg_catalog.to_regclass('public.v_cache_freshness') is not null then
    definition := pg_catalog.replace(
      pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true),
      '2026-08-25-v7-balanced-100',
      '2026-09-02-v9-feedback-evidence-100'
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
      and pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-08-25-v7-balanced-100%'
  ) then
    raise exception 'A public score-provenance routine still references the previous model';
  end if;
end
$migration$;
