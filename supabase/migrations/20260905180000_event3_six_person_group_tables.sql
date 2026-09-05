-- Event3 choice-only group rounds use tables of at most six participants.
-- A full 42-person edition therefore has seven tables in every group round.
-- Keep the existing atomic seating RPC and tighten only its table-capacity
-- invariant; complete-roster validation then implies the correct table count.

do $migration$
declare
  v_definition text;
  v_original text;
begin
  v_definition := pg_catalog.pg_get_functiondef(
    'public.replace_event3_choice_seating(uuid,integer,boolean,text,jsonb,jsonb)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'assignment_data.table_number not between 1 and 6',
    'assignment_data.table_number < 1 or assignment_data.table_number > pg_catalog.ceil(v_participant_count::numeric / 6)::integer');
  v_definition := pg_catalog.replace(v_definition,
    'group by round, table_number having count(*) > 7',
    'group by round, table_number having count(*) > 6');
  v_definition := pg_catalog.replace(v_definition,
    'Every choice seating round must contain the complete roster in groups of at most seven',
    'Every choice seating round must contain the complete roster in groups of at most six');
  if v_definition = v_original
     or pg_catalog.strpos(v_definition, 'table_number not between 1 and 6') > 0
     or pg_catalog.strpos(v_definition, 'having count(*) > 7') > 0
     or pg_catalog.strpos(v_definition, 'groups of at most seven') > 0 then
    raise exception 'Could not enforce six-person Event3 choice tables';
  end if;
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.apply_event3_choice_seating_preview(uuid,uuid,integer,boolean,text,jsonb,jsonb,jsonb,jsonb,jsonb,bigint,jsonb,text,text,smallint,text,jsonb)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(v_definition,
    'expected.table_number not between 1 and 6',
    'expected.table_number < 1 or expected.table_number > pg_catalog.ceil(v_participant_count::numeric / 6)::integer');
  if v_definition = v_original
     or pg_catalog.strpos(v_definition, 'expected.table_number not between 1 and 6') > 0 then
    raise exception 'Could not allow seven-table Event3 choice preview baselines';
  end if;
  execute v_definition;
end;
$migration$;

revoke all on function public.replace_event3_choice_seating(uuid, integer, boolean, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_event3_choice_seating(uuid, integer, boolean, text, jsonb, jsonb)
  to service_role;

revoke all on function public.apply_event3_choice_seating_preview(
  uuid, uuid, integer, boolean, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, jsonb, text, text, smallint, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_event3_choice_seating_preview(
  uuid, uuid, integer, boolean, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, jsonb, text, text, smallint, text, jsonb
) to service_role;
