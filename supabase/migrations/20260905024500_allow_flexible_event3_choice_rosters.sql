-- Event3 choice-only editions may run with any even roster from 16 through 42.
-- The existing 42-person solver remains unchanged; smaller rosters use
-- balanced tables of at most seven participants.

alter table public.event3_choice_seating_reports
  drop constraint if exists event3_choice_seating_reports_assignments_check;

alter table public.event3_choice_seating_reports
  add constraint event3_choice_seating_reports_assignments_check check (
    pg_catalog.jsonb_typeof(assignments) = 'array'
    and pg_catalog.jsonb_array_length(assignments) between 48 and 126
    and pg_catalog.mod(pg_catalog.jsonb_array_length(assignments), 6) = 0
  );

-- These functions already contain the event/session locks, compare-and-swap
-- checks, and service-role boundary. Rebuild their known prior definitions
-- with only the fixed roster-size invariants generalized. Running migrations
-- from scratch is deterministic because the source definitions are installed
-- by the immediately preceding Event3 migrations.
do $migration$
declare
  v_definition text;
  v_original text;
begin
  v_definition := pg_catalog.pg_get_functiondef(
    'public.replace_event3_choice_roster(uuid,uuid,integer,boolean,text,integer[])'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'if v_count <> 42',
    'if v_count < 16 or v_count > 42 or pg_catalog.mod(v_count, 2) <> 0');
  v_definition := pg_catalog.replace(v_definition,
    'from pg_catalog.unnest(p_participant_numbers) selected(participant_number)) <> 42 then',
    'from pg_catalog.unnest(p_participant_numbers) selected(participant_number)) <> v_count then');
  v_definition := pg_catalog.replace(v_definition,
    'The choice-only roster requires 42 unique participant numbers',
    'The choice-only roster requires an even set of 16 to 42 unique participant numbers');
  v_definition := pg_catalog.replace(v_definition,
    'The 42-person roster is only available for the choice-only event format',
    'This roster is only available for the choice-only event format');
  v_definition := pg_catalog.replace(v_definition,
    'and participant.assigned_number = any(p_participant_numbers)) <> 42 then',
    'and participant.assigned_number = any(p_participant_numbers)) <> v_count then');
  v_definition := pg_catalog.replace(v_definition,
    $replace$pg_catalog.jsonb_build_object('success', true, 'selected_count', 42)$replace$,
    $replace$pg_catalog.jsonb_build_object('success', true, 'selected_count', v_count)$replace$);
  if v_definition = v_original or pg_catalog.strpos(v_definition, 'v_count <> 42') > 0 then
    raise exception 'Could not generalize replace_event3_choice_roster';
  end if;
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.replace_event3_choice_seating(uuid,integer,boolean,text,jsonb,jsonb)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'if v_participant_count <> 42 or v_assignment_count <> 126 then',
    'if v_participant_count < 16 or v_participant_count > 42 or pg_catalog.mod(v_participant_count, 2) <> 0 or v_assignment_count <> v_participant_count * 3 then');
  v_definition := pg_catalog.replace(v_definition,
    'Choice seating requires 42 participants and 126 assignments',
    'Choice seating requires an even roster of 16 to 42 and three assignments per participant');
  v_definition := pg_catalog.replace(v_definition,
    'or participant_data.participant_number = 9999 or participant_data.position not between 0 and 41',
    'or participant_data.participant_number = 9999 or participant_data.position < 0 or participant_data.position >= v_participant_count');
  v_definition := pg_catalog.replace(v_definition,
    'Choice seating participants must be 42 unique people in unique positions 0 through 41',
    'Choice seating participants must be unique people in contiguous roster positions');
  v_definition := pg_catalog.replace(v_definition,
    'where match_id = p_match_id and event_id = p_event_id) <> 42',
    'where match_id = p_match_id and event_id = p_event_id) <> v_participant_count');
  v_definition := pg_catalog.replace(v_definition,
    'group by round, table_number having count(*) <> 7',
    'group by round, table_number having count(*) > 7');
  v_definition := pg_catalog.replace(v_definition,
    'group by round having count(*) <> 42',
    'group by round having count(*) <> v_participant_count');
  v_definition := pg_catalog.replace(v_definition,
    'Every choice seating round must contain six complete groups of seven',
    'Every choice seating round must contain the complete roster in groups of at most seven');
  v_definition := pg_catalog.replace(v_definition,
    $replace$pg_catalog.jsonb_build_object('success', true, 'participants', 42, 'assignments', 126)$replace$,
    $replace$pg_catalog.jsonb_build_object('success', true, 'participants', v_participant_count, 'assignments', v_assignment_count)$replace$);
  if v_definition = v_original
     or pg_catalog.strpos(v_definition, 'v_participant_count <> 42') > 0
     or pg_catalog.strpos(v_definition, 'v_assignment_count <> 126') > 0
     or pg_catalog.strpos(v_definition, 'having count(*) <> 7') > 0 then
    raise exception 'Could not generalize replace_event3_choice_seating';
  end if;
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.replace_event3_choice_match_round(uuid,integer,smallint,boolean,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'if v_roster_count <> 42 or v_row_count <> v_roster_count or v_table_count <> v_roster_count then',
    'if v_roster_count < 16 or v_roster_count > 42 or pg_catalog.mod(v_roster_count, 2) <> 0 or v_row_count <> v_roster_count or v_table_count <> v_roster_count then');
  v_definition := pg_catalog.replace(v_definition,
    'Choice matching requires exactly one match row and table row for each of 42 participants',
    'Choice matching requires one match row and table row for every selected participant');
  v_definition := pg_catalog.replace(v_definition,
    'and current_match.phase2_partner is not null) <> 42',
    'and current_match.phase2_partner is not null) <> v_roster_count');
  v_definition := pg_catalog.replace(v_definition,
    'and current_match.phase3_partner is not null) <> 42',
    'and current_match.phase3_partner is not null) <> v_roster_count');
  if v_definition = v_original
     or pg_catalog.strpos(v_definition, 'v_roster_count <> 42') > 0
     or pg_catalog.strpos(v_definition, 'phase2_partner is not null) <> 42') > 0
     or pg_catalog.strpos(v_definition, 'phase3_partner is not null) <> 42') > 0 then
    raise exception 'Could not generalize replace_event3_choice_match_round';
  end if;
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.apply_event3_choice_seating_preview(uuid,uuid,integer,boolean,text,jsonb,jsonb,jsonb,jsonb,jsonb,bigint,jsonb,text,text,smallint,text,jsonb)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    '  v_session_key text;',
    '  v_session_key text;' || pg_catalog.chr(10) || '  v_participant_count integer;');
  v_definition := pg_catalog.replace(v_definition,
    $$if pg_catalog.jsonb_typeof(p_participants) is distinct from 'array'
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
  end if;$$,
    $$if pg_catalog.jsonb_typeof(p_participants) is distinct from 'array' then
    raise exception 'Choice seating approval roster must be an array' using errcode = '22023';
  end if;
  v_participant_count := pg_catalog.jsonb_array_length(p_participants);
  if v_participant_count < 16 or v_participant_count > 42 or pg_catalog.mod(v_participant_count, 2) <> 0 then
    raise exception 'Choice seating approval requires an even roster of 16 to 42 participants' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_expected_roster) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_expected_roster) <> v_participant_count then
    raise exception 'Choice seating approval expected roster must match the participant count' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_profile_versions) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_profile_versions) <> v_participant_count then
    raise exception 'Choice seating approval profile versions must match the participant count' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_assignments) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_assignments) <> v_participant_count * 3 then
    raise exception 'Choice seating approval must contain three seats per participant' using errcode = '22023';
  end if;$$);
  if v_definition = v_original
     or pg_catalog.strpos(v_definition, 'pg_catalog.jsonb_array_length(p_participants) <> 42') > 0
     or pg_catalog.strpos(v_definition, 'pg_catalog.jsonb_array_length(p_expected_roster) <> 42') > 0
     or pg_catalog.strpos(v_definition, 'pg_catalog.jsonb_array_length(p_profile_versions) <> 42') > 0 then
    raise exception 'Could not generalize apply_event3_choice_seating_preview';
  end if;
  execute v_definition;
end;
$migration$;

revoke all on function public.replace_event3_choice_roster(uuid, uuid, integer, boolean, text, integer[])
  from public, anon, authenticated;
revoke all on function public.replace_event3_choice_seating(uuid, integer, boolean, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.replace_event3_choice_match_round(uuid, integer, smallint, boolean, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_event3_choice_seating_preview(
  uuid, uuid, integer, boolean, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, jsonb, text, text, smallint, text, jsonb
) from public, anon, authenticated;

grant execute on function public.replace_event3_choice_roster(uuid, uuid, integer, boolean, text, integer[])
  to service_role;
grant execute on function public.replace_event3_choice_seating(uuid, integer, boolean, text, jsonb, jsonb)
  to service_role;
grant execute on function public.replace_event3_choice_match_round(uuid, integer, smallint, boolean, text, jsonb, jsonb, jsonb, jsonb)
  to service_role;
grant execute on function public.apply_event3_choice_seating_preview(
  uuid, uuid, integer, boolean, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, jsonb, text, text, smallint, text, jsonb
) to service_role;
