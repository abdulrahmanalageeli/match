-- Event3 choice-only supports an even roster from 6 through 44 people.
-- A table number has one fixed capacity across all three group rounds. For a
-- 44-person roster this is 7, 7, 6, 6, 6, 6, 6 for tables 1 through 7.

alter table public.event3_choice_seating_reports
  drop constraint if exists event3_choice_seating_reports_assignments_check;

alter table public.event3_choice_seating_reports
  add constraint event3_choice_seating_reports_assignments_check check (
    pg_catalog.jsonb_typeof(assignments) = 'array'
    and pg_catalog.jsonb_array_length(assignments) between 18 and 132
    and pg_catalog.mod(pg_catalog.jsonb_array_length(assignments), 6) = 0
  );

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
    'if v_count < 16 or v_count > 42 or pg_catalog.mod(v_count, 2) <> 0',
    'if v_count < 6 or v_count > 44 or pg_catalog.mod(v_count, 2) <> 0');
  v_definition := pg_catalog.replace(v_definition,
    'if v_count < 6 or pg_catalog.mod(v_count, 2) <> 0',
    'if v_count < 6 or v_count > 44 or pg_catalog.mod(v_count, 2) <> 0');
  v_definition := pg_catalog.replace(v_definition,
    'The choice-only roster requires an even set of 16 to 42 unique participant numbers',
    'The choice-only roster requires 6 to 44 unique participant numbers and an even count');
  v_definition := pg_catalog.replace(v_definition,
    'The choice-only roster requires an even set of at least 6 unique participant numbers',
    'The choice-only roster requires 6 to 44 unique participant numbers and an even count');
  if v_definition = v_original or pg_catalog.strpos(v_definition, 'v_count > 44') = 0 then
    raise exception 'Could not cap the Event3 choice roster at 44';
  end if;
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.replace_event3_choice_seating(uuid,integer,boolean,text,jsonb,jsonb)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'if v_participant_count < 16 or v_participant_count > 42 or pg_catalog.mod(v_participant_count, 2) <> 0 or v_assignment_count <> v_participant_count * 3 then',
    'if v_participant_count < 6 or v_participant_count > 44 or pg_catalog.mod(v_participant_count, 2) <> 0 or v_assignment_count <> v_participant_count * 3 then');
  v_definition := pg_catalog.replace(v_definition,
    'if v_participant_count < 6 or pg_catalog.mod(v_participant_count, 2) <> 0 or v_assignment_count <> v_participant_count * 3 then',
    'if v_participant_count < 6 or v_participant_count > 44 or pg_catalog.mod(v_participant_count, 2) <> 0 or v_assignment_count <> v_participant_count * 3 then');
  v_definition := pg_catalog.replace(v_definition,
    'Choice seating requires an even roster of 16 to 42 and three assignments per participant',
    'Choice seating requires an even roster of 6 to 44 and three assignments per participant');
  v_definition := pg_catalog.replace(v_definition,
    'Choice seating requires an even roster of at least 6 and three assignments per participant',
    'Choice seating requires an even roster of 6 to 44 and three assignments per participant');
  v_definition := pg_catalog.replace(v_definition,
    'assignment_data.table_number < 1 or assignment_data.table_number > pg_catalog.ceil(v_participant_count::numeric / 6)::integer',
    'assignment_data.table_number < 1 or assignment_data.table_number > greatest(1, pg_catalog.floor(v_participant_count::numeric / 6)::integer)');
  v_definition := pg_catalog.replace(v_definition,
    'group by round, table_number having count(*) > 6',
    'group by round, table_number having count(*) <> pg_catalog.floor(v_participant_count::numeric / greatest(1, pg_catalog.floor(v_participant_count::numeric / 6)::integer))::integer + case when table_number <= pg_catalog.mod(v_participant_count, greatest(1, pg_catalog.floor(v_participant_count::numeric / 6)::integer)) then 1 else 0 end');
  v_definition := pg_catalog.replace(v_definition,
    'group by round, table_number having count(*) not between pg_catalog.floor(v_participant_count::numeric / greatest(1, pg_catalog.floor(v_participant_count::numeric / 6)::integer))::integer and pg_catalog.ceil(v_participant_count::numeric / greatest(1, pg_catalog.floor(v_participant_count::numeric / 6)::integer))::integer',
    'group by round, table_number having count(*) <> pg_catalog.floor(v_participant_count::numeric / greatest(1, pg_catalog.floor(v_participant_count::numeric / 6)::integer))::integer + case when table_number <= pg_catalog.mod(v_participant_count, greatest(1, pg_catalog.floor(v_participant_count::numeric / 6)::integer)) then 1 else 0 end');
  v_definition := pg_catalog.replace(v_definition,
    'Every choice seating round must contain the complete roster in groups of at most six',
    'Every choice seating table must keep the same capacity in every round while targeting six seats');
  v_definition := pg_catalog.replace(v_definition,
    'Every choice seating round must contain the complete roster in evenly distributed groups targeting six',
    'Every choice seating table must keep the same capacity in every round while targeting six seats');
  if v_definition = v_original
     or pg_catalog.strpos(v_definition, 'v_participant_count > 44') = 0
     or pg_catalog.strpos(v_definition, 'table_number <= pg_catalog.mod') = 0 then
    raise exception 'Could not cap or stabilize Event3 choice seating tables';
  end if;
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.replace_event3_choice_match_round(uuid,integer,smallint,boolean,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'if v_roster_count < 16 or v_roster_count > 42 or pg_catalog.mod(v_roster_count, 2) <> 0 or v_row_count <> v_roster_count or v_table_count <> v_roster_count then',
    'if v_roster_count < 6 or v_roster_count > 44 or pg_catalog.mod(v_roster_count, 2) <> 0 or v_row_count <> v_roster_count or v_table_count <> v_roster_count then');
  v_definition := pg_catalog.replace(v_definition,
    'if v_roster_count < 6 or pg_catalog.mod(v_roster_count, 2) <> 0 or v_row_count <> v_roster_count or v_table_count <> v_roster_count then',
    'if v_roster_count < 6 or v_roster_count > 44 or pg_catalog.mod(v_roster_count, 2) <> 0 or v_row_count <> v_roster_count or v_table_count <> v_roster_count then');
  if v_definition = v_original or pg_catalog.strpos(v_definition, 'v_roster_count > 44') = 0 then
    raise exception 'Could not cap Event3 choice matching at 44';
  end if;
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.apply_event3_choice_seating_preview(uuid,uuid,integer,boolean,text,jsonb,jsonb,jsonb,jsonb,jsonb,bigint,jsonb,text,text,smallint,text,jsonb)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'if v_participant_count < 16 or v_participant_count > 42 or pg_catalog.mod(v_participant_count, 2) <> 0 then',
    'if v_participant_count < 6 or v_participant_count > 44 or pg_catalog.mod(v_participant_count, 2) <> 0 then');
  v_definition := pg_catalog.replace(v_definition,
    'if v_participant_count < 6 or pg_catalog.mod(v_participant_count, 2) <> 0 then',
    'if v_participant_count < 6 or v_participant_count > 44 or pg_catalog.mod(v_participant_count, 2) <> 0 then');
  v_definition := pg_catalog.replace(v_definition,
    'Choice seating approval requires an even roster of 16 to 42 participants',
    'Choice seating approval requires an even roster of 6 to 44 participants');
  v_definition := pg_catalog.replace(v_definition,
    'Choice seating approval requires an even roster of at least 6 participants',
    'Choice seating approval requires an even roster of 6 to 44 participants');
  v_definition := pg_catalog.replace(v_definition,
    'expected.table_number < 1 or expected.table_number > pg_catalog.ceil(v_participant_count::numeric / 6)::integer',
    'expected.table_number < 1 or expected.table_number > greatest(1, pg_catalog.floor(v_participant_count::numeric / 6)::integer)');
  if v_definition = v_original or pg_catalog.strpos(v_definition, 'v_participant_count > 44') = 0 then
    raise exception 'Could not cap Event3 choice seating approval at 44';
  end if;
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.begin_event3_test_mode(integer,integer[])'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'and (v_selected_count < 16 or v_selected_count > 42 or v_selected_count % 2 <> 0))',
    'and (v_selected_count < 6 or v_selected_count > 44 or v_selected_count % 2 <> 0))');
  v_definition := pg_catalog.replace(v_definition,
    'and (v_selected_count < 6 or v_selected_count % 2 <> 0))',
    'and (v_selected_count < 6 or v_selected_count > 44 or v_selected_count % 2 <> 0))');
  v_definition := pg_catalog.replace(v_definition,
    'Test mode requires 36 unique participants for classic events, or an even 16 to 42 for choice-only events',
    'Test mode requires 36 unique participants for classic events, or an even roster of 6 to 44 for choice-only events');
  v_definition := pg_catalog.replace(v_definition,
    'Test mode requires 36 unique participants for classic events, or an even roster of at least 6 for choice-only events',
    'Test mode requires 36 unique participants for classic events, or an even roster of 6 to 44 for choice-only events');
  if v_definition = v_original or pg_catalog.strpos(v_definition, 'v_selected_count > 44') = 0 then
    raise exception 'Could not cap Event3 choice test mode at 44';
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
revoke all on function public.begin_event3_test_mode(integer, integer[])
  from public, anon, authenticated;

grant execute on function public.replace_event3_choice_roster(uuid, uuid, integer, boolean, text, integer[])
  to service_role;
grant execute on function public.replace_event3_choice_seating(uuid, integer, boolean, text, jsonb, jsonb)
  to service_role;
grant execute on function public.replace_event3_choice_match_round(uuid, integer, smallint, boolean, text, jsonb, jsonb, jsonb, jsonb)
  to service_role;
grant execute on function public.apply_event3_choice_seating_preview(
  uuid, uuid, integer, boolean, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, jsonb, text, text, smallint, text, jsonb
) to service_role;
grant execute on function public.begin_event3_test_mode(integer, integer[])
  to service_role;
