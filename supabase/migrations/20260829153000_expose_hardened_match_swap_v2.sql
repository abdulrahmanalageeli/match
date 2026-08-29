-- Give the overwrite-safe swap surface a versioned name. The application uses
-- only these v2 RPCs, so an unapplied hardening migration fails closed instead
-- of silently reaching the older topology-only undo implementation.

do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.apply_match_swap_plan_provenance_unchecked(uuid,integer,smallint,jsonb,integer[],jsonb,jsonb)'
  ) is null then
    raise exception 'The hardened match-swap migration must be applied before the v2 RPCs';
  end if;
end;
$migration$;

create or replace function public.apply_match_swap_plan_with_score_provenance_v2(
  p_match_id uuid,
  p_event_id integer,
  p_round smallint,
  p_pairs jsonb,
  p_affected integer[],
  p_expected_pairs jsonb default '[]'::jsonb,
  p_plan_summary jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.apply_match_swap_plan_with_score_provenance(
    p_match_id,
    p_event_id,
    p_round,
    p_pairs,
    p_affected,
    p_expected_pairs,
    p_plan_summary
  );
$$;

create or replace function public.undo_match_swap_plan_v2(p_audit_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.undo_match_swap_plan(p_audit_id);
$$;

revoke all on function public.apply_match_swap_plan_with_score_provenance_v2(
  uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_match_swap_plan_with_score_provenance_v2(
  uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
) to service_role;

revoke all on function public.undo_match_swap_plan_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.undo_match_swap_plan_v2(uuid)
  to service_role;
