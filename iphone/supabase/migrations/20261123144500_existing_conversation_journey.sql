-- A discovery pause keeps an accepted conversation open. Journey decisions
-- use the same member, relationship and block checks as its progress reader.
do $migration$
declare definition text:=pg_get_functiondef('public.marriage_journey_choice(uuid,text,text,uuid,integer)'::regprocedure);
begin
 if strpos(definition,'me uuid:=marriage.require_discovery_member()')=0 then raise exception 'Unexpected journey entry point';end if;
 execute replace(definition,'me uuid:=marriage.require_discovery_member()','me uuid:=marriage.require_communication_member()');
end $migration$;
