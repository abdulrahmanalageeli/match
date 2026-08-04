-- Applies an entire match swap/chain in one PostgreSQL transaction and keeps
-- an exact before/after snapshot for a conflict-safe undo. The functions are
-- service-role only; the browser never receives direct table access.

create table if not exists public.match_swap_audits (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  event_id integer not null,
  round smallint not null,
  affected_numbers integer[] not null,
  before_rows jsonb not null default '[]'::jsonb,
  after_rows jsonb not null default '[]'::jsonb,
  plan_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz null
);

create index if not exists match_swap_audits_event_created_idx
  on public.match_swap_audits (match_id, event_id, created_at desc);

alter table public.match_swap_audits enable row level security;
revoke all on table public.match_swap_audits from public, anon, authenticated;
grant all on table public.match_swap_audits to service_role;

create or replace function public.apply_match_swap_plan(
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
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_a integer;
  v_b integer;
  v_all_numbers integer[] := '{}'::integer[];
  v_before_rows jsonb := '[]'::jsonb;
  v_after_rows jsonb := '[]'::jsonb;
  v_current_pairs jsonb := '[]'::jsonb;
  v_expected_pairs jsonb := '[]'::jsonb;
  v_audit_id uuid;
  v_event_finished boolean := false;
begin
  if p_match_id is null or p_event_id is null or p_round is null then
    raise exception 'match_id, event_id, and round are required';
  end if;
  if jsonb_typeof(p_pairs) <> 'array' or jsonb_array_length(p_pairs) = 0 then
    raise exception 'pairs must be a non-empty JSON array';
  end if;
  if coalesce(array_length(p_affected, 1), 0) = 0 then
    raise exception 'affected participant numbers are required';
  end if;

  -- Serialize swap writes for the same event/round.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':' || p_round::text, 0)
  );

  for v_item in select value from pg_catalog.jsonb_array_elements(p_pairs)
  loop
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;
    if v_a is null or v_b is null or v_a <= 0 or v_b <= 0 or v_a = v_b then
      raise exception 'Every pair must contain two different positive participant numbers';
    end if;
    if v_a = any(v_all_numbers) or v_b = any(v_all_numbers) then
      raise exception 'A participant cannot appear in more than one resulting pair';
    end if;
    v_all_numbers := pg_catalog.array_append(pg_catalog.array_append(v_all_numbers, v_a), v_b);
  end loop;

  if exists (
    select 1
    from pg_catalog.unnest(v_all_numbers) as requested(number)
    where not exists (
      select 1 from public.participants p
      where p.match_id = p_match_id and p.assigned_number = requested.number
    )
  ) then
    raise exception 'One or more participants do not exist for this match';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.id::text), '[]'::jsonb),
         coalesce(pg_catalog.bool_or(m.event_finished), false)
    into v_before_rows, v_event_finished
  from public.match_results m
  where m.match_id = p_match_id
    and m.event_id = p_event_id
    and m.round = p_round
    and (m.participant_a_number = any(p_affected) or m.participant_b_number = any(p_affected));

  select coalesce(pg_catalog.jsonb_agg(x.obj order by x.sort_key), '[]'::jsonb)
    into v_current_pairs
  from (
    select distinct
      least(m.participant_a_number, m.participant_b_number)::text || '-' || greatest(m.participant_a_number, m.participant_b_number)::text as sort_key,
      pg_catalog.jsonb_build_object(
        'a', least(m.participant_a_number, m.participant_b_number),
        'b', greatest(m.participant_a_number, m.participant_b_number)
      ) as obj
    from public.match_results m
    where m.match_id = p_match_id
      and m.event_id = p_event_id
      and m.round = p_round
      and m.participant_a_number <> 9999
      and m.participant_b_number <> 9999
      and (m.participant_a_number = any(p_affected) or m.participant_b_number = any(p_affected))
  ) x;

  select coalesce(pg_catalog.jsonb_agg(x.obj order by x.sort_key), '[]'::jsonb)
    into v_expected_pairs
  from (
    select distinct
      least((item ->> 'a')::integer, (item ->> 'b')::integer)::text || '-' || greatest((item ->> 'a')::integer, (item ->> 'b')::integer)::text as sort_key,
      pg_catalog.jsonb_build_object(
        'a', least((item ->> 'a')::integer, (item ->> 'b')::integer),
        'b', greatest((item ->> 'a')::integer, (item ->> 'b')::integer)
      ) as obj
    from pg_catalog.jsonb_array_elements(coalesce(p_expected_pairs, '[]'::jsonb)) item
  ) x;

  if v_current_pairs <> v_expected_pairs then
    raise exception using
      errcode = '40001',
      message = 'Match state changed while this plan was being reviewed. Refresh and review again.';
  end if;

  delete from public.match_results m
  where m.match_id = p_match_id
    and m.event_id = p_event_id
    and m.round = p_round
    and (m.participant_a_number = any(p_affected) or m.participant_b_number = any(p_affected));

  insert into public.match_results (
    match_id, event_id, round,
    participant_a_number, participant_b_number,
    compatibility_score, reason,
    mbti_compatibility_score, attachment_compatibility_score,
    communication_compatibility_score, lifestyle_compatibility_score,
    core_values_compatibility_score, vibe_compatibility_score,
    synergy_score, humor_open_score, intent_score, humor_multiplier,
    attachment_penalty_applied, intent_boost_applied,
    dead_air_veto_applied, humor_clash_veto_applied,
    cap_applied, humor_early_openness_bonus, event_finished, created_at
  )
  select
    p_match_id, p_event_id, p_round,
    (item ->> 'a')::integer,
    (item ->> 'b')::integer,
    coalesce((item ->> 'compatibility_score')::integer, 0),
    item ->> 'reason',
    coalesce((item ->> 'mbti_compatibility_score')::numeric, 0),
    coalesce((item ->> 'attachment_compatibility_score')::numeric, 0),
    coalesce((item ->> 'communication_compatibility_score')::numeric, 0),
    coalesce((item ->> 'lifestyle_compatibility_score')::numeric, 0),
    coalesce((item ->> 'core_values_compatibility_score')::numeric, 0),
    coalesce((item ->> 'vibe_compatibility_score')::numeric, 0),
    coalesce((item ->> 'synergy_score')::numeric, 0),
    coalesce((item ->> 'humor_open_score')::numeric, 0),
    coalesce((item ->> 'intent_score')::numeric, 0),
    coalesce((item ->> 'humor_multiplier')::numeric, 1),
    coalesce((item ->> 'attachment_penalty_applied')::boolean, false),
    coalesce((item ->> 'intent_boost_applied')::boolean, false),
    coalesce((item ->> 'dead_air_veto_applied')::boolean, false),
    coalesce((item ->> 'humor_clash_veto_applied')::boolean, false),
    nullif(item ->> 'cap_applied', '')::numeric,
    coalesce(item ->> 'humor_early_openness_bonus', 'none'),
    v_event_finished,
    pg_catalog.now()
  from pg_catalog.jsonb_array_elements(p_pairs) item;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.id::text), '[]'::jsonb)
    into v_after_rows
  from public.match_results m
  where m.match_id = p_match_id
    and m.event_id = p_event_id
    and m.round = p_round
    and (m.participant_a_number = any(p_affected) or m.participant_b_number = any(p_affected));

  insert into public.match_swap_audits (
    match_id, event_id, round, affected_numbers,
    before_rows, after_rows, plan_summary
  ) values (
    p_match_id, p_event_id, p_round, p_affected,
    v_before_rows, v_after_rows, coalesce(p_plan_summary, '{}'::jsonb)
  ) returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'audit_id', v_audit_id,
    'pairs_created', pg_catalog.jsonb_array_length(p_pairs)
  );
