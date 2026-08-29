begin;

-- Apply a live Event3 algorithm replacement as one transaction. The mature
-- swap function owns pair topology, score provenance, and round-30 seating;
-- this wrapper removes the superseded Phase 3 responses and makes the new
-- live topology the only locked topology retained for the event.
create or replace function public.replace_event3_algorithm_match_partner(
  p_event3_match_id uuid,
  p_static_match_id uuid,
  p_event_id integer,
  p_missing_participant integer,
  p_replacement_participant integer,
  p_expected_missing_partner integer,
  p_expected_replacement_partner integer,
  p_first_score jsonb,
  p_second_score jsonb default null,
  p_sync_locked_matches boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_result jsonb;
  v_affected integer[];
  v_match_round integer := 2;
begin
  v_result := public.swap_event3_match_partner(
    p_event3_match_id,
    p_event_id,
    'phase3',
    p_missing_participant,
    p_replacement_participant,
    p_expected_missing_partner,
    p_expected_replacement_partner,
    p_first_score,
    p_second_score
  );

  v_affected := pg_catalog.array_remove(array[
    p_missing_participant,
    p_replacement_participant,
    p_expected_missing_partner,
    p_expected_replacement_partner
  ], null);

  update public.event3_matches
  set phase3_word = null,
      phase3_feedback = null,
      match_preference = null
  where match_id = p_event3_match_id
    and event_id = p_event_id
    and participant_number = any(v_affected);

  if coalesce(p_sync_locked_matches, true) then
    select coalesce(min(original_match_round), 2)
    into v_match_round
    from public.locked_matches
    where match_id = p_static_match_id
      and event_id = p_event_id
      and (
        participant1_number = any(v_affected)
        or participant2_number = any(v_affected)
      );

    delete from public.locked_matches
    where match_id = p_static_match_id
      and event_id = p_event_id
      and (
        participant1_number = any(v_affected)
        or participant2_number = any(v_affected)
      );

    insert into public.locked_matches (
      match_id,
      event_id,
      participant1_number,
      participant2_number,
      created_by,
      reason,
      original_compatibility_score,
      original_match_round
    ) values (
      p_static_match_id,
      p_event_id,
      least(p_replacement_participant, p_expected_missing_partner),
      greatest(p_replacement_participant, p_expected_missing_partner),
      'admin',
      coalesce(nullif(p_first_score ->> 'reason', ''), 'Algorithm match'),
      (p_first_score ->> 'score')::numeric,
      v_match_round
    );

    if p_expected_replacement_partner is not null then
      insert into public.locked_matches (
        match_id,
        event_id,
        participant1_number,
        participant2_number,
        created_by,
        reason,
        original_compatibility_score,
        original_match_round
      ) values (
        p_static_match_id,
        p_event_id,
        least(p_missing_participant, p_expected_replacement_partner),
        greatest(p_missing_participant, p_expected_replacement_partner),
        'admin',
        coalesce(nullif(p_second_score ->> 'reason', ''), 'Algorithm match'),
        (p_second_score ->> 'score')::numeric,
        v_match_round
      );
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.replace_event3_algorithm_match_partner(
  uuid, uuid, integer, integer, integer, integer, integer, jsonb, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.replace_event3_algorithm_match_partner(
  uuid, uuid, integer, integer, integer, integer, integer, jsonb, jsonb, boolean
) to service_role;

commit;
