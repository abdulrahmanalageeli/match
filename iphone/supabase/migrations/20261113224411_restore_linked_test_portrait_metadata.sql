-- Keep the already-authorized, blurred live portrait linked in tester responses.
-- Never copy its storage object into tester ownership or expose a clear image.
do $migration$
declare
  definition text;
  anchor text := E' return result;\nend';
  replacement text := $patch$
 if result->>'actor'='abdulrahman' and jsonb_typeof(result#>'{profiles,reham}')='object'
    and (result#>'{profiles,reham,portrait}' is null or result#>'{profiles,reham,portrait}'='null'::jsonb)
    and (result->'matched'='true'::jsonb or result->'allowRematch'='true'::jsonb)
    and coalesce(result#>'{hiddenPeople,abdulrahman}','false'::jsonb)<>'true'::jsonb then
   select data into d from nisfayn_test.room where id;
   if d#>>'{profiles,reham,portrait,id}' is not null then
     photo:=nisfayn_test.live_reham_portrait(session_token,(d#>>'{profiles,reham,portrait,id}')::uuid);
     if photo is not null then
       result:=jsonb_set(result,'{profiles,reham,portrait}',photo);
     end if;
   end if;
 end if;
 return result;
end$patch$;
begin
  definition:=pg_get_functiondef('nisfayn_test.rpc_before_chat_privacy(text,text,jsonb)'::regprocedure);
  if strpos(definition,anchor)=0 then raise exception 'Portrait response definition changed'; end if;
  execute replace(definition,anchor,replacement);
end
$migration$;
