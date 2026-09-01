-- Event-scoped opt-in flow for editions that use three groups and three
-- ranking-only matches. Missing settings rows deliberately retain legacy mode.
create table if not exists public.event3_event_settings (
  match_id uuid not null,
  event_id integer not null,
  event_format text not null default 'classic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, event_id),
  constraint event3_event_settings_format check (
    event_format in ('classic', 'choice_only_three_groups')
  )
);
comment on table public.event3_event_settings is
  'Per-edition Event3 experience format. A missing row means classic.';
alter table public.event3_event_settings enable row level security;
revoke all on public.event3_event_settings from public, anon, authenticated;
grant all on public.event3_event_settings to service_role;
drop policy if exists event3_event_settings_service_only on public.event3_event_settings;
create policy event3_event_settings_service_only on public.event3_event_settings
  for all to service_role using (true) with check (true);

alter table public.event3_matches
  add column if not exists phase4_partner integer,
  add column if not exists phase4_score integer,
  add column if not exists phase4_score_model_version text,
  add column if not exists phase4_score_snapshot jsonb,
  add column if not exists phase4_score_content_hash text,
  add column if not exists phase4_word text,
  add column if not exists phase4_feedback jsonb;

alter table public.event3_cohost_notes
  drop constraint if exists event3_cohost_notes_round_check,
  drop constraint if exists event3_cohost_notes_scope_shape;
alter table public.event3_cohost_notes
  add constraint event3_cohost_notes_round_check
    check (round in (1, 2, 3, 20, 30, 40)),
  add constraint event3_cohost_notes_scope_shape check (
    (
      scope_type = 'event'
      and round is null
      and table_number is null
      and participant_number is null
      and participant2_number is null
    )
    or (
      scope_type = 'table'
      and round is not null
      and table_number is not null
      and participant_number is null
      and participant2_number is null
    )
    or (
      scope_type = 'participant'
      and round is null
      and table_number is null
      and participant_number is not null
      and participant2_number is null
    )
    or (
      scope_type = 'pair'
      and round in (20, 30, 40)
      and table_number is null
      and participant_number is not null
      and participant2_number is not null
      and participant_number < participant2_number
    )
  );

alter table public.event3_matches
  drop constraint if exists event3_matches_match_preference_check,
  drop constraint if exists event3_matches_phase4_score_snapshot_object,
  drop constraint if exists event3_matches_phase4_score_provenance_complete;
alter table public.event3_matches
  add constraint event3_matches_match_preference_check check (
    match_preference in (
      'choice', 'algorithm', 'both', 'neither',
      'first', 'second', 'third', 'multiple', 'none'
    )
  ),
  add constraint event3_matches_phase4_score_snapshot_object check (
    phase4_score_snapshot is null or pg_catalog.jsonb_typeof(phase4_score_snapshot) = 'object'
  ),
  add constraint event3_matches_phase4_score_provenance_complete check (
    case
      when phase4_score_model_version is null
        and phase4_score_snapshot is null
        and phase4_score_content_hash is null then true
      when phase4_score_model_version is not null
        and phase4_score_snapshot is not null
        and phase4_score_content_hash is not null then
        coalesce(
          phase4_score_snapshot ->> 'scoreModelVersion' = phase4_score_model_version
          and phase4_score_snapshot ->> 'combinedContentHash' = phase4_score_content_hash
          and pg_catalog.jsonb_typeof(phase4_score_snapshot -> 'scoreBreakdown') = 'object'
          and pg_catalog.jsonb_typeof(phase4_score_snapshot -> 'questionScores') = 'object'
          and pg_catalog.jsonb_typeof(phase4_score_snapshot -> 'vibeAxes') = 'object'
          and phase4_score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
          and phase4_score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
          and phase4_score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
          and case
            when phase4_score is not null
              and pg_catalog.jsonb_typeof(phase4_score_snapshot -> 'totalScore') = 'number'
              then (phase4_score_snapshot ->> 'totalScore')::numeric = phase4_score::numeric
            else false
          end,
          false
        )
      else false
    end
  );

alter table public.event3_ranking_drafts
  drop constraint if exists event3_ranking_drafts_completed_rounds_check;
alter table public.event3_ranking_drafts
  add constraint event3_ranking_drafts_completed_rounds_check
  check (completed_rounds in (1, 2, 3));

alter table public.event3_group_member_feedback
  drop constraint if exists event3_group_member_feedback_round;
alter table public.event3_group_member_feedback
  add constraint event3_group_member_feedback_round
  check (group_round in (1, 2, 3));

alter table public.event3_group_reflections
  drop constraint if exists event3_group_reflections_group_round,
  drop constraint if exists event3_group_reflections_source_phase;
alter table public.event3_group_reflections
  add constraint event3_group_reflections_group_round
    check (group_round in (1, 2, 3)),
  add constraint event3_group_reflections_source_phase
    check (source_phase in ('ranking1', 'ranking2', 'ranking3'));
create or replace function public.save_event3_ranking(
  p_match_id uuid, p_event_id integer, p_ranker_number integer,
  p_completed_rounds integer, p_ranked_numbers integer[],
  p_revision bigint, p_draft_only boolean default false, p_auto_saved boolean default false
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_state public.event_state%rowtype;
  v_expected integer[];
  v_session text;
  v_draft public.event3_ranking_drafts%rowtype;
  v_complete boolean;
begin
  -- Serialize drafts, submissions, and phase changes on the same event row.
  select * into v_state from public.event_state where match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Event has changed; refresh before saving' using errcode = '22023';
  end if;
  if p_completed_rounds is null or p_completed_rounds not in (1, 2, 3) then
    raise exception 'Invalid ranking round' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event3_participants where match_id = p_match_id
    and event_id = p_event_id and participant_number = p_ranker_number) then
    raise exception 'Participant is not enrolled in this event' using errcode = '22023';
  end if;
  v_expected := public.event3_expected_ranked_numbers(p_match_id, p_event_id, p_ranker_number, p_completed_rounds);
  v_complete := cardinality(v_expected) > 0 and not exists (
    select 1 from unnest(v_expected) n where not exists (
      select 1 from public.participant_rankings r where r.match_id = p_match_id
        and r.event_id = p_event_id and r.ranker_number = p_ranker_number and r.ranked_number = n
    )
  );
  -- The phase-exit trigger has already finalized this round. A late phone must
  -- acknowledge that result, never overwrite the ballot used for matching.
  if v_state.phase is distinct from ('ranking' || p_completed_rounds) then
    return jsonb_build_object('closed', true, 'complete', v_complete, 'saved', false);
  end if;
  if cardinality(v_expected) = 0 or p_ranked_numbers is null
    or cardinality(p_ranked_numbers) <> cardinality(v_expected)
    or exists (select 1 from unnest(p_ranked_numbers) n where n is null or not (n = any(v_expected)))
    or (select count(distinct n) from unnest(p_ranked_numbers) n) <> cardinality(v_expected) then
    raise exception 'Ranking must include each participant you met exactly once' using errcode = '22023';
  end if;
  if p_revision is null or p_revision < 0 then
    raise exception 'Invalid draft revision' using errcode = '22023';
  end if;
  v_session := case when v_state.test_mode_active then
    coalesce(v_state.test_mode_snapshot ->> 'started_at', 'legacy-test') else 'live' end;
  select * into v_draft from public.event3_ranking_drafts where match_id = p_match_id
    and event_id = p_event_id and ranker_number = p_ranker_number
    and completed_rounds = p_completed_rounds and session_key = v_session;
  if found and v_draft.revision > p_revision then
    return jsonb_build_object('stale', true, 'complete', v_draft.submitted and v_complete, 'saved', false);
  end if;
  -- An in-flight draft cannot undo a submission with the same revision.
  if found and v_draft.revision = p_revision and v_draft.submitted and p_draft_only then
    return jsonb_build_object('complete', v_complete, 'saved', false);
  end if;
  insert into public.event3_ranking_drafts
    (match_id, event_id, ranker_number, completed_rounds, session_key, ranked_numbers, revision, submitted)
  values (p_match_id, p_event_id, p_ranker_number, p_completed_rounds, v_session,
    p_ranked_numbers, p_revision, not p_draft_only)
  on conflict (match_id, event_id, ranker_number, completed_rounds, session_key) do update
    set ranked_numbers = excluded.ranked_numbers, revision = excluded.revision,
        submitted = excluded.submitted, updated_at = now();
  if not p_draft_only then
    delete from public.participant_rankings where match_id = p_match_id
      and event_id = p_event_id and ranker_number = p_ranker_number;
    insert into public.participant_rankings (match_id, event_id, ranker_number, ranked_number, rank, auto_saved)
      select p_match_id, p_event_id, p_ranker_number, n, ord::integer, p_auto_saved
      from unnest(p_ranked_numbers) with ordinality as ballot(n, ord);
  end if;
  return jsonb_build_object('saved', true, 'complete', not p_draft_only, 'closed', false);
end;
$$;

