-- One first structured-card observation per real registration. No answers, field IDs or transcript.
create unique index launch_first_luna_carry on marriage.launch_events(member_id) where kind='luna_carried';

do $migration$
declare definition text:=pg_get_functiondef('marriage.launch_note(text,text,text,text)'::regprocedure);
 marker text:=' if not (coalesce(kind_value';
begin
 if strpos(definition,marker)=0 then raise exception 'Unexpected launch event validation';end if;
 execute replace(definition,marker,$count$
 if kind_value='luna_carried' then
  if step_value !~ '^(0|[1-9][0-9]?)$' then raise exception 'Invalid count' using errcode='22023';end if;
  if step_value::int>64 then raise exception 'Invalid count' using errcode='22023';end if;
  insert into marriage.launch_events(member_id,kind,step,platform,build)
   values(actor,kind_value,step_value,platform_value,build_value) on conflict do nothing;
  return;
 end if;
$count$||marker);
 definition:=pg_get_functiondef('marriage.admin_launch_analytics(date,date)'::regprocedure);
 marker:=' union all select ''sms_''||state';
 if strpos(definition,marker)=0 then raise exception 'Unexpected launch cohort definition';end if;
 definition:=replace(definition,'and kind<>''activity''','and kind not in(''activity'',''luna_carried'')');
 execute replace(definition,marker,$report$
 union all select k,m.gender,sum(n) from events e join mem m using(member_id)
 cross join lateral(values('luna_measured',1),('luna_with_carried',(e.step::int>0)::int),('luna_carried_answers',e.step::int))v(k,n)
 where e.kind='luna_carried' and e.day>=date_from group by k,m.gender
$report$||marker);
end $migration$;
