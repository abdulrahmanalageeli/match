-- Scores and explanations are computed live. Wake each existing private member
-- subscription after the complete profile/assessment transaction succeeds, so
-- connected members refetch them without exposing answers in a broadcast.
-- Reuse portrait_notify's self + accepted requests + open introductions fanout.
do $refresh$
declare definition text; anchor text:='return marriage.member_state(me);';
begin
 definition:=pg_get_functiondef('marriage.apply_profile(jsonb)'::regprocedure);
 if position(anchor in definition)=0
  or position(anchor in substring(definition from position(anchor in definition)+length(anchor)))>0 then
  raise exception 'Unexpected final profile writer';
 end if;
 execute replace(definition,anchor,$notify$begin
  perform marriage.portrait_notify(me);
 exception when others then
  -- Realtime is an acceleration; client reconciliation remains the fallback.
  -- A temporary broadcast failure must not undo a valid assessment save.
  null;
 end;
 return marriage.member_state(me);$notify$);
end $refresh$;