create or replace function public.complete_event3_rankings(
  p_match_id uuid, p_event_id integer, p_completed_rounds integer, p_ranker_number integer default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_state public.event_state%rowtype;
  v_session text;
  v_number integer;
  v_expected integer[];
  v_missing integer[];
  v_draft public.event3_ranking_drafts%rowtype;
  v_max_rank integer;
  v_saved integer := 0;
  v_added integer := 0;
begin
  select * into v_state from public.event_state where match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Event has changed; rankings were not altered' using errcode = '22023';
  end if;
  if p_completed_rounds is null or p_completed_rounds not in (1, 2, 3) then
    raise exception 'Invalid ranking round' using errcode = '22023';
  end if;
  v_session := case when v_state.test_mode_active then
    coalesce(v_state.test_mode_snapshot ->> 'started_at', 'legacy-test') else 'live' end;
  for v_number in select participant_number from public.event3_participants
    where match_id = p_match_id and event_id = p_event_id
      and (p_ranker_number is null or participant_number = p_ranker_number)
    order by participant_number
  loop
    v_expected := public.event3_expected_ranked_numbers(p_match_id, p_event_id, v_number, p_completed_rounds);
    if cardinality(v_expected) = 0 then
      raise exception 'Participant % has no group seating; rankings were not finalized', v_number using errcode = '22023';
    end if;
    select * into v_draft from public.event3_ranking_drafts where match_id = p_match_id
      and event_id = p_event_id and ranker_number = v_number
      and completed_rounds = p_completed_rounds and session_key = v_session;
    if found and not v_draft.submitted
      and cardinality(v_draft.ranked_numbers) = cardinality(v_expected)
      and v_draft.ranked_numbers @> v_expected and v_draft.ranked_numbers <@ v_expected then
      -- A synced unfinished order is more recent than the first-round ballot.
      delete from public.participant_rankings where match_id = p_match_id
        and event_id = p_event_id and ranker_number = v_number;
      insert into public.participant_rankings (match_id, event_id, ranker_number, ranked_number, rank, auto_saved)
        select p_match_id, p_event_id, v_number, n, ord::integer, true
        from unnest(v_draft.ranked_numbers) with ordinality as ballot(n, ord);
      v_saved := v_saved + 1;
    else
      -- Closed/offline phones may have only a first-round ballot. Append only
      -- missing people; keep all existing choices and their provenance intact.
      select coalesce(array_agg(n order by ord), '{}'::integer[]) into v_missing
        from unnest(v_expected) with ordinality as expected(n, ord)
        where not exists (select 1 from public.participant_rankings r
          where r.match_id = p_match_id and r.event_id = p_event_id
            and r.ranker_number = v_number and r.ranked_number = n);
      if cardinality(v_missing) > 0 then
        select coalesce(max(rank), 0) into v_max_rank from public.participant_rankings
          where match_id = p_match_id and event_id = p_event_id and ranker_number = v_number;
        insert into public.participant_rankings (match_id, event_id, ranker_number, ranked_number, rank, auto_saved)
          select p_match_id, p_event_id, v_number, n, v_max_rank + ord::integer, true
          from unnest(v_missing) with ordinality as missing(n, ord);
        v_added := v_added + cardinality(v_missing);
        v_saved := v_saved + 1;
      end if;
    end if;
    update public.event3_ranking_drafts set submitted = true, updated_at = now()
      where match_id = p_match_id and event_id = p_event_id and ranker_number = v_number
        and completed_rounds = p_completed_rounds and session_key = v_session;
  end loop;
  return jsonb_build_object('saved', v_saved, 'added', v_added, 'completed_rounds', p_completed_rounds);
end;
$$;

-- Match creation uses the session-aware wrapper so a delayed test request can
-- never complete rankings after the live runtime has been restored.
create or replace function public.complete_event3_rankings_v2(
  p_match_id uuid,
  p_event_id integer,
  p_completed_rounds integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
begin
  select state.* into v_state from public.event_state state
    where state.match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Ranking completion requires the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '') is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before rankings were completed' using errcode = '55000';
  end if;
  return public.complete_event3_rankings(p_match_id, p_event_id, p_completed_rounds, null::integer);
end;
$$;

create or replace function public.finalize_event3_rankings_on_phase_exit()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.phase = 'setup' and old.phase is distinct from new.phase
    and new.test_mode_active is not distinct from old.test_mode_active then
    update public.event3_ranking_drafts set submitted = true
      where match_id = old.match_id and event_id = old.current_event_id and not submitted
        and session_key = case when coalesce(old.test_mode_active, false)
          then coalesce(old.test_mode_snapshot ->> 'started_at', 'legacy-test')
          else 'live'
        end;
  end if;
  if old.phase in ('ranking1', 'ranking2', 'ranking3') and new.phase is distinct from old.phase
    and new.phase <> 'setup' and new.current_event_id = old.current_event_id
    and new.test_mode_active is not distinct from old.test_mode_active then
    perform public.complete_event3_rankings(old.match_id, old.current_event_id,
      case old.phase when 'ranking1' then 1 when 'ranking2' then 2 else 3 end);
  end if;
  return new;
end;
$$;
drop trigger if exists event3_complete_rankings_before_phase_exit on public.event_state;
create trigger event3_complete_rankings_before_phase_exit
  before update of phase on public.event_state
  for each row execute function public.finalize_event3_rankings_on_phase_exit();

CREATE OR REPLACE FUNCTION public.replace_event3_group_member_feedback_v2(
  p_match_id uuid,
  p_event_id integer,
  p_group_round smallint,
  p_reviewer_number integer,
  p_is_test_mode boolean,
  p_expected_started_at text,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_state public.event_state%rowtype;
  v_reviewer_table integer;
  v_count integer := 0;
BEGIN
  IF p_group_round NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'Group round must be 1, 2, or 3';
  END IF;
  IF pg_catalog.jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Feedback rows must be an array';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  SELECT state.* INTO v_state
  FROM public.event_state state
  WHERE state.match_id = p_match_id
  FOR UPDATE;
  IF NOT FOUND OR v_state.current_event_id IS DISTINCT FROM p_event_id THEN
    RAISE EXCEPTION 'Group feedback requires the active current event' USING ERRCODE = '55000';
  END IF;
  IF COALESCE(v_state.test_mode_active, false) IS DISTINCT FROM COALESCE(p_is_test_mode, false)
     OR (COALESCE(p_is_test_mode, false) AND
       COALESCE(v_state.test_mode_snapshot ->> 'started_at', '') IS DISTINCT FROM COALESCE(p_expected_started_at, '')) THEN
    RAISE EXCEPTION 'The Event3 live/test session changed before group feedback was saved' USING ERRCODE = '55000';
  END IF;

  LOCK TABLE public.session_assignments IN SHARE MODE;
  SELECT assignment.table_number INTO v_reviewer_table
  FROM public.session_assignments assignment
  WHERE assignment.match_id = p_match_id AND assignment.event_id = p_event_id
    AND assignment.round = p_group_round AND assignment.participant_id = p_reviewer_number;
  IF v_reviewer_table IS NULL THEN
    RAISE EXCEPTION 'The reviewer has no assignment in this group round' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS row_data(member_number integer)
    WHERE row_data.member_number IS NULL OR row_data.member_number = p_reviewer_number
      OR NOT EXISTS (
        SELECT 1 FROM public.session_assignments member_assignment
        WHERE member_assignment.match_id = p_match_id AND member_assignment.event_id = p_event_id
          AND member_assignment.round = p_group_round
          AND member_assignment.table_number = v_reviewer_table
          AND member_assignment.participant_id = row_data.member_number
      )
  ) OR EXISTS (
    SELECT member_number
    FROM pg_catalog.jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS row_data(member_number integer)
    GROUP BY member_number HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Feedback may only include each current tablemate once' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.event3_group_member_feedback
  WHERE match_id = p_match_id
    AND event_id = p_event_id
    AND group_round = p_group_round
    AND reviewer_number = p_reviewer_number
    AND is_test_mode = p_is_test_mode;

  INSERT INTO public.event3_group_member_feedback (
    match_id, event_id, group_round, reviewer_number, member_number,
    experience, tags, organizer_note, is_test_mode, updated_at
  )
  SELECT
    p_match_id,
    p_event_id,
    p_group_round,
    p_reviewer_number,
    row_data.member_number,
    row_data.experience,
    COALESCE(row_data.tags, '{}'::text[]),
    NULLIF(pg_catalog.btrim(row_data.organizer_note), ''),
    p_is_test_mode,
    pg_catalog.now()
  FROM pg_catalog.jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS row_data(
    member_number integer,
    experience text,
    tags text[],
    organizer_note text
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

create or replace function public.begin_event3_test_mode(
  p_event_id integer,
  p_participant_numbers integer[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_snapshot jsonb;
  v_selected_count integer;
  v_expected_count integer;
  v_event_format text;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );

  select state.*
    into v_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
  for update;

  if not found or v_state.current_event_id <> p_event_id then
    raise exception 'Event3 is not configured for event %', p_event_id;
  end if;
  if v_state.test_mode_active is true then
    raise exception 'Event3 test mode is already active';
  end if;

  -- The format is read only after taking the state lock shared with the
  -- atomic format setter, so a concurrent switch cannot admit the wrong
  -- roster size into a new test session.
  select coalesce(settings.event_format, 'classic')
    into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = v_state.match_id and settings.event_id = p_event_id;
  v_expected_count := case when v_event_format = 'choice_only_three_groups' then 42 else 36 end;
  v_selected_count := coalesce(pg_catalog.array_length(p_participant_numbers, 1), 0);
  if v_selected_count <> v_expected_count
     or exists (
       select 1
       from pg_catalog.unnest(p_participant_numbers) selected(participant_number)
       where selected.participant_number is null
          or selected.participant_number <= 0
          or selected.participant_number = 9999
     )
     or (
       select pg_catalog.count(distinct selected.participant_number)
       from pg_catalog.unnest(p_participant_numbers) selected(participant_number)
     ) <> v_selected_count then
    raise exception 'Test mode requires % unique participant numbers for this event format', v_expected_count;
  end if;

  v_snapshot := pg_catalog.jsonb_build_object(
    'version', 1,
    'started_at', pg_catalog.now(),
    'event_state', pg_catalog.to_jsonb(v_state),
    'event3_participants', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.position)
      from public.event3_participants row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_matches', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_matches row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'session_assignments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.session_assignments row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'participant_rankings', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.participant_rankings row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_participant_notes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_participant_notes row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_mood_checks', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_mood_checks row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_notifications', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_notifications row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_ai_welcome_messages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_ai_welcome_messages row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_exclusions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_exclusions row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb)
  );

  insert into public.event3_test_mode_snapshots (
    match_id,
    event_id,
    snapshot,
    created_at
  ) values (
    v_state.match_id,
    p_event_id,
    v_snapshot,
    pg_catalog.now()
  )
  on conflict (match_id, event_id)
  do update set
    snapshot = excluded.snapshot,
    created_at = excluded.created_at;

  -- Mark the new test session active before deleting live runtime rows. The
  -- ranking invalidation trigger derives its draft session from event_state;
  -- without this ordering, deleting snapshotted live ballots would submit the
  -- preserved live drafts that test mode promises not to touch.
  update public.event_state
  set phase = 'setup',
      current_round = 1,
      global_timer_active = false,
      global_timer_start_time = null,
      global_timer_duration = null,
      global_timer_round = null,
      phase2_score_revealed = false,
      phase3_score_revealed = false,
      test_mode_active = true,
      test_mode_snapshot = pg_catalog.jsonb_build_object(
        'started_at', v_snapshot -> 'started_at',
        'snapshot_version', 1
      )
  where match_id = v_state.match_id;

  delete from public.event3_test_match_results
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_participant_notes
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_mood_checks
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_notifications
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_ai_welcome_messages
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.participant_rankings
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.session_assignments
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_matches
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_exclusions
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_participants
  where match_id = v_state.match_id and event_id = p_event_id;

  insert into public.event3_participants (
    match_id,
    event_id,
    participant_number,
    position
  )
  select
    v_state.match_id,
    p_event_id,
    selected.participant_number,
    selected.ordinality - 1
  from pg_catalog.unnest(p_participant_numbers) with ordinality
    selected(participant_number, ordinality);

  return pg_catalog.jsonb_build_object(
    'success', true,
    'selected_count', v_selected_count,
    'snapshot_version', 1
  );
end;
$$;

create or replace function public.swap_event3_table_numbers(
  p_match_id uuid,
  p_event_id integer,
  p_rounds smallint[],
  p_table_a integer,
  p_table_b integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_match_id is null or p_event_id is null or p_event_id <= 0 then
    raise exception 'A valid match and event are required';
  end if;
  if coalesce(pg_catalog.array_length(p_rounds, 1), 0) = 0
     or exists (
       select 1
       from pg_catalog.unnest(p_rounds) as requested(round_number)
       where requested.round_number not in (1, 2, 3, 20, 30, 40)
     ) then
    raise exception 'Rounds must contain only 1, 2, 3, 20, 30, or 40';
  end if;
  if p_table_a is null or p_table_b is null
     or p_table_a <= 0 or p_table_b <= 0
     or p_table_a > 99 or p_table_b > 99
     or p_table_a = p_table_b then
    raise exception 'Two different table numbers between 1 and 99 are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':tables', 0)
  );

  update public.session_assignments
  set table_number = case table_number
    when p_table_a then p_table_b
    when p_table_b then p_table_a
  end
  where match_id = p_match_id
    and event_id = p_event_id
    and round = any(p_rounds)
    and table_number in (p_table_a, p_table_b);
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Neither table exists in the requested round(s)';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'updated_assignments', v_updated,
    'table_a', p_table_a,
    'table_b', p_table_b,
    'rounds', pg_catalog.to_jsonb(p_rounds)
  );
end;
$$;

create or replace function public.swap_event3_group_seats(
  p_match_id uuid,
  p_event_id integer,
  p_participant_a integer,
  p_participant_b integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_event_format text;
  v_round smallint;
  v_table_a integer;
  v_table_b integer;
  v_updated integer := 0;
  v_round_updated integer := 0;
begin
  if p_match_id is null or p_event_id is null or p_event_id <= 0 then
    raise exception 'A valid match and event are required';
  end if;
  if p_participant_a is null or p_participant_b is null
     or p_participant_a <= 0 or p_participant_b <= 0
     or p_participant_a = 9999 or p_participant_b = 9999
     or p_participant_a = p_participant_b then
    raise exception 'Two different participant numbers are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':group-seats', 0)
  );

  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = p_match_id and settings.event_id = p_event_id;
  if v_event_format = 'choice_only_three_groups'
     and (v_state.match_id is null or v_state.current_event_id is distinct from p_event_id
       or v_state.phase is distinct from 'setup') then
    raise exception 'Choice-only group seats can only be swapped during setup for the active event' using errcode = '55000';
  end if;

  foreach v_round in array array[1, 2, 3]::smallint[]
  loop
    select table_number into v_table_a
    from public.session_assignments
    where match_id = p_match_id and event_id = p_event_id
      and round = v_round and participant_id = p_participant_a;

    select table_number into v_table_b
    from public.session_assignments
    where match_id = p_match_id and event_id = p_event_id
      and round = v_round and participant_id = p_participant_b;

    if (v_table_a is null) <> (v_table_b is null) then
      raise exception 'Both participants must have an assignment in group round %', v_round;
    end if;

    if v_table_a is not null and v_table_b is not null then
      update public.session_assignments
      set table_number = case participant_id
        when p_participant_a then v_table_b
        when p_participant_b then v_table_a
      end
      where match_id = p_match_id and event_id = p_event_id
        and round = v_round
        and participant_id in (p_participant_a, p_participant_b);
      get diagnostics v_round_updated = row_count;
      v_updated := v_updated + v_round_updated;
    end if;

    v_table_a := null;
    v_table_b := null;
  end loop;

  if v_updated = 0 then
    raise exception 'Neither participant has a group-round assignment';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'updated_assignments', v_updated,
    'participant_a', p_participant_a,
    'participant_b', p_participant_b
  );
