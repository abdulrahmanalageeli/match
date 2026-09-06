-- Keep bulk organizer ranking replacement aligned with the supported Event3
-- choice-only roster ceiling. A 44-person ballot can contain 43 rows for each
-- of 44 rankers (1,892 rows total).
do $migration$
declare
  v_definition text;
  v_original text;
begin
  v_definition := pg_catalog.pg_get_functiondef(
    'public.replace_event3_admin_rankings_v2(integer,integer[],jsonb,boolean,text)'::regprocedure
  );
  v_original := v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    'v_ranker_count > 42',
    'v_ranker_count > 44'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'v_row_count > 1764',
    'v_row_count > 1892'
  );
  if v_definition = v_original
     or pg_catalog.strpos(v_definition, 'v_ranker_count > 44') = 0
     or pg_catalog.strpos(v_definition, 'v_row_count > 1892') = 0 then
    raise exception 'Could not expand Event3 bulk rankings to 44 rankers';
  end if;
  execute v_definition;
end;
$migration$;

revoke all on function public.replace_event3_admin_rankings_v2(
  integer, integer[], jsonb, boolean, text
) from public, anon, authenticated;

grant execute on function public.replace_event3_admin_rankings_v2(
  integer, integer[], jsonb, boolean, text
) to service_role;
