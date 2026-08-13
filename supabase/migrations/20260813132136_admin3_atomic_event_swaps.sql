-- Atomic operational swaps for admin3. These functions are called only by the
-- authenticated server with the service role; browsers never receive direct
-- write access to the underlying event tables.

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
       where requested.round_number not in (1, 2, 20, 30)
     ) then
    raise exception 'Rounds must contain only 1, 2, 20, or 30';
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

  foreach v_round in array array[1, 2]::smallint[]
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

create or replace function public.replace_event3_participant(
  p_event3_match_id uuid,
  p_static_match_id uuid,
  p_event_id integer,
  p_old_participant integer,
  p_new_participant integer,
  p_event_scores jsonb default '[]'::jsonb,
  p_match_result_scores jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_swap_both boolean := false;
  v_old_id uuid;
  v_new_id uuid;
  v_old_token text;
  v_new_token text;
  v_old_name text;
  v_new_name text;
  v_item jsonb;
  v_phase text;
  v_a integer;
  v_b integer;
  v_score integer;
  v_result_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_round smallint;
  v_old_table integer;
  v_new_table integer;
  v_old_position integer;
  v_new_position integer;
  v_temp_position integer;
  v_old_phase2_excluded boolean;
  v_new_phase2_excluded boolean;
begin
  if p_event3_match_id is null or p_static_match_id is null
     or p_event_id is null or p_event_id <= 0 then
    raise exception 'A valid match and event are required';
  end if;
  if p_old_participant is null or p_new_participant is null
     or p_old_participant <= 0 or p_new_participant <= 0
     or p_old_participant = 9999 or p_new_participant = 9999
     or p_old_participant = p_new_participant then
    raise exception 'Two different participant numbers are required';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_event_scores, '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_match_result_scores, '[]'::jsonb)) <> 'array' then
    raise exception 'Score payloads must be JSON arrays';
  end if;

  select id, secure_token, name
    into v_old_id, v_old_token, v_old_name
  from public.participants
  where match_id = p_static_match_id and assigned_number = p_old_participant;
  if not found then raise exception 'The participant being replaced does not exist'; end if;

  select id, secure_token, name
    into v_new_id, v_new_token, v_new_name
  from public.participants
  where match_id = p_static_match_id and assigned_number = p_new_participant;
  if not found then raise exception 'The replacement participant does not exist'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event3_match_id::text || ':' || p_event_id::text || ':participant-swap', 0)
  );

  if not exists (
    select 1 from public.event3_participants
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_number = p_old_participant
  ) then
    raise exception 'The participant being replaced is not selected for this event';
  end if;

  select exists (
    select 1 from public.event3_participants
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_number = p_new_participant
  ) into v_swap_both;

  -- A replacement who is not selected must not have dangling seating/match rows.
  -- Stopping here is safer than silently creating two owners for one slot.
  if not v_swap_both and (
    exists (
      select 1 from public.session_assignments
      where match_id = p_event3_match_id and event_id = p_event_id
        and participant_id = p_new_participant
    )
    or exists (
      select 1 from public.event3_matches
      where match_id = p_event3_match_id and event_id = p_event_id
        and participant_number = p_new_participant
    )
  ) then
    raise exception 'The replacement has event runtime data but is not selected; refresh the event selection first';
  end if;

  -- Keep every foreign-key value valid throughout the transaction. When both
  -- people are selected, exchange their slot positions instead of temporarily
  -- writing an invalid participant number.
  if v_swap_both then
    select position, phase2_excluded into v_old_position, v_old_phase2_excluded
    from public.event3_participants
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_number = p_old_participant;
    select position, phase2_excluded into v_new_position, v_new_phase2_excluded
    from public.event3_participants
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_number = p_new_participant;
    select coalesce(pg_catalog.max(position), 0) + 1 into v_temp_position
    from public.event3_participants
    where match_id = p_event3_match_id and event_id = p_event_id;

    update public.event3_participants
    set position = v_temp_position, phase2_excluded = v_new_phase2_excluded
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_number = p_old_participant;
    update public.event3_participants
    set position = v_old_position, phase2_excluded = v_old_phase2_excluded
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_number = p_new_participant;
    update public.event3_participants
    set position = v_new_position
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_number = p_old_participant;
  else
    update public.event3_participants
    set participant_number = p_new_participant
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_number = p_old_participant;
  end if;

  -- The operational use case is an absent attendee being replaced by someone
  -- who is physically present. Make that live status explicit instead of
  -- transferring a stale absent flag to the replacement.
  insert into public.event_attendance (
    match_id, event_id, participant_number, attended, updated_at, updated_by
  ) values
    (p_static_match_id, p_event_id, p_old_participant, false, pg_catalog.now(), 'admin3 participant replacement'),
    (p_static_match_id, p_event_id, p_new_participant, true, pg_catalog.now(), 'admin3 participant replacement')
  on conflict (match_id, event_id, participant_number)
  do update set
    attended = excluded.attended,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  -- Every generated table, including already-generated one-to-one phases. If
  -- both have a row, exchange table numbers; if only one has a row, transfer it.
  for v_round in
    select distinct round
    from public.session_assignments
    where match_id = p_event3_match_id and event_id = p_event_id
      and participant_id in (p_old_participant, p_new_participant)
  loop
    select table_number into v_old_table
    from public.session_assignments
    where match_id = p_event3_match_id and event_id = p_event_id
      and round = v_round and participant_id = p_old_participant
    limit 1;
    select table_number into v_new_table
    from public.session_assignments
    where match_id = p_event3_match_id and event_id = p_event_id
      and round = v_round and participant_id = p_new_participant
    limit 1;

    if v_old_table is not null and v_new_table is not null then
      update public.session_assignments
      set table_number = case participant_id
        when p_old_participant then v_new_table
        when p_new_participant then v_old_table end
      where match_id = p_event3_match_id and event_id = p_event_id
        and round = v_round
        and participant_id in (p_old_participant, p_new_participant);
    elsif v_old_table is not null then
      update public.session_assignments
      set participant_id = p_new_participant
      where match_id = p_event3_match_id and event_id = p_event_id
        and round = v_round and participant_id = p_old_participant;
    elsif v_new_table is not null then
      update public.session_assignments
      set participant_id = p_old_participant
      where match_id = p_event3_match_id and event_id = p_event_id
        and round = v_round and participant_id = p_new_participant;
    end if;
    v_old_table := null;
    v_new_table := null;
  end loop;

  -- Match rows carry phase feedback and words, so moving the complete row makes
  -- those admin/participant views resolve through the replacement immediately.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.id::text), '[]'::jsonb)
  into v_rows
  from public.event3_matches m
  where match_id = p_event3_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  delete from public.event3_matches
  where match_id = p_event3_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  insert into public.event3_matches
  select restored.*
  from pg_catalog.jsonb_array_elements(v_rows) item
  cross join lateral pg_catalog.jsonb_populate_record(
    null::public.event3_matches,
    item || pg_catalog.jsonb_build_object(
      'participant_number', case
        when (item ->> 'participant_number')::integer = p_old_participant then p_new_participant
        when v_swap_both and (item ->> 'participant_number')::integer = p_new_participant then p_old_participant
        else (item ->> 'participant_number')::integer end
    )
  ) restored;

  update public.event3_matches
  set phase2_partner = case
        when phase2_partner = p_old_participant then p_new_participant
        when v_swap_both and phase2_partner = p_new_participant then p_old_participant
        else phase2_partner end,
      phase3_partner = case
        when phase3_partner = p_old_participant then p_new_participant
        when v_swap_both and phase3_partner = p_new_participant then p_old_participant
        else phase3_partner end
  where match_id = p_event3_match_id and event_id = p_event_id
    and (
      phase2_partner in (p_old_participant, p_new_participant)
      or phase3_partner in (p_old_participant, p_new_participant)
    );

  -- Delete/reinsert affected unique-key rows inside this transaction. This
  -- avoids both transient uniqueness conflicts and invalid foreign-key values.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.id::text), '[]'::jsonb)
  into v_rows
  from public.participant_rankings r
  where match_id = p_event3_match_id and event_id = p_event_id
    and (
      ranker_number in (p_old_participant, p_new_participant)
      or ranked_number in (p_old_participant, p_new_participant)
    );
  delete from public.participant_rankings
  where match_id = p_event3_match_id and event_id = p_event_id
    and (
      ranker_number in (p_old_participant, p_new_participant)
      or ranked_number in (p_old_participant, p_new_participant)
    );
  insert into public.participant_rankings
  select restored.*
  from pg_catalog.jsonb_array_elements(v_rows) item
  cross join lateral pg_catalog.jsonb_populate_record(
    null::public.participant_rankings,
    item || pg_catalog.jsonb_build_object(
      'ranker_number', case (item ->> 'ranker_number')::integer
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else (item ->> 'ranker_number')::integer end,
      'ranked_number', case (item ->> 'ranked_number')::integer
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else (item ->> 'ranked_number')::integer end
    )
  ) restored;

  update public.event3_participant_notes
  set participant_number = case participant_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else participant_number end,
      about_number = case about_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else about_number end
  where match_id = p_event3_match_id and event_id = p_event_id
    and (
      participant_number in (p_old_participant, p_new_participant)
      or about_number in (p_old_participant, p_new_participant)
    );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.id::text), '[]'::jsonb)
  into v_rows
  from public.event3_mood_checks r
  where match_id = p_event3_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  delete from public.event3_mood_checks
  where match_id = p_event3_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  insert into public.event3_mood_checks
  select restored.*
  from pg_catalog.jsonb_array_elements(v_rows) item
  cross join lateral pg_catalog.jsonb_populate_record(
    null::public.event3_mood_checks,
    item || pg_catalog.jsonb_build_object(
      'participant_number', case (item ->> 'participant_number')::integer
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant end
    )
  ) restored;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.id::text), '[]'::jsonb)
  into v_rows
  from public.event3_notifications r
  where match_id = p_event3_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  delete from public.event3_notifications
  where match_id = p_event3_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  insert into public.event3_notifications
  select restored.*
  from pg_catalog.jsonb_array_elements(v_rows) item
  cross join lateral pg_catalog.jsonb_populate_record(
    null::public.event3_notifications,
    item || pg_catalog.jsonb_build_object(
      'participant_number', case (item ->> 'participant_number')::integer
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant end
    )
  ) restored;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.id::text), '[]'::jsonb)
  into v_rows
  from public.event3_ai_welcome_messages r
  where match_id = p_event3_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  delete from public.event3_ai_welcome_messages
  where match_id = p_event3_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  insert into public.event3_ai_welcome_messages
  select restored.*
  from pg_catalog.jsonb_array_elements(v_rows) item
  cross join lateral pg_catalog.jsonb_populate_record(
    null::public.event3_ai_welcome_messages,
    item || pg_catalog.jsonb_build_object(
      'participant_number', case (item ->> 'participant_number')::integer
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant end
    )
  ) restored;

  -- Open organizer conversations follow the participant slot, including the
  -- secure token and display name used for subsequent replies.
  update public.organizer_requests
  set participant_number = case participant_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else participant_number end,
      participant_token = case participant_number
        when p_old_participant then coalesce(v_new_token, participant_token)
        when p_new_participant then coalesce(v_old_token, participant_token)
        else participant_token end,
      participant_name = case participant_number
        when p_old_participant then coalesce(v_new_name, participant_name)
        when p_new_participant then coalesce(v_old_name, participant_name)
        else participant_name end
  where event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);

  -- The normal admin results and their locked pairs must agree with event3.
  update public.match_results
  set participant_a_number = case participant_a_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else participant_a_number end,
      participant_b_number = case participant_b_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else participant_b_number end,
      participant_c_number = case participant_c_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else participant_c_number end,
      participant_d_number = case participant_d_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else participant_d_number end,
      participant_e_number = case participant_e_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else participant_e_number end,
      participant_f_number = case participant_f_number
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else participant_f_number end,
      participant_a_id = case participant_a_number
        when p_old_participant then v_new_id
        when p_new_participant then v_old_id
        else participant_a_id end,
      participant_b_id = case participant_b_number
        when p_old_participant then v_new_id
        when p_new_participant then v_old_id
        else participant_b_id end
  where match_id = p_static_match_id and event_id = p_event_id
    and (
      participant_a_number in (p_old_participant, p_new_participant)
      or participant_b_number in (p_old_participant, p_new_participant)
      or participant_c_number in (p_old_participant, p_new_participant)
      or participant_d_number in (p_old_participant, p_new_participant)
      or participant_e_number in (p_old_participant, p_new_participant)
      or participant_f_number in (p_old_participant, p_new_participant)
    );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.id::text), '[]'::jsonb)
  into v_rows
  from public.match_feedback r
  where match_id = p_static_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  delete from public.match_feedback
  where match_id = p_static_match_id and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);
  insert into public.match_feedback
  select restored.*
  from pg_catalog.jsonb_array_elements(v_rows) item
  cross join lateral pg_catalog.jsonb_populate_record(
    null::public.match_feedback,
    item || pg_catalog.jsonb_build_object(
      'participant_number', case (item ->> 'participant_number')::integer
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant end,
      'participant_token', case (item ->> 'participant_number')::integer
        when p_old_participant then coalesce(v_new_token, item ->> 'participant_token')
        when p_new_participant then coalesce(v_old_token, item ->> 'participant_token') end
    )
  ) restored;

  -- Locked admin results are event-scoped. Historical event locks retain the
  -- identities that actually attended those events.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.id::text), '[]'::jsonb)
  into v_rows
  from public.locked_matches r
  where match_id = p_static_match_id and event_id = p_event_id
    and (
      participant1_number in (p_old_participant, p_new_participant)
      or participant2_number in (p_old_participant, p_new_participant)
    );
  delete from public.locked_matches
  where match_id = p_static_match_id and event_id = p_event_id
    and (
      participant1_number in (p_old_participant, p_new_participant)
      or participant2_number in (p_old_participant, p_new_participant)
    );
  insert into public.locked_matches
  select restored.*
  from pg_catalog.jsonb_array_elements(v_rows) item
  cross join lateral pg_catalog.jsonb_populate_record(
    null::public.locked_matches,
    item || pg_catalog.jsonb_build_object(
      'participant1_number', case (item ->> 'participant1_number')::integer
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else (item ->> 'participant1_number')::integer end,
      'participant2_number', case (item ->> 'participant2_number')::integer
        when p_old_participant then p_new_participant
        when p_new_participant then p_old_participant
        else (item ->> 'participant2_number')::integer end
    )
  ) restored;

  -- Apply scores calculated by the server before entering this transaction.
  for v_item in select value
    from pg_catalog.jsonb_array_elements(coalesce(p_event_scores, '[]'::jsonb))
  loop
    v_phase := v_item ->> 'phase';
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;
    v_score := (v_item ->> 'score')::integer;
    if v_phase = 'phase2' then
      update public.event3_matches
      set phase2_score = v_score
      where match_id = p_event3_match_id and event_id = p_event_id
        and (
          (participant_number = v_a and phase2_partner = v_b)
          or (participant_number = v_b and phase2_partner = v_a)
        );
    elsif v_phase = 'phase3' then
      update public.event3_matches
      set phase3_score = v_score
      where match_id = p_event3_match_id and event_id = p_event_id
        and (
          (participant_number = v_a and phase3_partner = v_b)
          or (participant_number = v_b and phase3_partner = v_a)
        );
    else
      raise exception 'Invalid event score phase';
    end if;
  end loop;

  for v_item in select value
    from pg_catalog.jsonb_array_elements(coalesce(p_match_result_scores, '[]'::jsonb))
  loop
    v_result_id := (v_item ->> 'id')::uuid;
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;
    update public.match_results
    set compatibility_score = coalesce((v_item ->> 'compatibility_score')::integer, compatibility_score),
        reason = coalesce(v_item ->> 'reason', reason),
        mbti_compatibility_score = coalesce((v_item ->> 'mbti_compatibility_score')::numeric, mbti_compatibility_score),
        attachment_compatibility_score = coalesce((v_item ->> 'attachment_compatibility_score')::numeric, attachment_compatibility_score),
        communication_compatibility_score = coalesce((v_item ->> 'communication_compatibility_score')::numeric, communication_compatibility_score),
        lifestyle_compatibility_score = coalesce((v_item ->> 'lifestyle_compatibility_score')::numeric, lifestyle_compatibility_score),
        core_values_compatibility_score = coalesce((v_item ->> 'core_values_compatibility_score')::numeric, core_values_compatibility_score),
        vibe_compatibility_score = coalesce((v_item ->> 'vibe_compatibility_score')::numeric, vibe_compatibility_score),
        synergy_score = coalesce((v_item ->> 'synergy_score')::numeric, synergy_score),
        humor_open_score = coalesce((v_item ->> 'humor_open_score')::numeric, humor_open_score),
        intent_score = coalesce((v_item ->> 'intent_score')::numeric, intent_score),
        humor_multiplier = coalesce((v_item ->> 'humor_multiplier')::numeric, humor_multiplier),
        attachment_penalty_applied = coalesce((v_item ->> 'attachment_penalty_applied')::boolean, attachment_penalty_applied),
        intent_boost_applied = coalesce((v_item ->> 'intent_boost_applied')::boolean, intent_boost_applied),
        dead_air_veto_applied = coalesce((v_item ->> 'dead_air_veto_applied')::boolean, dead_air_veto_applied),
        humor_clash_veto_applied = coalesce((v_item ->> 'humor_clash_veto_applied')::boolean, humor_clash_veto_applied),
        cap_applied = nullif(v_item ->> 'cap_applied', '')::numeric,
        humor_early_openness_bonus = coalesce(v_item ->> 'humor_early_openness_bonus', humor_early_openness_bonus)
    where id = v_result_id and match_id = p_static_match_id and event_id = p_event_id
      and participant_a_number = v_a and participant_b_number = v_b;

    update public.locked_matches
    set original_compatibility_score = (v_item ->> 'compatibility_score')::numeric
    where match_id = p_static_match_id and event_id = p_event_id
      and (
        (participant1_number = v_a and participant2_number = v_b)
        or (participant1_number = v_b and participant2_number = v_a)
      );
  end loop;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'swapped_existing_participant', v_swap_both,
    'old_participant', p_old_participant,
    'new_participant', p_new_participant
  );
end;
$$;

revoke all on function public.swap_event3_table_numbers(uuid, integer, smallint[], integer, integer)
  from public, anon, authenticated;
revoke all on function public.swap_event3_group_seats(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.replace_event3_participant(uuid, uuid, integer, integer, integer, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.swap_event3_table_numbers(uuid, integer, smallint[], integer, integer)
  to service_role;
grant execute on function public.swap_event3_group_seats(uuid, integer, integer, integer)
  to service_role;
grant execute on function public.replace_event3_participant(uuid, uuid, integer, integer, integer, jsonb, jsonb)
  to service_role;