end;
$$;

revoke all on function public.save_event3_ranking(uuid, integer, integer, integer, integer[], bigint, boolean, boolean) from public, anon, authenticated;
revoke all on function public.complete_event3_rankings(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_event3_rankings_v2(uuid, integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.finalize_event3_rankings_on_phase_exit() from public, anon, authenticated;
revoke all on function public.replace_event3_group_member_feedback_v2(uuid, integer, smallint, integer, boolean, text, jsonb) from public, anon, authenticated;
revoke all on function public.begin_event3_test_mode(integer, integer[]) from public, anon, authenticated;
revoke all on function public.swap_event3_table_numbers(uuid, integer, smallint[], integer, integer) from public, anon, authenticated;
revoke all on function public.swap_event3_group_seats(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.save_event3_ranking(uuid, integer, integer, integer, integer[], bigint, boolean, boolean) to service_role;
grant execute on function public.complete_event3_rankings(uuid, integer, integer, integer) to service_role;
grant execute on function public.complete_event3_rankings_v2(uuid, integer, integer, boolean, text) to service_role;
grant execute on function public.finalize_event3_rankings_on_phase_exit() to service_role;
grant execute on function public.replace_event3_group_member_feedback_v2(uuid, integer, smallint, integer, boolean, text, jsonb) to service_role;
grant execute on function public.begin_event3_test_mode(integer, integer[]) to service_role;
grant execute on function public.swap_event3_table_numbers(uuid, integer, smallint[], integer, integer) to service_role;
grant execute on function public.swap_event3_group_seats(uuid, integer, integer, integer) to service_role;

-- Change an edition's format while holding the same event-state lock used by
-- test mode and all choice-only runtime replacement functions. This keeps the
-- empty-runtime check and the settings write in one transaction.
create or replace function public.set_event3_event_format(
  p_match_id uuid,
  p_event_id integer,
  p_event_format text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
begin
  if p_event_id is null or p_event_id <= 0
     or p_event_format not in ('classic', 'choice_only_three_groups') then
    raise exception 'A valid event and Event3 format are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'The Event3 format can only be changed for the active current event' using errcode = '55000';
  end if;
  if v_state.phase is distinct from 'setup' or coalesce(v_state.test_mode_active, false) then
    raise exception 'The Event3 format can only be changed during setup outside test mode' using errcode = '55000';
  end if;

  lock table public.event3_participants, public.session_assignments,
    public.participant_rankings, public.event3_ranking_drafts,
    public.event3_matches, public.event3_group_member_feedback,
    public.event3_group_reflections in share mode;

  if exists (select 1 from public.session_assignments where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.participant_rankings where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.event3_ranking_drafts where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.event3_matches where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.event3_group_member_feedback where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.event3_group_reflections where match_id = p_match_id and event_id = p_event_id) then
    raise exception 'Clear this event''s seating, rankings, matches, and group feedback before changing its format' using errcode = '55000';
  end if;

  insert into public.event3_event_settings(match_id, event_id, event_format, updated_at)
  values (p_match_id, p_event_id, p_event_format, pg_catalog.now())
  on conflict (match_id, event_id) do update set
    event_format = excluded.event_format,
    updated_at = excluded.updated_at;

  if p_event_format = 'choice_only_three_groups' then
    update public.event3_participants
    set phase2_excluded = false
    where match_id = p_match_id and event_id = p_event_id;
  end if;

  return pg_catalog.jsonb_build_object('success', true, 'event_format', p_event_format);
end;
$$;

-- Replace a choice-only roster atomically before seating exists. Participant
-- existence, roster size, event format, phase, and live/test session are all
-- rechecked under the event-state lock.
create or replace function public.replace_event3_choice_roster(
  p_match_id uuid,
  p_static_match_id uuid,
  p_event_id integer,
  p_expected_test_mode boolean,
  p_expected_started_at text,
  p_participant_numbers integer[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_count integer;
begin
  v_count := coalesce(pg_catalog.array_length(p_participant_numbers, 1), 0);
  if v_count <> 42
     or exists (
       select 1 from pg_catalog.unnest(p_participant_numbers) selected(participant_number)
       where selected.participant_number is null or selected.participant_number <= 0
         or selected.participant_number = 9999
     )
     or (select count(distinct selected.participant_number)
       from pg_catalog.unnest(p_participant_numbers) selected(participant_number)) <> 42 then
    raise exception 'The choice-only roster requires 42 unique participant numbers' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Choice roster replacement requires the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '') is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before the roster was saved' using errcode = '55000';
  end if;
  if v_state.phase is distinct from 'setup' then
    raise exception 'The choice-only roster can only be replaced during setup' using errcode = '55000';
  end if;
  if coalesce((select event_format from public.event3_event_settings
      where match_id = p_match_id and event_id = p_event_id), 'classic') <> 'choice_only_three_groups' then
    raise exception 'The 42-person roster is only available for the choice-only event format' using errcode = '55000';
  end if;

  lock table public.event3_participants in share row exclusive mode;
  lock table public.session_assignments, public.participant_rankings,
    public.event3_ranking_drafts, public.event3_matches,
    public.event3_group_member_feedback, public.event3_group_reflections in share mode;
  if exists (select 1 from public.session_assignments where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.participant_rankings where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.event3_ranking_drafts
       where match_id = p_match_id and event_id = p_event_id
         and (not coalesce(p_expected_test_mode, false)
           or session_key = coalesce(p_expected_started_at, 'legacy-test')))
     or exists (select 1 from public.event3_matches where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.event3_group_member_feedback
       where match_id = p_match_id and event_id = p_event_id
         and is_test_mode = coalesce(p_expected_test_mode, false))
     or (not coalesce(p_expected_test_mode, false)
       and exists (select 1 from public.event3_group_reflections where match_id = p_match_id and event_id = p_event_id)) then
    raise exception 'Clear Event3 seating, rankings, matches, and feedback before changing the choice roster' using errcode = '55000';
  end if;
  if (select count(*) from public.participants participant
      where participant.match_id = p_static_match_id
        and participant.assigned_number = any(p_participant_numbers)) <> 42 then
    raise exception 'Every choice-only roster number must identify a current participant' using errcode = '22023';
  end if;

  delete from public.event3_participants where match_id = p_match_id and event_id = p_event_id;
  insert into public.event3_participants(match_id, event_id, participant_number, position, phase2_excluded)
    select p_match_id, p_event_id, selected.participant_number, selected.ordinality - 1, false
    from pg_catalog.unnest(p_participant_numbers) with ordinality selected(participant_number, ordinality);

  return pg_catalog.jsonb_build_object('success', true, 'selected_count', 42);
end;
$$;

-- Replace all three choice-only group rounds atomically. The expected test
-- session prevents a long-running seating calculation from overwriting a
-- restored live event (or a newer test session).
create or replace function public.replace_event3_choice_seating(
  p_match_id uuid,
  p_event_id integer,
  p_expected_test_mode boolean,
  p_expected_started_at text,
  p_participants jsonb,
  p_assignments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_participant_count integer;
  v_assignment_count integer;
begin
  if pg_catalog.jsonb_typeof(coalesce(p_participants, '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Choice seating participants and assignments must be arrays' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Choice seating requires the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '') is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed while seating was generated' using errcode = '55000';
  end if;
  if v_state.phase is distinct from 'setup' then
    raise exception 'Choice seating can only be replaced during setup' using errcode = '55000';
  end if;
  if coalesce((select event_format from public.event3_event_settings
      where match_id = p_match_id and event_id = p_event_id), 'classic') <> 'choice_only_three_groups' then
    raise exception 'Three-round seating is only available for the choice-only event format' using errcode = '55000';
  end if;

  lock table public.event3_participants, public.session_assignments in share row exclusive mode;
  lock table public.participant_rankings, public.event3_ranking_drafts,
    public.event3_matches, public.event3_group_member_feedback,
    public.event3_group_reflections in share mode;

  if exists (select 1 from public.session_assignments where match_id = p_match_id and event_id = p_event_id and round not in (1, 2, 3))
     or exists (select 1 from public.participant_rankings where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.event3_ranking_drafts
       where match_id = p_match_id and event_id = p_event_id
         and (not coalesce(p_expected_test_mode, false)
           or session_key = coalesce(p_expected_started_at, 'legacy-test')))
     or exists (select 1 from public.event3_matches where match_id = p_match_id and event_id = p_event_id)
     or exists (select 1 from public.event3_group_member_feedback
       where match_id = p_match_id and event_id = p_event_id
         and is_test_mode = coalesce(p_expected_test_mode, false))
     or (not coalesce(p_expected_test_mode, false)
       and exists (select 1 from public.event3_group_reflections where match_id = p_match_id and event_id = p_event_id)) then
    raise exception 'Choice seating cannot be regenerated after rankings, matches, or feedback exist' using errcode = '55000';
  end if;

  v_participant_count := pg_catalog.jsonb_array_length(coalesce(p_participants, '[]'::jsonb));
  v_assignment_count := pg_catalog.jsonb_array_length(coalesce(p_assignments, '[]'::jsonb));
  if v_participant_count <> 42 or v_assignment_count <> 126 then
    raise exception 'Choice seating requires 42 participants and 126 assignments' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_participants) as participant_data(participant_number integer, position integer)
    where participant_data.participant_number is null or participant_data.participant_number <= 0
      or participant_data.participant_number = 9999 or participant_data.position not between 0 and 41
  ) or exists (
    select participant_number from pg_catalog.jsonb_to_recordset(p_participants) as participant_data(participant_number integer)
    group by participant_number having count(*) <> 1
  ) or exists (
    select position from pg_catalog.jsonb_to_recordset(p_participants) as participant_data(position integer)
    group by position having count(*) <> 1
  ) then
    raise exception 'Choice seating participants must be 42 unique people in unique positions 0 through 41' using errcode = '22023';
  end if;
  if (select count(*) from public.event3_participants where match_id = p_match_id and event_id = p_event_id) <> 42
     or exists (
       select 1 from public.event3_participants current_participant
       where current_participant.match_id = p_match_id and current_participant.event_id = p_event_id
         and not exists (select 1 from pg_catalog.jsonb_to_recordset(p_participants) as submitted(participant_number integer)
           where submitted.participant_number = current_participant.participant_number)
     ) then
    raise exception 'The Event3 roster changed while choice seating was generated' using errcode = '55000';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_assignments) as assignment_data(round smallint, table_number integer, participant_id integer)
    where assignment_data.round not in (1, 2, 3) or assignment_data.table_number not between 1 and 6
      or not exists (select 1 from pg_catalog.jsonb_to_recordset(p_participants) as participant_data(participant_number integer)
        where participant_data.participant_number = assignment_data.participant_id)
  ) or exists (
    select round, participant_id
    from pg_catalog.jsonb_to_recordset(p_assignments) as assignment_data(round smallint, participant_id integer)
    group by round, participant_id having count(*) <> 1
  ) or exists (
    select round, table_number
    from pg_catalog.jsonb_to_recordset(p_assignments) as assignment_data(round smallint, table_number integer)
    group by round, table_number having count(*) <> 7
  ) or exists (
    select round
    from pg_catalog.jsonb_to_recordset(p_assignments) as assignment_data(round smallint)
    group by round having count(*) <> 42
  ) then
    raise exception 'Every choice seating round must contain six complete groups of seven' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_assignments) as left_seat(round smallint, table_number integer, participant_id integer)
    join pg_catalog.jsonb_to_recordset(p_assignments) as right_seat(round smallint, table_number integer, participant_id integer)
      on right_seat.round = left_seat.round and right_seat.table_number = left_seat.table_number
      and right_seat.participant_id > left_seat.participant_id
    group by left_seat.participant_id, right_seat.participant_id
    having count(*) = 3
  ) then
    raise exception 'No pair may share a group in all three choice rounds' using errcode = '22023';
  end if;

  delete from public.session_assignments where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_participants where match_id = p_match_id and event_id = p_event_id;
  insert into public.event3_participants(match_id, event_id, participant_number, position, phase2_excluded)
    select p_match_id, p_event_id, participant_data.participant_number, participant_data.position, false
    from pg_catalog.jsonb_to_recordset(p_participants) as participant_data(participant_number integer, position integer);
  insert into public.session_assignments(match_id, event_id, round, table_number, participant_id)
    select p_match_id, p_event_id, assignment_data.round, assignment_data.table_number, assignment_data.participant_id
    from pg_catalog.jsonb_to_recordset(p_assignments) as assignment_data(round smallint, table_number integer, participant_id integer);

  return pg_catalog.jsonb_build_object('success', true, 'participants', 42, 'assignments', 126);
end;
$$;

-- Choice-only exclusions remain editable while groups/rankings are active,
-- but are frozen before Match 1 starts. Locking event_state makes that phase
-- boundary serialize with the ranking freeze used by the matcher.
create or replace function public.mutate_event3_choice_exclusion(
  p_match_id uuid,
  p_event_id integer,
  p_expected_test_mode boolean,
  p_expected_started_at text,
  p_operation text,
  p_exclusion_id bigint,
  p_participant_a integer,
  p_participant_b integer,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_changed integer := 0;
begin
  if p_operation not in ('add', 'remove') then
    raise exception 'Exclusion operation must be add or remove' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state from public.event_state state
    where state.match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Choice exclusions require the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '') is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before the exclusion was saved' using errcode = '55000';
  end if;
  if v_state.phase not in ('setup', 'round1', 'ranking1', 'round2', 'ranking2', 'round3', 'ranking3') then
    raise exception 'Choice exclusions are frozen once first-choice matching starts' using errcode = '55000';
  end if;
  if coalesce((select event_format from public.event3_event_settings
      where match_id = p_match_id and event_id = p_event_id), 'classic') <> 'choice_only_three_groups' then
    raise exception 'This exclusion mutation is only available for choice-only events' using errcode = '55000';
  end if;

  lock table public.event3_exclusions in share row exclusive mode;
  if exists (select 1 from public.event3_matches
      where match_id = p_match_id and event_id = p_event_id
        and (phase2_partner is not null or phase3_partner is not null or phase4_partner is not null)) then
    raise exception 'Choice exclusions cannot change after matching exists' using errcode = '55000';
  end if;

  if p_operation = 'add' then
    if p_participant_a is null or p_participant_b is null
       or p_participant_a <= 0 or p_participant_b <= 0
       or p_participant_a = p_participant_b then
      raise exception 'Two different participant numbers are required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.event3_participants
        where match_id = p_match_id and event_id = p_event_id and participant_number = least(p_participant_a, p_participant_b))
       or not exists (select 1 from public.event3_participants
        where match_id = p_match_id and event_id = p_event_id and participant_number = greatest(p_participant_a, p_participant_b)) then
      raise exception 'Both excluded people must be in the current Event3 roster' using errcode = '22023';
    end if;
    insert into public.event3_exclusions(
      match_id, event_id, participant_a_number, participant_b_number, reason
    ) values (
      p_match_id, p_event_id, least(p_participant_a, p_participant_b),
      greatest(p_participant_a, p_participant_b), nullif(pg_catalog.btrim(p_reason), '')
    );
    get diagnostics v_changed = row_count;
  else
    if p_exclusion_id is null then
      raise exception 'An exclusion id is required' using errcode = '22023';
    end if;
    delete from public.event3_exclusions
      where id = p_exclusion_id and match_id = p_match_id and event_id = p_event_id;
    get diagnostics v_changed = row_count;
    if v_changed = 0 then
      raise exception 'The exclusion no longer exists' using errcode = '55000';
    end if;
  end if;

  return pg_catalog.jsonb_build_object('success', true, 'operation', p_operation, 'changed', v_changed);
