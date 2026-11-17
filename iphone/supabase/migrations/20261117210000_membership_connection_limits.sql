-- Existing connections survive expiry; the lower limit prevents new connections.
create function marriage.connection_limit(target uuid) returns integer
language sql stable set search_path='' as $$
 select case when marriage.is_paid(target) then 3 else 1 end
$$;
revoke all on function marriage.connection_limit(uuid) from public,anon,authenticated;

-- Preserve existing pair locks, expiry, exclusivity and authorization. Change only
-- comparisons of active connection counts, including private card/browse wrappers.
do $limits$ declare definition text; revised text; begin
 for definition in
  select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='marriage' and p.prokind='f' and p.prosrc like '%marriage.active_connections(%'
 loop
  revised:=regexp_replace(definition,
   'marriage.active_connections\(([^)]+)\)\s*(>=|<)\s*2',
   'marriage.active_connections(\1) \2 marriage.connection_limit(\1)','g');
  revised:=replace(revised,'الحد الأقصى تعارفان متزامنان.','اكتمل عدد الارتباطات المتاح لعضوية أحد الطرفين.');
  if revised<>definition then execute revised;end if;
 end loop;
end $limits$;