end;
$$;

create or replace function public.undo_match_swap_plan(p_audit_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_audit public.match_swap_audits%rowtype;
  v_current_pairs jsonb := '[]'::jsonb;
  v_after_pairs jsonb := '[]'::jsonb;
begin
  select * into v_audit
  from public.match_swap_audits
  where id = p_audit_id
  for update;

  if not found then raise exception 'Swap audit not found'; end if;
  if v_audit.undone_at is not null then raise exception 'This swap was already undone'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_audit.match_id::text || ':' || v_audit.event_id::text || ':' || v_audit.round::text, 0)
  );

  select coalesce(pg_catalog.jsonb_agg(x.obj order by x.sort_key), '[]'::jsonb)
    into v_current_pairs
  from (
    select distinct
      least(m.participant_a_number, m.participant_b_number)::text || '-' || greatest(m.participant_a_number, m.participant_b_number)::text as sort_key,
      pg_catalog.jsonb_build_object('a', least(m.participant_a_number, m.participant_b_number), 'b', greatest(m.participant_a_number, m.participant_b_number)) as obj
    from public.match_results m
    where m.match_id = v_audit.match_id and m.event_id = v_audit.event_id and m.round = v_audit.round
      and m.participant_a_number <> 9999 and m.participant_b_number <> 9999
      and (m.participant_a_number = any(v_audit.affected_numbers) or m.participant_b_number = any(v_audit.affected_numbers))
  ) x;

  select coalesce(pg_catalog.jsonb_agg(x.obj order by x.sort_key), '[]'::jsonb)
    into v_after_pairs
  from (
    select distinct
      least((item ->> 'participant_a_number')::integer, (item ->> 'participant_b_number')::integer)::text || '-' || greatest((item ->> 'participant_a_number')::integer, (item ->> 'participant_b_number')::integer)::text as sort_key,
      pg_catalog.jsonb_build_object('a', least((item ->> 'participant_a_number')::integer, (item ->> 'participant_b_number')::integer), 'b', greatest((item ->> 'participant_a_number')::integer, (item ->> 'participant_b_number')::integer)) as obj
    from pg_catalog.jsonb_array_elements(v_audit.after_rows) item
    where (item ->> 'participant_a_number')::integer <> 9999 and (item ->> 'participant_b_number')::integer <> 9999
  ) x;

  if v_current_pairs <> v_after_pairs then
    raise exception using
      errcode = '40001',
      message = 'Matches changed after this swap. Undo was stopped to protect newer work.';
  end if;

  delete from public.match_results m
  where m.match_id = v_audit.match_id and m.event_id = v_audit.event_id and m.round = v_audit.round
    and (m.participant_a_number = any(v_audit.affected_numbers) or m.participant_b_number = any(v_audit.affected_numbers));

  insert into public.match_results
  select restored.*
  from pg_catalog.jsonb_populate_recordset(null::public.match_results, v_audit.before_rows) restored;

  update public.match_swap_audits set undone_at = pg_catalog.now() where id = p_audit_id;
  return pg_catalog.jsonb_build_object('success', true, 'audit_id', p_audit_id);
end;
$$;

revoke all on function public.apply_match_swap_plan(uuid, integer, smallint, jsonb, integer[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.undo_match_swap_plan(uuid) from public, anon, authenticated;
grant execute on function public.apply_match_swap_plan(uuid, integer, smallint, jsonb, integer[], jsonb, jsonb) to service_role;
grant execute on function public.undo_match_swap_plan(uuid) to service_role;