end;
$$;

-- Admin ranking corrections/randomization use the same state lock as choice
-- matching. This prevents a delayed write from changing ballots after the
-- matcher has frozen the final ranking phase.
create or replace function public.replace_event3_choice_admin_rankings(
  p_match_id uuid,
  p_event_id integer,
  p_expected_test_mode boolean,
  p_expected_started_at text,
  p_ranker_numbers integer[],
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_completed_rounds smallint;
  v_session_key text;
  v_saved integer := 0;
begin
  if coalesce(pg_catalog.array_length(p_ranker_numbers, 1), 0) = 0
     or pg_catalog.jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'At least one ranker and a ranking-row array are required' using errcode = '22023';
  end if;
  if (select count(distinct ranker) from pg_catalog.unnest(p_ranker_numbers) ranker)
       <> pg_catalog.array_length(p_ranker_numbers, 1) then
    raise exception 'Ranker numbers must be unique' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state from public.event_state state
    where state.match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Choice ranking changes require the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '') is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before rankings were saved' using errcode = '55000';
  end if;
  v_session_key := case when coalesce(p_expected_test_mode, false)
    then coalesce(p_expected_started_at, 'legacy-test') else 'live' end;
  v_completed_rounds := case v_state.phase
    when 'ranking1' then 1 when 'ranking2' then 2 when 'ranking3' then 3 else null end;
  if v_completed_rounds is null then
    raise exception 'Choice rankings can only be changed during an active ranking phase' using errcode = '55000';
  end if;
  if coalesce((select event_format from public.event3_event_settings
      where match_id = p_match_id and event_id = p_event_id), 'classic') <> 'choice_only_three_groups' then
    raise exception 'This ranking mutation is only available for choice-only events' using errcode = '55000';
  end if;

  lock table public.session_assignments in share mode;
  lock table public.participant_rankings in share row exclusive mode;
  lock table public.event3_ranking_drafts in share row exclusive mode;
  if exists (
    select 1 from pg_catalog.unnest(p_ranker_numbers) ranker
    where ranker is null or ranker <= 0 or not exists (
      select 1 from public.event3_participants roster
      where roster.match_id = p_match_id and roster.event_id = p_event_id
        and roster.participant_number = ranker
    )
  ) then
    raise exception 'Every ranker must be in the current Event3 roster' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as ranking_data(
      ranker_number integer, ranked_number integer, rank integer, auto_saved boolean
    )
    where ranking_data.ranker_number is null or ranking_data.ranker_number <> all(p_ranker_numbers)
      or ranking_data.ranked_number is null or ranking_data.ranked_number <= 0
      or ranking_data.ranked_number = ranking_data.ranker_number
      or ranking_data.rank is null or ranking_data.rank <= 0
      or not exists (
        select 1
        from public.session_assignments own_assignment
        join public.session_assignments target_assignment
          on target_assignment.match_id = own_assignment.match_id
         and target_assignment.event_id = own_assignment.event_id
         and target_assignment.round = own_assignment.round
         and target_assignment.table_number = own_assignment.table_number
        where own_assignment.match_id = p_match_id and own_assignment.event_id = p_event_id
          and own_assignment.round between 1 and v_completed_rounds
          and own_assignment.participant_id = ranking_data.ranker_number
          and target_assignment.participant_id = ranking_data.ranked_number
      )
  ) or exists (
    select ranker_number, ranked_number
    from pg_catalog.jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as ranking_data(ranker_number integer, ranked_number integer)
    group by ranker_number, ranked_number having count(*) <> 1
  ) or exists (
    select ranker_number
    from pg_catalog.jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as ranking_data(ranker_number integer, rank integer)
    group by ranker_number
    having min(rank) <> 1 or max(rank) <> count(*) or count(distinct rank) <> count(*)
  ) then
    raise exception 'Choice ranking rows must be a contiguous ordering of people each ranker has met' using errcode = '22023';
  end if;

  -- An organizer correction supersedes every unfinished draft for each
  -- affected ranker, including the empty-ballot case where DELETE below would
  -- otherwise fire no invalidation trigger.
  update public.event3_ranking_drafts
  set submitted = true, updated_at = pg_catalog.now()
  where match_id = p_match_id and event_id = p_event_id
    and ranker_number = any(p_ranker_numbers)
    and session_key = v_session_key and not submitted;

  delete from public.participant_rankings
    where match_id = p_match_id and event_id = p_event_id
      and ranker_number = any(p_ranker_numbers);
  insert into public.participant_rankings(
    match_id, event_id, ranker_number, ranked_number, rank, auto_saved
  )
  select p_match_id, p_event_id, ranking_data.ranker_number,
    ranking_data.ranked_number, ranking_data.rank, coalesce(ranking_data.auto_saved, false)
  from pg_catalog.jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as ranking_data(
    ranker_number integer, ranked_number integer, rank integer, auto_saved boolean
  );
  get diagnostics v_saved = row_count;

  return pg_catalog.jsonb_build_object('success', true, 'rankers', pg_catalog.array_length(p_ranker_numbers, 1), 'saved', v_saved);
