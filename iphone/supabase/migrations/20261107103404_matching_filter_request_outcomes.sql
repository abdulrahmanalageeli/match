-- Apply the complete directory filters before selecting recommended candidates.
-- Reuse the current predicates so consent, hidden profiles and rematch rules stay aligned.
do $filters$ declare definition text;begin
 definition:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 if position('return (with eligible as materialized (' in definition)=0 or position('where p.member_id<>me' in definition)=0 then
  raise exception 'Unexpected browse definition';end if;
 definition:=replace(definition,'return (with eligible as materialized (',
  'if options->>''mode''=''recommended'' then perform marriage.ensure_week(me,marriage.current_week());end if; return (with eligible as materialized (');
 definition:=replace(definition,'where p.member_id<>me',
 $gate$where p.member_id<>me
 and (coalesce(options->>'mode','all')<>'recommended' or (
  exists(select 1 from marriage.weekly_candidates wc where wc.member_id=me and wc.week_start=marriage.current_week() and wc.candidate_id=p.member_id
   and (coalesce(options->>'afterId','')='' or wc.slot>(select prior.slot from marriage.weekly_candidates prior where prior.member_id=me and prior.week_start=wc.week_start and prior.candidate_id=(options->>'afterId')::uuid)))
  and not exists(select 1 from marriage.member_requests active where me in(active.requester_id,active.recipient_id) and p.member_id in(active.requester_id,active.recipient_id) and active.status in('pending','accepted'))
 ))$gate$);
 execute definition;
end $filters$;

-- Historical closures keep a neutral label; never infer the reason from their age.
-- Freeze previously shared aliases at closure rather than expose later profile edits.
alter table marriage.member_requests add column closed_at timestamptz;
alter table marriage.member_requests add column closure_outcome text check(closure_outcome in('closed','expired'));
alter table marriage.member_requests add column closed_requester_alias text;
alter table marriage.member_requests add column closed_recipient_alias text;
create function marriage.stamp_request_closure() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status in('pending','accepted') and new.status in('closed','cancelled','declined') then
  new.closed_at:=statement_timestamp();
  new.closure_outcome:=coalesce(new.closure_outcome,'closed');
  new.closed_requester_alias:=marriage.member_card(new.recipient_id,new.requester_id)->>'alias';
  new.closed_recipient_alias:=marriage.member_card(new.requester_id,new.recipient_id)->>'alias';
 end if;
 return new;
end $$;
revoke all on function marriage.stamp_request_closure() from public,anon,authenticated;
create trigger stamp_request_closure before update of status on marriage.member_requests
 for each row execute function marriage.stamp_request_closure();

create or replace function marriage.expire_my_requests() returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 update marriage.member_requests set status='closed',updated_at=statement_timestamp(),closure_outcome='expired'
 where status='pending' and me in(requester_id,recipient_id) and created_at<=statement_timestamp()-interval '7 days';
end $$;

-- The deadline is the same server rule enforced when accepting a request.
create or replace function public.marriage_inbox() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform marriage.expire_my_requests();
 return (select coalesce(jsonb_agg(item||case when item->>'status'='pending' then
  jsonb_build_object('expiresAt',(item->>'createdAt')::timestamptz+interval '7 days') else '{}'::jsonb end order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(marriage.inbox()) with ordinality rows(item,ordinal));
end $$;

create function marriage.request_history() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 if not marriage.is_paid(me) then raise exception 'العضوية غير متاحة.' using errcode='42501';end if;
 perform marriage.expire_my_requests();
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'alias',coalesce(case when r.requester_id=me then r.closed_recipient_alias else r.closed_requester_alias end,'عضو'),
  'direction',case when r.requester_id=me then 'outgoing' else 'incoming' end,
  'createdAt',r.created_at,'closedAt',r.closed_at,'outcome',coalesce(r.closure_outcome,'closed'))
  order by coalesce(r.closed_at,r.updated_at) desc,r.id),'[]'::jsonb)
  from (select * from marriage.member_requests where me in(requester_id,recipient_id) and status in('closed','cancelled','declined')
   order by coalesce(closed_at,updated_at) desc,id limit 50) r);
end $$;
create function public.marriage_request_history() returns jsonb language sql security invoker set search_path='' as $$select marriage.request_history()$$;
revoke all on function marriage.request_history(),public.marriage_request_history() from public,anon;
grant execute on function marriage.request_history(),public.marriage_request_history() to authenticated;
