-- Immutable audit snapshots for an approved choice-only Event3 seating plan.
-- The public schema is exposed through PostgREST in this project, so RLS is
-- enabled without end-user policies and access remains service-role only.
create table if not exists public.event3_choice_seating_reports (
  id bigint generated always as identity primary key,
  match_id uuid not null,
  event_id integer not null,
  is_test_mode boolean not null default false,
  session_key text not null,
  candidate_id text not null,
  candidate_rank smallint not null
    constraint event3_choice_seating_reports_rank_check check (candidate_rank between 1 and 3),
  generator_version text not null,
  context_hash text not null
    constraint event3_choice_seating_reports_context_hash_check check (context_hash ~ '^[0-9a-f]{64}$'),
  report jsonb not null
    constraint event3_choice_seating_reports_report_check check (
      pg_catalog.jsonb_typeof(report) = 'object'
      and report ->> 'schema_version' = 'event3-choice-seating-report-v1'
      and pg_catalog.jsonb_typeof(report -> 'decision_context') = 'object'
      and pg_catalog.jsonb_typeof(report #> '{decision_context,alternatives_summary}') = 'array'
      and pg_catalog.jsonb_array_length(
        case when pg_catalog.jsonb_typeof(report #> '{decision_context,alternatives_summary}') = 'array'
          then report #> '{decision_context,alternatives_summary}' else '[]'::jsonb end
      ) = 3
    ),
  assignments jsonb not null
    constraint event3_choice_seating_reports_assignments_check check (
      pg_catalog.jsonb_typeof(assignments) = 'array'
      and pg_catalog.jsonb_array_length(assignments) = 126
    ),
  created_at timestamptz not null default pg_catalog.now(),
  constraint event3_choice_seating_reports_candidate_id_check
    check (pg_catalog.length(candidate_id) between 1 and 200),
  constraint event3_choice_seating_reports_generator_version_check
    check (pg_catalog.length(generator_version) between 1 and 200),
  constraint event3_choice_seating_reports_session_key_check
    check (pg_catalog.length(session_key) between 1 and 200)
);

create index if not exists event3_choice_seating_reports_latest_idx
  on public.event3_choice_seating_reports (
    match_id,
    event_id,
    is_test_mode,
    session_key,
    created_at desc,
    id desc
  );

alter table public.event3_choice_seating_reports enable row level security;

-- Make the profile version used by preview CAS a database invariant. Several
-- participant update paths predate survey_data_updated_at, so updated_at must
-- advance for every row mutation rather than relying on each caller to do it.
create or replace function public.touch_event3_choice_profile_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists event3_touch_choice_profile_version on public.participants;
create trigger event3_touch_choice_profile_version
before update on public.participants
for each row execute function public.touch_event3_choice_profile_version();

-- Applying a signed option writes all 126 seats first through the existing
-- hardened replacement function and then inserts the exact report snapshot.
-- Both statements execute in one transaction, so neither can survive alone.
create or replace function public.apply_event3_choice_seating_preview(
  p_match_id uuid,
  p_static_match_id uuid,
  p_event_id integer,
  p_expected_test_mode boolean,
  p_expected_started_at text,
  p_participants jsonb,
  p_expected_roster jsonb,
  p_profile_versions jsonb,
  p_expected_protected_pairs jsonb,
  p_expected_assignments jsonb,
  p_expected_report_id bigint,
  p_assignments jsonb,
  p_context_hash text,
  p_candidate_id text,
  p_candidate_rank smallint,
  p_generator_version text,
  p_report jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_result jsonb;
  v_report_id bigint;
  v_current_report_id bigint;
  v_session_key text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );

  -- The preview is only approvable while this exact Event3 setup session is
  -- still idle. Check these mutable runtime gates inside the transaction,
  -- after taking the shared Event3 advisory lock, so a timer/group start
  -- cannot race the later seating replacement.
  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  if not found
     or v_state.current_event_id is distinct from p_event_id
     or v_state.phase is distinct from 'setup'
     or coalesce(v_state.global_timer_active, false)
     or coalesce(v_state.groups_locked, false) then
    raise exception 'Choice seating approval requires the active unlocked setup event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false)
       is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '')
         is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before choice seating approval' using errcode = '55000';
  end if;

  -- Take the same write-excluding table locks, in the same order, as the
  -- replacement RPC before evaluating either roster or seating baselines.
  -- This closes direct writers and table-swap paths that use other advisory
  -- lock keys; the CAS remains stable until replacement and report insert.
  lock table public.event3_participants, public.session_assignments in share row exclusive mode;

  if pg_catalog.jsonb_typeof(p_participants) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_participants) <> 42 then
    raise exception 'Choice seating approval roster must contain 42 participants' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_expected_roster) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_expected_roster) <> 42 then
    raise exception 'Choice seating approval expected roster must contain 42 participants' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_profile_versions) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_profile_versions) <> 42 then
    raise exception 'Choice seating approval profile versions must contain 42 participants' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_expected_protected_pairs) is distinct from 'array' then
    raise exception 'Choice seating approval protected pairs must be an array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_expected_assignments) is distinct from 'array' then
    raise exception 'Choice seating approval baseline must be an array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_report, '{}'::jsonb)) <> 'object'
     or p_report ->> 'schema_version' is distinct from 'event3-choice-seating-report-v1'
     or pg_catalog.jsonb_typeof(p_report -> 'decision_context') is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_report #> '{decision_context,alternatives_summary}') is distinct from 'array'
     or pg_catalog.jsonb_array_length(
       case when pg_catalog.jsonb_typeof(p_report #> '{decision_context,alternatives_summary}') = 'array'
         then p_report #> '{decision_context,alternatives_summary}' else '[]'::jsonb end
     ) <> 3 then
    raise exception 'Choice seating approval requires a complete versioned report' using errcode = '22023';
  end if;
  if p_candidate_rank not between 1 and 3
     or p_candidate_id is null or pg_catalog.length(p_candidate_id) not between 1 and 200
     or p_generator_version is null or pg_catalog.length(p_generator_version) not between 1 and 200
     or p_context_hash is null or p_context_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Choice seating approval metadata is invalid' using errcode = '22023';
  end if;
  if p_expected_report_id is not null and p_expected_report_id <= 0 then
    raise exception 'Choice seating approval report revision is invalid' using errcode = '22023';
  end if;
  if (p_report #>> '{candidate,id}') is distinct from p_candidate_id
     or coalesce((p_report #>> '{candidate,rank}')::smallint, 0) is distinct from p_candidate_rank then
    raise exception 'Choice seating report does not identify the selected candidate' using errcode = '22023';
  end if;

  v_session_key := case when coalesce(p_expected_test_mode, false)
    then coalesce(p_expected_started_at, 'legacy-test')
    else 'live'
  end;
  select pg_catalog.max(saved_report.id) into v_current_report_id
  from public.event3_choice_seating_reports saved_report
  where saved_report.match_id = p_match_id
    and saved_report.event_id = p_event_id
    and saved_report.is_test_mode = coalesce(p_expected_test_mode, false)
    and saved_report.session_key = v_session_key;
  if v_current_report_id is distinct from p_expected_report_id then
    raise exception 'The seating approval decision changed since this preview was generated' using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_expected_roster)
      as expected(participant_number integer, position integer)
    where expected.participant_number is null or expected.participant_number <= 0
      or expected.position is null or expected.position < 0
  ) or (select count(*) from public.event3_participants current_participant
      where current_participant.match_id = p_match_id
        and current_participant.event_id = p_event_id)
       <> pg_catalog.jsonb_array_length(p_expected_roster)
     or exists (
       select 1
       from public.event3_participants current_participant
       where current_participant.match_id = p_match_id
         and current_participant.event_id = p_event_id
         and not exists (
           select 1
           from pg_catalog.jsonb_to_recordset(p_expected_roster)
             as expected(participant_number integer, position integer)
           where expected.participant_number = current_participant.participant_number
             and expected.position = current_participant.position
         )
     ) or exists (
       select 1
       from pg_catalog.jsonb_to_recordset(p_expected_roster)
         as expected(participant_number integer, position integer)
       where not exists (
         select 1
         from public.event3_participants current_participant
         where current_participant.match_id = p_match_id
           and current_participant.event_id = p_event_id
           and current_participant.participant_number = expected.participant_number
           and current_participant.position = expected.position
       )
     ) then
    raise exception 'Choice seating roster order changed since this preview was generated' using errcode = '55000';
  end if;

  -- Freeze every scoring input after taking the same event lock used by all
  -- Event3 runtime mutations. Participant row locks prevent a survey/profile
  -- edit during approval; table SHARE locks prevent protected-pair phantoms.
  perform participant.assigned_number
  from public.participants participant
  where participant.match_id = p_static_match_id
    and exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_participants)
        as selected(participant_number integer, position integer)
      where selected.participant_number = participant.assigned_number
    )
  order by participant.assigned_number
  for share;
  lock table public.locked_matches, public.event3_exclusions in share mode;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_profile_versions)
      as expected(
        participant_number integer,
        updated_at timestamptz,
        survey_data_updated_at timestamptz,
        gender text,
        age text
      )
    where expected.participant_number is null or expected.participant_number <= 0
  ) or exists (
    select expected.participant_number
    from pg_catalog.jsonb_to_recordset(p_profile_versions)
      as expected(participant_number integer)
    group by expected.participant_number
    having count(*) <> 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_profile_versions)
      as expected(participant_number integer)
    where not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_participants)
        as selected(participant_number integer)
      where selected.participant_number = expected.participant_number
    )
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_participants)
      as selected(participant_number integer)
    where not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_profile_versions)
        as expected(participant_number integer)
      where expected.participant_number = selected.participant_number
    )
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_profile_versions)
      as expected(
        participant_number integer,
        updated_at timestamptz,
        survey_data_updated_at timestamptz,
        gender text,
        age text
      )
    left join public.participants participant
      on participant.match_id = p_static_match_id
      and participant.assigned_number = expected.participant_number
    where participant.assigned_number is null
      or participant.updated_at is distinct from expected.updated_at
      or participant.survey_data_updated_at is distinct from expected.survey_data_updated_at
      or participant.gender is distinct from expected.gender
      or participant.age::text is distinct from expected.age
  ) then
    raise exception 'Participant profiles changed since this preview was generated' using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_expected_protected_pairs)
      as expected(participant_a integer, participant_b integer)
    where expected.participant_a is null or expected.participant_b is null
      or expected.participant_a <= 0 or expected.participant_a >= expected.participant_b
  ) or exists (
    select expected.participant_a, expected.participant_b
    from pg_catalog.jsonb_to_recordset(p_expected_protected_pairs)
      as expected(participant_a integer, participant_b integer)
    group by expected.participant_a, expected.participant_b
    having count(*) <> 1
  ) then
    raise exception 'Choice seating approval protected pairs are invalid' using errcode = '22023';
  end if;
  if exists (
    with expected_pairs as (
      select expected.participant_a, expected.participant_b
      from pg_catalog.jsonb_to_recordset(p_expected_protected_pairs)
        as expected(participant_a integer, participant_b integer)
    ), actual_pairs as (
      select
        least(locked.participant1_number, locked.participant2_number) as participant_a,
        greatest(locked.participant1_number, locked.participant2_number) as participant_b
      from public.locked_matches locked
      where locked.match_id = p_static_match_id and locked.event_id = p_event_id
        and exists (select 1 from pg_catalog.jsonb_to_recordset(p_participants)
          as selected(participant_number integer) where selected.participant_number = locked.participant1_number)
        and exists (select 1 from pg_catalog.jsonb_to_recordset(p_participants)
          as selected(participant_number integer) where selected.participant_number = locked.participant2_number)
      union
      select
        least(exclusion.participant_a_number, exclusion.participant_b_number),
        greatest(exclusion.participant_a_number, exclusion.participant_b_number)
      from public.event3_exclusions exclusion
      where exclusion.match_id = p_match_id and exclusion.event_id = p_event_id
        and exists (select 1 from pg_catalog.jsonb_to_recordset(p_participants)
          as selected(participant_number integer) where selected.participant_number = exclusion.participant_a_number)
        and exists (select 1 from pg_catalog.jsonb_to_recordset(p_participants)
          as selected(participant_number integer) where selected.participant_number = exclusion.participant_b_number)
    )
    select 1 from (
      (select participant_a, participant_b from expected_pairs
       except select participant_a, participant_b from actual_pairs)
      union all
      (select participant_a, participant_b from actual_pairs
       except select participant_a, participant_b from expected_pairs)
    ) changed_pair
  ) then
    raise exception 'Protected pairs changed since this preview was generated' using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_expected_assignments)
      as expected(round smallint, table_number integer, participant_id integer)
    where expected.round not in (1, 2, 3)
      or expected.table_number not between 1 and 6
      or expected.participant_id is null
  ) or exists (
    select expected.round, expected.participant_id
    from pg_catalog.jsonb_to_recordset(p_expected_assignments)
      as expected(round smallint, table_number integer, participant_id integer)
    group by expected.round, expected.participant_id
    having count(*) <> 1
  ) then
    raise exception 'Choice seating approval baseline is invalid' using errcode = '22023';
  end if;
  if (select count(*) from public.session_assignments current_assignment
      where current_assignment.match_id = p_match_id
        and current_assignment.event_id = p_event_id
        and current_assignment.round in (1, 2, 3))
       <> pg_catalog.jsonb_array_length(p_expected_assignments)
     or exists (
       select 1
       from public.session_assignments current_assignment
       where current_assignment.match_id = p_match_id
         and current_assignment.event_id = p_event_id
         and current_assignment.round in (1, 2, 3)
         and not exists (
           select 1
           from pg_catalog.jsonb_to_recordset(p_expected_assignments)
             as expected(round smallint, table_number integer, participant_id integer)
           where expected.round = current_assignment.round
             and expected.table_number = current_assignment.table_number
             and expected.participant_id = current_assignment.participant_id
         )
     ) or exists (
       select 1
       from pg_catalog.jsonb_to_recordset(p_expected_assignments)
         as expected(round smallint, table_number integer, participant_id integer)
       where not exists (
         select 1
         from public.session_assignments current_assignment
         where current_assignment.match_id = p_match_id
           and current_assignment.event_id = p_event_id
           and current_assignment.round = expected.round
           and current_assignment.table_number = expected.table_number
           and current_assignment.participant_id = expected.participant_id
       )
     ) then
    raise exception 'Choice seating changed since this preview was generated' using errcode = '55000';
  end if;

  v_result := public.replace_event3_choice_seating(
    p_match_id,
    p_event_id,
    p_expected_test_mode,
    p_expected_started_at,
    p_participants,
    p_assignments
  );
  insert into public.event3_choice_seating_reports (
    match_id,
    event_id,
    is_test_mode,
    session_key,
    candidate_id,
    candidate_rank,
    generator_version,
    context_hash,
    report,
    assignments
  ) values (
    p_match_id,
    p_event_id,
    coalesce(p_expected_test_mode, false),
    v_session_key,
    p_candidate_id,
    p_candidate_rank,
    p_generator_version,
    p_context_hash,
    p_report,
    p_assignments
  ) returning id into v_report_id;

  return v_result || pg_catalog.jsonb_build_object(
    'report_id', v_report_id,
    'candidate_id', p_candidate_id,
    'candidate_rank', p_candidate_rank,
    'generator_version', p_generator_version
  );
end;
$$;

revoke all on table public.event3_choice_seating_reports
  from public, anon, authenticated;
revoke all on sequence public.event3_choice_seating_reports_id_seq
  from public, anon, authenticated;
revoke all on function public.touch_event3_choice_profile_version()
  from public, anon, authenticated;
revoke all on function public.apply_event3_choice_seating_preview(
  uuid, uuid, integer, boolean, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, jsonb, text, text, smallint, text, jsonb
) from public, anon, authenticated;

grant select, insert on table public.event3_choice_seating_reports
  to service_role;
grant usage, select on sequence public.event3_choice_seating_reports_id_seq
  to service_role;
grant execute on function public.apply_event3_choice_seating_preview(
  uuid, uuid, integer, boolean, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, jsonb, text, text, smallint, text, jsonb
) to service_role;