end;
$$;

-- Reset one Event3 runtime atomically. Session-keyed drafts and mode-keyed
-- feedback are cleared only for the active live/test runtime, so ending test
-- mode can still restore untouched live data.
create or replace function public.reset_event3_runtime_v2(
  p_match_id uuid,
  p_event_id integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_session_key text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state from public.event_state state
    where state.match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Event3 reset requires the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '') is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before reset' using errcode = '55000';
  end if;
  v_session_key := case when coalesce(p_expected_test_mode, false)
    then coalesce(p_expected_started_at, 'legacy-test') else 'live' end;

  lock table public.event3_participants, public.event3_matches,
    public.session_assignments, public.participant_rankings,
    public.event3_ranking_drafts, public.event3_group_reflections,
    public.event3_group_member_feedback, public.event3_mood_checks,
    public.event3_notifications, public.event3_ai_welcome_messages
    in share row exclusive mode;

  delete from public.event3_participants where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_matches where match_id = p_match_id and event_id = p_event_id;
  delete from public.session_assignments where match_id = p_match_id and event_id = p_event_id;
  delete from public.participant_rankings where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_ranking_drafts
    where match_id = p_match_id and event_id = p_event_id
      and (not coalesce(p_expected_test_mode, false) or session_key = v_session_key);
  if not coalesce(p_expected_test_mode, false) then
    delete from public.event3_group_reflections where match_id = p_match_id and event_id = p_event_id;
  end if;
  delete from public.event3_group_member_feedback
    where match_id = p_match_id and event_id = p_event_id
      and is_test_mode = coalesce(p_expected_test_mode, false);
  delete from public.event3_mood_checks where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_notifications where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_ai_welcome_messages where match_id = p_match_id and event_id = p_event_id;

  update public.event_state
  set phase = 'setup', current_round = 1,
    global_timer_active = false, global_timer_start_time = null,
    global_timer_duration = null, global_timer_round = null,
    phase2_score_revealed = false, phase3_score_revealed = false
  where match_id = p_match_id;

  return pg_catalog.jsonb_build_object('success', true, 'event_id', p_event_id,
    'test_mode', coalesce(p_expected_test_mode, false));
