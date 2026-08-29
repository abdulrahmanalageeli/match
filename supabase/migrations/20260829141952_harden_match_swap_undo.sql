-- Prevent a swap undo from overwriting score/stat/provenance changes made after
-- the swap. Also make the affected participant list an exact, reviewed scope.

-- Keep the already-deployed provenance implementation intact behind a private
-- callable surface, then put exact affected-scope validation in front of it.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.apply_match_swap_plan_provenance_unchecked(uuid,integer,smallint,jsonb,integer[],jsonb,jsonb)'
  ) is null then
    if pg_catalog.to_regprocedure(
      'public.apply_match_swap_plan_with_score_provenance(uuid,integer,smallint,jsonb,integer[],jsonb,jsonb)'
    ) is null then
      raise exception 'The existing provenance-aware swap RPC is required';
    end if;

    alter function public.apply_match_swap_plan_with_score_provenance(
      uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
    ) rename to apply_match_swap_plan_provenance_unchecked;
  end if;
end;
$migration$;

create or replace function public.apply_match_swap_plan_with_score_provenance(
  p_match_id uuid,
  p_event_id integer,
  p_round smallint,
  p_pairs jsonb,
  p_affected integer[],
  p_expected_pairs jsonb default '[]'::jsonb,
  p_plan_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_a integer;
  v_b integer;
  v_required integer[] := '{}'::integer[];
  v_given integer[] := '{}'::integer[];
begin
  if pg_catalog.jsonb_typeof(p_pairs) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_pairs) = 0 then
    raise exception 'pairs must be a non-empty JSON array';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_expected_pairs, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'expected pairs must be a JSON array';
  end if;
  if coalesce(pg_catalog.array_length(p_affected, 1), 0) = 0
    or exists (
      select 1
      from pg_catalog.unnest(p_affected) affected(participant_number)
      where affected.participant_number is null
        or affected.participant_number <= 0
        or affected.participant_number = 9999
    )
    or (
      select pg_catalog.count(distinct affected.participant_number)
      from pg_catalog.unnest(p_affected) affected(participant_number)
    ) <> pg_catalog.array_length(p_affected, 1) then
    raise exception 'affected participants must be a non-empty array of unique positive participant numbers';
  end if;

  -- The exact scope is the union of both endpoints in the reviewed current
  -- pairs and resulting pairs. This deliberately retains former/released
  -- partners that only occur in p_expected_pairs so their old rows are safely
  -- removed, while preventing unrelated participant rows from being deleted.
  for v_item in
    select value from pg_catalog.jsonb_array_elements(p_pairs)
    union all
    select value from pg_catalog.jsonb_array_elements(coalesce(p_expected_pairs, '[]'::jsonb))
  loop
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;
    if v_a is null or v_b is null
      or v_a <= 0 or v_b <= 0
      or v_a = 9999 or v_b = 9999
      or v_a = v_b then
      raise exception 'Every reviewed and resulting pair must contain two different positive participant numbers';
    end if;
    v_required := pg_catalog.array_append(v_required, v_a);
    v_required := pg_catalog.array_append(v_required, v_b);
  end loop;

  select coalesce(
    pg_catalog.array_agg(distinct required.participant_number order by required.participant_number),
    '{}'::integer[]
  )
  into v_required
  from pg_catalog.unnest(v_required) required(participant_number);

  select coalesce(
    pg_catalog.array_agg(given.participant_number order by given.participant_number),
    '{}'::integer[]
  )
  into v_given
  from pg_catalog.unnest(p_affected) given(participant_number);

  if v_given is distinct from v_required then
    raise exception 'Affected participants must exactly match every endpoint in the reviewed current and resulting pairs';
  end if;

  return public.apply_match_swap_plan_provenance_unchecked(
    p_match_id,
    p_event_id,
    p_round,
    p_pairs,
    p_affected,
    p_expected_pairs,
    p_plan_summary
  );
end;
$$;

-- SECURITY DEFINER is required because the underlying legacy writer is no
-- longer executable by service_role. Only the validated wrapper is exposed.
revoke all on function public.apply_match_swap_plan_provenance_unchecked(
  uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.apply_match_swap_plan_with_score_provenance(
  uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_match_swap_plan_with_score_provenance(
  uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
) to service_role;

create or replace function public.undo_match_swap_plan(p_audit_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_audit public.match_swap_audits%rowtype;
  v_current_rows jsonb := '[]'::jsonb;
  v_updated integer := 0;
begin
  select * into v_audit
  from public.match_swap_audits
  where id = p_audit_id
  for update;

  if not found then raise exception 'Swap audit not found'; end if;
  if v_audit.undone_at is not null then raise exception 'This swap was already undone'; end if;

  -- Serialize with apply/swap calls for this event and round. The row locks
  -- below additionally close the race with ordinary score/stat updates that
  -- do not participate in the advisory-lock protocol.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_audit.match_id::text || ':' || v_audit.event_id::text || ':' || v_audit.round::text,
      0
    )
  );

  perform 1
  from public.match_results m
  where m.match_id = v_audit.match_id
    and m.event_id = v_audit.event_id
    and m.round = v_audit.round
    and (
      m.participant_a_number = any(v_audit.affected_numbers)
      or m.participant_b_number = any(v_audit.affected_numbers)
    )
  for update;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.id::text),
    '[]'::jsonb
  )
  into v_current_rows
  from public.match_results m
  where m.match_id = v_audit.match_id
    and m.event_id = v_audit.event_id
    and m.round = v_audit.round
    and (
      m.participant_a_number = any(v_audit.affected_numbers)
      or m.participant_b_number = any(v_audit.affected_numbers)
    );

  -- Compare complete rows, not just pair topology. Any changed compatibility
  -- total, component stat, score snapshot/hash/model, reason, or other column
  -- stops the undo before it can delete or restore anything.
  if v_current_rows is distinct from v_audit.after_rows then
    raise exception using
      errcode = '40001',
      message = 'Matches or score details changed after this swap. Undo was stopped to protect newer work.';
  end if;

  delete from public.match_results m
  where m.match_id = v_audit.match_id
    and m.event_id = v_audit.event_id
    and m.round = v_audit.round
    and (
      m.participant_a_number = any(v_audit.affected_numbers)
      or m.participant_b_number = any(v_audit.affected_numbers)
    );

  insert into public.match_results
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.match_results,
    v_audit.before_rows
  ) restored;

  update public.match_swap_audits
  set undone_at = pg_catalog.now()
  where id = p_audit_id
    and undone_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'This swap was already undone';
  end if;

  return pg_catalog.jsonb_build_object('success', true, 'audit_id', p_audit_id);
end;
$$;

revoke all on function public.undo_match_swap_plan(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.undo_match_swap_plan(uuid)
  to service_role;
