-- A separate allowance keeps fictional readings independent of invitations to real members.
create table marriage.demo_deep_usage (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 usage_date date not null, attempts integer not null check (attempts between 1 and 3)
);
alter table marriage.demo_deep_usage enable row level security;
revoke all on marriage.demo_deep_usage from public,anon,authenticated,service_role;

create function public.marriage_demo_deep_reserve() returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_communication_member(); evidence jsonb; today date:=(now() at time zone 'Asia/Riyadh')::date;
begin
 if not coalesce(marriage.is_serious(me),false) then raise exception 'Seriousness membership required' using errcode='42501'; end if;
 evidence:=marriage.deep_evidence(me);
 if jsonb_array_length(evidence->'entries')<2 then raise exception 'Assessment required' using errcode='22023'; end if;
 insert into marriage.demo_deep_usage as usage(member_id,usage_date,attempts) values(me,today,1)
 on conflict(member_id) do update set usage_date=today,attempts=case when usage.usage_date=today then usage.attempts+1 else 1 end
 where usage.usage_date<>today or usage.attempts<3;
 if not found then raise exception 'Daily demo allowance reached' using errcode='54000'; end if;
 return evidence;
end $$;
revoke all on function public.marriage_demo_deep_reserve() from public,anon,service_role;
grant execute on function public.marriage_demo_deep_reserve() to authenticated;