end;
$$;

-- Participant words, one-to-one feedback, and final preference are bound to
-- the exact live/test session and reciprocal partner that was displayed.
create or replace function public.save_event3_match_interaction_v2(
  p_match_id uuid,
  p_event_id integer,
  p_participant_number integer,
  p_slot smallint,
  p_expected_partner integer,
  p_expected_test_mode boolean,
  p_expected_started_at text,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_match public.event3_matches%rowtype;
  v_event_format text;
  v_partner integer;
  v_word text;
  v_preference text;
begin
  if p_slot is null or p_slot not in (1, 2, 3)
     or p_operation is null or p_operation not in ('word', 'feedback', 'preference')
     or pg_catalog.jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid Event3 interaction request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state from public.event_state state
    where state.match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Match interaction requires the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '') is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before the match interaction was saved' using errcode = '55000';
  end if;

  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) singleton
  left join public.event3_event_settings settings
    on settings.match_id = p_match_id and settings.event_id = p_event_id;
  if p_slot = 3 and v_event_format <> 'choice_only_three_groups' then
    raise exception 'The third match slot is only available for choice-only events' using errcode = '22023';
  end if;
  if p_operation = 'preference' and (
       v_state.phase not in ('final_reveal', 'final')
       or (v_event_format = 'choice_only_three_groups' and p_slot <> 3)
       or (v_event_format <> 'choice_only_three_groups' and p_slot <> 2)
     ) then
    raise exception 'Final preference must use the active event format''s final match slot' using errcode = '55000';
  end if;
  if (p_slot = 1 and v_state.phase not in (
        'phase2_reveal', 'phase3_processing', 'phase3_reveal',
        'phase4_processing', 'phase4_reveal', 'final_reveal', 'final'
      ))
     or (p_slot = 2 and v_state.phase not in (
        'phase3_reveal', 'phase4_processing', 'phase4_reveal', 'final_reveal', 'final'
      ))
     or (p_slot = 3 and v_state.phase not in ('phase4_reveal', 'final_reveal', 'final')) then
    raise exception 'This match interaction is not open in the current phase' using errcode = '55000';
  end if;

  select current_match.* into v_match
  from public.event3_matches current_match
  where current_match.match_id = p_match_id and current_match.event_id = p_event_id
    and current_match.participant_number = p_participant_number
  for update;
  if not found then
    raise exception 'No current match row exists for this participant' using errcode = '55000';
  end if;
  v_partner := case p_slot
    when 1 then v_match.phase2_partner
    when 2 then v_match.phase3_partner
    else v_match.phase4_partner
  end;
  if v_partner is null or v_partner is distinct from p_expected_partner
     or not exists (
       select 1 from public.event3_matches reciprocal
       where reciprocal.match_id = p_match_id and reciprocal.event_id = p_event_id
         and reciprocal.participant_number = v_partner
         and (case p_slot
           when 1 then reciprocal.phase2_partner
           when 2 then reciprocal.phase3_partner
           else reciprocal.phase4_partner
         end) = p_participant_number
     ) then
    raise exception 'The displayed Event3 partner changed before this interaction was saved' using errcode = '55000';
  end if;

  if p_operation = 'word' then
    v_word := pg_catalog.btrim(coalesce(p_payload ->> 'word', ''));
    if v_word = '' or pg_catalog.char_length(v_word) > 100 or v_word ~ '[[:space:]]' then
      raise exception 'A single word of at most 100 characters is required' using errcode = '22023';
    end if;
    if p_slot = 1 then
      update public.event3_matches set phase2_word = v_word, updated_at = pg_catalog.now()
        where id = v_match.id;
    elsif p_slot = 2 then
      update public.event3_matches set phase3_word = v_word, updated_at = pg_catalog.now()
        where id = v_match.id;
    else
      update public.event3_matches set phase4_word = v_word, updated_at = pg_catalog.now()
        where id = v_match.id;
    end if;
  elsif p_operation = 'feedback' then
    if p_slot = 1 and v_match.phase2_feedback is not null then
      return pg_catalog.jsonb_build_object('success', true, 'already_saved', true, 'partner', v_partner);
    elsif p_slot = 2 and v_match.phase3_feedback is not null then
      return pg_catalog.jsonb_build_object('success', true, 'already_saved', true, 'partner', v_partner);
    elsif p_slot = 3 and v_match.phase4_feedback is not null then
      return pg_catalog.jsonb_build_object('success', true, 'already_saved', true, 'partner', v_partner);
    end if;
    if p_slot = 1 then
      update public.event3_matches set phase2_feedback = p_payload, updated_at = pg_catalog.now()
        where id = v_match.id;
    elsif p_slot = 2 then
      update public.event3_matches set phase3_feedback = p_payload, updated_at = pg_catalog.now()
        where id = v_match.id;
    else
      update public.event3_matches set phase4_feedback = p_payload, updated_at = pg_catalog.now()
        where id = v_match.id;
    end if;
  else
    v_preference := p_payload ->> 'preference';
    if v_preference is null
       or (v_event_format = 'choice_only_three_groups'
         and v_preference not in ('first', 'second', 'third', 'multiple', 'none'))
       or (v_event_format <> 'choice_only_three_groups'
         and v_preference not in ('choice', 'algorithm', 'both', 'neither')) then
      raise exception 'Invalid match preference' using errcode = '22023';
    end if;
    update public.event3_matches set match_preference = v_preference, updated_at = pg_catalog.now()
      where id = v_match.id;
  end if;

  return pg_catalog.jsonb_build_object('success', true, 'already_saved', false, 'partner', v_partner);
end;
$$;

