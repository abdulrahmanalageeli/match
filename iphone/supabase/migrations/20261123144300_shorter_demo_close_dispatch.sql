-- Close needs neither agreement reminders, typing nor reactions. Retain the
-- result decorations, account checks, report creation and journey cleanup below them.
do $migration$
declare
  definition text := pg_get_functiondef('public.nisfayn_test_rpc(text,text,jsonb)'::regprocedure);
  original text := 's:=public.nisfayn_test_before_journey_choices(action,session_token,payload);';
begin
  if strpos(definition, original) = 0 then raise exception 'Unexpected close dispatcher'; end if;
  execute replace(definition, original, $body$
    if action='close' then
      s:=nisfayn_test.rpc_before_message_reactions(action,session_token,payload);
    else
      s:=public.nisfayn_test_before_journey_choices(action,session_token,payload);
    end if;$body$);
end $migration$;
