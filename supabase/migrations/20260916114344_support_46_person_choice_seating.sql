-- Extend the existing roster/session guards without changing event data.
alter table public.event3_choice_seating_reports
  drop constraint event3_choice_seating_reports_assignments_check;
alter table public.event3_choice_seating_reports
  add constraint event3_choice_seating_reports_assignments_check check (
    jsonb_typeof(assignments) = 'array'
    and jsonb_array_length(assignments) between 18 and 138
    and mod(jsonb_array_length(assignments), 6) = 0
  );

create or replace function public.assert_event3_46_seating(p_assignments jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select count(distinct participant_id) from jsonb_to_recordset(p_assignments)
      as a(participant_id integer)) <> 46 then return; end if;
  if exists (
    with seats as (select * from jsonb_to_recordset(p_assignments)
      as a(round integer, table_number integer, participant_id integer)),
    pairs as (select a.participant_id as a, b.participant_id as b
      from seats a join seats b on a.round = b.round and a.table_number = b.table_number
        and a.participant_id < b.participant_id)
    select 1 from pairs group by a,b having count(*) > 1
  ) then
    raise exception '46-person seating must have no repeated tablemates across group rounds' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.assert_event3_46_seating(jsonb) from public, anon, authenticated;
grant execute on function public.assert_event3_46_seating(jsonb) to service_role;

do $migration$
declare
  signature text;
  definition text;
  original text;
begin
  foreach signature in array array[
    'public.replace_event3_choice_roster(uuid,uuid,integer,boolean,text,integer[])',
    'public.replace_event3_choice_seating(uuid,integer,boolean,text,jsonb,jsonb)',
    'public.replace_event3_choice_match_round(uuid,integer,smallint,boolean,text,jsonb,jsonb,jsonb,jsonb)',
    'public.apply_event3_choice_seating_preview(uuid,uuid,integer,boolean,text,jsonb,jsonb,jsonb,jsonb,jsonb,bigint,jsonb,text,text,smallint,text,jsonb)',
    'public.begin_event3_test_mode(integer,integer[])',
    'public.begin_event3_past_event_replay_v1(integer,integer)',
    'public.replace_event3_admin_rankings_v2(integer,integer[],jsonb,boolean,text)'
  ] loop
    original := pg_get_functiondef(signature::regprocedure);
    definition := replace(replace(replace(original, '> 44', '> 46'), '6 to 44', '6 to 46'), '> 1892', '> 2070');
    if definition = original then raise exception 'Expected a 44-person guard in %', signature; end if;
    if signature like 'public.replace_event3_choice_seating(%' then
      definition := regexp_replace(definition, E'\n[Bb][Ee][Gg][Ii][Nn]\r?\n', E'\nbegin\n  perform public.assert_event3_46_seating(p_assignments);\n');
      if strpos(definition, 'perform public.assert_event3_46_seating') = 0 then
        raise exception 'Could not install the 46-person no-repeat guard';
      end if;
    end if;
    execute definition;
  end loop;
end;
$migration$;