-- Replace an entire choice-match slot and its physical tables in one
-- transaction. Compatibility metadata is optional because it never determines
-- a choice-only match; no partial partner/table state is visible if validation
-- or a write fails.
create or replace function public.replace_event3_choice_match_round(
  p_match_id uuid,
  p_event_id integer,
  p_slot smallint,
  p_expected_test_mode boolean,
  p_expected_started_at text,
  p_expected_rankings jsonb,
  p_expected_exclusions jsonb,
  p_rows jsonb,
  p_tables jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_assignment_round smallint;
  v_roster_count integer;
  v_row_count integer;
  v_table_count integer;
begin
  if p_slot is null or p_slot not in (1, 2, 3) then
    raise exception 'Choice match slot must be 1, 2, or 3' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_tables, '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_expected_rankings, '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_expected_exclusions, '[]'::jsonb)) <> 'array' then
    raise exception 'Choice match rows, tables, rankings, and exclusions must be arrays' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Choice matching requires the active current event' using errcode = '22023';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '') is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed while choice matching was calculated' using errcode = '55000';
  end if;
  if (p_slot = 1 and v_state.phase is distinct from 'phase2_processing')
     or (p_slot = 2 and v_state.phase is distinct from 'phase2_reveal')
     or (p_slot = 3 and v_state.phase is distinct from 'phase3_reveal') then
    raise exception 'The event phase changed before choice matching could be saved' using errcode = '55000';
  end if;
  if coalesce((select event_format from public.event3_event_settings
      where match_id = p_match_id and event_id = p_event_id), 'classic') <> 'choice_only_three_groups' then
    raise exception 'Choice match replacement is only available for the choice-only event format' using errcode = '22023';
  end if;

  lock table public.event3_participants, public.event3_exclusions,
    public.participant_rankings, public.event3_matches,
    public.session_assignments in share mode;

  if coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      ranking.ranker_number, ranking.ranked_number, ranking.rank
    ) order by ranking.ranker_number, ranking.rank, ranking.ranked_number)
    from public.participant_rankings ranking
    where ranking.match_id = p_match_id and ranking.event_id = p_event_id
  ), '[]'::jsonb) is distinct from coalesce(p_expected_rankings, '[]'::jsonb) then
    raise exception 'Rankings changed while choice matching was calculated' using errcode = '55000';
  end if;
  if coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(exclusion_pair.a, exclusion_pair.b)
      order by exclusion_pair.a, exclusion_pair.b)
    from (
      select least(excluded.participant_a_number, excluded.participant_b_number) as a,
        greatest(excluded.participant_a_number, excluded.participant_b_number) as b
      from public.event3_exclusions excluded
      where excluded.match_id = p_match_id and excluded.event_id = p_event_id
    ) exclusion_pair
  ), '[]'::jsonb) is distinct from coalesce(p_expected_exclusions, '[]'::jsonb) then
    raise exception 'Event exclusions changed while choice matching was calculated' using errcode = '55000';
  end if;

  select count(*) into v_roster_count from public.event3_participants
    where match_id = p_match_id and event_id = p_event_id;
  v_row_count := pg_catalog.jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_table_count := pg_catalog.jsonb_array_length(coalesce(p_tables, '[]'::jsonb));
  if v_roster_count <> 42 or v_row_count <> v_roster_count or v_table_count <> v_roster_count then
    raise exception 'Choice matching requires exactly one match row and table row for each of 42 participants' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_rows) as row_data(
      participant_number integer, partner_number integer, score integer,
      score_model_version text, score_snapshot jsonb, score_content_hash text
    )
    where row_data.participant_number is null or row_data.partner_number is null
      or row_data.participant_number = row_data.partner_number
      or (row_data.score is not null and (row_data.score < 0 or row_data.score > 100))
      or (row_data.score is null and (row_data.score_model_version is not null
        or row_data.score_snapshot is not null or row_data.score_content_hash is not null))
      or not exists (select 1 from public.event3_participants participant
        where participant.match_id = p_match_id and participant.event_id = p_event_id
          and participant.participant_number = row_data.participant_number)
      or not exists (select 1 from public.event3_participants partner
        where partner.match_id = p_match_id and partner.event_id = p_event_id
          and partner.participant_number = row_data.partner_number)
  ) or exists (
    select participant_number from pg_catalog.jsonb_to_recordset(p_rows) as row_data(participant_number integer)
    group by participant_number having count(*) <> 1
  ) or exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_rows) as row_data(participant_number integer, partner_number integer)
    where not exists (
      select 1 from pg_catalog.jsonb_to_recordset(p_rows) as reciprocal(participant_number integer, partner_number integer)
      where reciprocal.participant_number = row_data.partner_number
        and reciprocal.partner_number = row_data.participant_number
    )
  ) then
    raise exception 'Choice match rows must contain one complete reciprocal roster matching' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_rows) as row_data(participant_number integer, partner_number integer)
    where not exists (
      select 1 from public.participant_rankings ranking
      where ranking.match_id = p_match_id and ranking.event_id = p_event_id
        and ranking.ranker_number = row_data.participant_number
        and ranking.ranked_number = row_data.partner_number
    )
  ) then
    raise exception 'Every choice match must be reciprocal in the persisted rankings' using errcode = '55000';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_rows) as row_data(participant_number integer, partner_number integer)
    join public.event3_exclusions excluded
      on excluded.match_id = p_match_id and excluded.event_id = p_event_id
      and least(excluded.participant_a_number, excluded.participant_b_number)
        = least(row_data.participant_number, row_data.partner_number)
      and greatest(excluded.participant_a_number, excluded.participant_b_number)
        = greatest(row_data.participant_number, row_data.partner_number)
  ) then
    raise exception 'A choice match conflicts with a current event exclusion' using errcode = '55000';
  end if;

  if p_slot = 1 and exists (
    select 1 from public.event3_matches
    where match_id = p_match_id and event_id = p_event_id
      and (phase3_partner is not null or phase4_partner is not null)
  ) then
    raise exception 'The first choice match cannot be replaced after the second match exists' using errcode = '22023';
  end if;
  if p_slot = 2 and exists (
    select 1 from public.event3_matches
    where match_id = p_match_id and event_id = p_event_id and phase4_partner is not null
  ) then
    raise exception 'The second choice match cannot be replaced after the third match exists' using errcode = '22023';
  end if;
  if p_slot = 2 and (
    (select count(*)
     from public.event3_matches current_match
     join public.event3_participants roster
       on roster.match_id = current_match.match_id and roster.event_id = current_match.event_id
      and roster.participant_number = current_match.participant_number
     where current_match.match_id = p_match_id and current_match.event_id = p_event_id
       and current_match.phase2_partner is not null) <> 42
    or exists (
      select 1
      from public.event3_participants roster
      left join public.event3_matches current_match
        on current_match.match_id = roster.match_id and current_match.event_id = roster.event_id
       and current_match.participant_number = roster.participant_number
      where roster.match_id = p_match_id and roster.event_id = p_event_id
        and (current_match.phase2_partner is null
          or current_match.phase2_partner = roster.participant_number
          or not exists (select 1 from public.event3_participants partner
            where partner.match_id = p_match_id and partner.event_id = p_event_id
              and partner.participant_number = current_match.phase2_partner)
          or not exists (select 1 from public.event3_matches reciprocal
            where reciprocal.match_id = p_match_id and reciprocal.event_id = p_event_id
              and reciprocal.participant_number = current_match.phase2_partner
              and reciprocal.phase2_partner = roster.participant_number))
    )
  ) then
    raise exception 'The persisted first choice must be one complete reciprocal roster matching' using errcode = '55000';
  end if;
  if p_slot = 2 and exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_rows) as row_data(participant_number integer, partner_number integer)
    left join public.event3_matches current_match
      on current_match.match_id = p_match_id and current_match.event_id = p_event_id
      and current_match.participant_number = row_data.participant_number
    where current_match.phase2_partner is null
       or current_match.phase2_partner = row_data.partner_number
  ) then
    raise exception 'Every second choice must exist and differ from the first choice' using errcode = '22023';
  end if;
  if p_slot = 3 and (
    (select count(*)
     from public.event3_matches current_match
     join public.event3_participants roster
       on roster.match_id = current_match.match_id and roster.event_id = current_match.event_id
      and roster.participant_number = current_match.participant_number
     where current_match.match_id = p_match_id and current_match.event_id = p_event_id
       and current_match.phase2_partner is not null
       and current_match.phase3_partner is not null) <> 42
    or exists (
      select 1
      from public.event3_participants roster
      left join public.event3_matches current_match
        on current_match.match_id = roster.match_id and current_match.event_id = roster.event_id
       and current_match.participant_number = roster.participant_number
      where roster.match_id = p_match_id and roster.event_id = p_event_id
        and (current_match.phase2_partner is null
          or current_match.phase3_partner is null
          or current_match.phase2_partner = roster.participant_number
          or current_match.phase3_partner = roster.participant_number
          or current_match.phase2_partner = current_match.phase3_partner
          or not exists (select 1 from public.event3_participants first_partner
            where first_partner.match_id = p_match_id and first_partner.event_id = p_event_id
              and first_partner.participant_number = current_match.phase2_partner)
          or not exists (select 1 from public.event3_participants second_partner
            where second_partner.match_id = p_match_id and second_partner.event_id = p_event_id
              and second_partner.participant_number = current_match.phase3_partner)
          or not exists (select 1 from public.event3_matches first_reciprocal
            where first_reciprocal.match_id = p_match_id and first_reciprocal.event_id = p_event_id
              and first_reciprocal.participant_number = current_match.phase2_partner
              and first_reciprocal.phase2_partner = roster.participant_number)
          or not exists (select 1 from public.event3_matches second_reciprocal
            where second_reciprocal.match_id = p_match_id and second_reciprocal.event_id = p_event_id
              and second_reciprocal.participant_number = current_match.phase3_partner
              and second_reciprocal.phase3_partner = roster.participant_number))
    )
  ) then
    raise exception 'The persisted first and second choices must be complete reciprocal roster matchings' using errcode = '55000';
  end if;
  if p_slot = 3 and exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_rows) as row_data(participant_number integer, partner_number integer)
    left join public.event3_matches current_match
      on current_match.match_id = p_match_id and current_match.event_id = p_event_id
      and current_match.participant_number = row_data.participant_number
    where current_match.phase2_partner is null
       or current_match.phase3_partner is null
       or current_match.phase2_partner = row_data.partner_number
       or current_match.phase3_partner = row_data.partner_number
  ) then
    raise exception 'Every third choice must exist and differ from both earlier choices' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_tables) as table_data(participant_id integer, table_number integer)
    where table_data.participant_id is null or table_data.table_number is null or table_data.table_number <= 0
      or not exists (select 1 from public.event3_participants participant
        where participant.match_id = p_match_id and participant.event_id = p_event_id
          and participant.participant_number = table_data.participant_id)
  ) or exists (
    select participant_id from pg_catalog.jsonb_to_recordset(p_tables) as table_data(participant_id integer)
    group by participant_id having count(*) <> 1
  ) or exists (
    select table_number from pg_catalog.jsonb_to_recordset(p_tables) as table_data(table_number integer)
    group by table_number having count(*) <> 2
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_rows) as row_data(participant_number integer, partner_number integer)
    join pg_catalog.jsonb_to_recordset(p_tables) as own_table(participant_id integer, table_number integer)
      on own_table.participant_id = row_data.participant_number
    left join pg_catalog.jsonb_to_recordset(p_tables) as partner_table(participant_id integer, table_number integer)
      on partner_table.participant_id = row_data.partner_number
    where partner_table.participant_id is null or own_table.table_number <> partner_table.table_number
  ) then
    raise exception 'Choice match table rows must seat each reciprocal pair together exactly once' using errcode = '22023';
  end if;

  if p_slot = 1 then
    insert into public.event3_matches (
      match_id, event_id, participant_number, phase2_partner, phase2_score,
      phase2_score_model_version, phase2_score_snapshot, phase2_score_content_hash
    )
    select p_match_id, p_event_id, row_data.participant_number, row_data.partner_number,
      row_data.score, row_data.score_model_version, row_data.score_snapshot, row_data.score_content_hash
    from pg_catalog.jsonb_to_recordset(p_rows) as row_data(
      participant_number integer, partner_number integer, score integer,
      score_model_version text, score_snapshot jsonb, score_content_hash text
    )
    on conflict (match_id, event_id, participant_number) do update set
      phase2_word = case when event3_matches.phase2_partner is not distinct from excluded.phase2_partner then event3_matches.phase2_word else null end,
      phase2_feedback = case when event3_matches.phase2_partner is not distinct from excluded.phase2_partner then event3_matches.phase2_feedback else null end,
      match_preference = case when event3_matches.phase2_partner is not distinct from excluded.phase2_partner then event3_matches.match_preference else null end,
      phase2_partner = excluded.phase2_partner,
      phase2_score = excluded.phase2_score,
      phase2_score_model_version = excluded.phase2_score_model_version,
      phase2_score_snapshot = excluded.phase2_score_snapshot,
      phase2_score_content_hash = excluded.phase2_score_content_hash,
      updated_at = pg_catalog.now();
    v_assignment_round := 20;
  elsif p_slot = 2 then
    insert into public.event3_matches (
      match_id, event_id, participant_number, phase3_partner, phase3_score,
      phase3_score_model_version, phase3_score_snapshot, phase3_score_content_hash
    )
    select p_match_id, p_event_id, row_data.participant_number, row_data.partner_number,
      row_data.score, row_data.score_model_version, row_data.score_snapshot, row_data.score_content_hash
    from pg_catalog.jsonb_to_recordset(p_rows) as row_data(
      participant_number integer, partner_number integer, score integer,
      score_model_version text, score_snapshot jsonb, score_content_hash text
    )
    on conflict (match_id, event_id, participant_number) do update set
      phase3_word = case when event3_matches.phase3_partner is not distinct from excluded.phase3_partner then event3_matches.phase3_word else null end,
      phase3_feedback = case when event3_matches.phase3_partner is not distinct from excluded.phase3_partner then event3_matches.phase3_feedback else null end,
      match_preference = case when event3_matches.phase3_partner is not distinct from excluded.phase3_partner then event3_matches.match_preference else null end,
      phase3_partner = excluded.phase3_partner,
      phase3_score = excluded.phase3_score,
      phase3_score_model_version = excluded.phase3_score_model_version,
      phase3_score_snapshot = excluded.phase3_score_snapshot,
      phase3_score_content_hash = excluded.phase3_score_content_hash,
      updated_at = pg_catalog.now();
    v_assignment_round := 30;
  else
    insert into public.event3_matches (
      match_id, event_id, participant_number, phase4_partner, phase4_score,
      phase4_score_model_version, phase4_score_snapshot, phase4_score_content_hash
    )
    select p_match_id, p_event_id, row_data.participant_number, row_data.partner_number,
      row_data.score, row_data.score_model_version, row_data.score_snapshot, row_data.score_content_hash
    from pg_catalog.jsonb_to_recordset(p_rows) as row_data(
      participant_number integer, partner_number integer, score integer,
      score_model_version text, score_snapshot jsonb, score_content_hash text
    )
    on conflict (match_id, event_id, participant_number) do update set
      phase4_word = case when event3_matches.phase4_partner is not distinct from excluded.phase4_partner then event3_matches.phase4_word else null end,
      phase4_feedback = case when event3_matches.phase4_partner is not distinct from excluded.phase4_partner then event3_matches.phase4_feedback else null end,
      match_preference = case when event3_matches.phase4_partner is not distinct from excluded.phase4_partner then event3_matches.match_preference else null end,
      phase4_partner = excluded.phase4_partner,
      phase4_score = excluded.phase4_score,
      phase4_score_model_version = excluded.phase4_score_model_version,
      phase4_score_snapshot = excluded.phase4_score_snapshot,
      phase4_score_content_hash = excluded.phase4_score_content_hash,
      updated_at = pg_catalog.now();
    v_assignment_round := 40;
  end if;

  delete from public.session_assignments
    where match_id = p_match_id and event_id = p_event_id and round = v_assignment_round;
  insert into public.session_assignments(match_id, event_id, round, table_number, participant_id)
    select p_match_id, p_event_id, v_assignment_round, table_data.table_number, table_data.participant_id
    from pg_catalog.jsonb_to_recordset(p_tables) as table_data(participant_id integer, table_number integer);

  return pg_catalog.jsonb_build_object(
    'success', true, 'slot', p_slot, 'pairs', v_row_count / 2, 'assignment_round', v_assignment_round
  );
end;
$$;

revoke all on function public.set_event3_event_format(uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.replace_event3_choice_roster(uuid, uuid, integer, boolean, text, integer[])
  from public, anon, authenticated;
revoke all on function public.replace_event3_choice_seating(uuid, integer, boolean, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.mutate_event3_choice_exclusion(uuid, integer, boolean, text, text, bigint, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.replace_event3_choice_admin_rankings(uuid, integer, boolean, text, integer[], jsonb)
  from public, anon, authenticated;
revoke all on function public.reset_event3_runtime_v2(uuid, integer, boolean, text)
  from public, anon, authenticated;
revoke all on function public.save_event3_match_interaction_v2(uuid, integer, integer, smallint, integer, boolean, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.replace_event3_choice_match_round(uuid, integer, smallint, boolean, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_event3_event_format(uuid, integer, text)
  to service_role;
grant execute on function public.replace_event3_choice_roster(uuid, uuid, integer, boolean, text, integer[])
  to service_role;
grant execute on function public.replace_event3_choice_seating(uuid, integer, boolean, text, jsonb, jsonb)
  to service_role;
grant execute on function public.mutate_event3_choice_exclusion(uuid, integer, boolean, text, text, bigint, integer, integer, text)
  to service_role;
grant execute on function public.replace_event3_choice_admin_rankings(uuid, integer, boolean, text, integer[], jsonb)
  to service_role;
grant execute on function public.reset_event3_runtime_v2(uuid, integer, boolean, text)
  to service_role;
grant execute on function public.save_event3_match_interaction_v2(uuid, integer, integer, smallint, integer, boolean, text, text, jsonb)
  to service_role;
grant execute on function public.replace_event3_choice_match_round(uuid, integer, smallint, boolean, text, jsonb, jsonb, jsonb, jsonb)
  to service_role;
