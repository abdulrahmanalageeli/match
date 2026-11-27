-- Keep stable, member-scoped events for decisions and terminal outcomes.
alter table marriage.member_requests add column notice_resolution text
  check (notice_resolution in ('declined','withdrawn','ended','expired','closed'));

create or replace function marriage.update_category(event text) returns text
language sql immutable strict set search_path='' as $$
 select case split_part(event,':',1)
 when 'introduction' then 'connections'
 when 'agreement' then 'agreement' when 'journey' then 'agreement' when 'rematch' then 'agreement'
 when 'family_link' then 'family' when 'family_room' then 'family'
 when 'missed_call' then 'message' when 'analysis' then 'analysis'
 when 'interest' then 'interest' when 'screenshot' then 'screenshot'
 when 'application' then 'account' when 'verification' then 'account'
 when 'safety' then 'account' when 'support' then 'account'
 when 'membership' then 'membership' when 'gift' then 'membership' end
$$;

create function marriage.stamp_introduction_resolution() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.status in ('accepted','pending') and new.status in ('closed','cancelled','declined') then
  new.notice_resolution:=case
   when new.closure_outcome='expired' then 'expired'
   when new.status='declined' then 'declined'
   when old.status='accepted' then 'ended'
   when new.status='cancelled' then 'withdrawn'
   else 'closed' end;
 end if;
 return new;
end $$;
create trigger y_stamp_introduction_resolution before update of status on marriage.member_requests
for each row execute function marriage.stamp_introduction_resolution();

create function marriage.notify_introduction_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare participant uuid; actor uuid:=auth.uid(); peer uuid; event text;
begin
 if new.status=old.status then return null; end if;
 if new.status='accepted' then
  -- Native/web acceptance push is already queued by push_request_accept.
  insert into marriage.notification_updates(member_id,request_id,event_key,target_id)
   select p,new.id,'introduction:accepted:'||new.id,new.id
   from unnest(array[new.requester_id,new.recipient_id]) p
   on conflict(member_id,event_key) do nothing;
 elsif old.status in ('accepted','pending') and new.notice_resolution is not null then
  event:='introduction:'||case new.notice_resolution when 'ended' then 'closed' else new.notice_resolution end||':'||new.id;
  foreach participant in array array[new.requester_id,new.recipient_id] loop
   peer:=case when participant=new.requester_id then new.recipient_id else new.requester_id end;
   -- A member who took the action already has its receipt. Never disclose the reason for a safety boundary.
   if (participant is distinct from actor or new.notice_resolution='expired') and not exists(select from marriage.blocks b
      where (b.member_id,b.blocked_id) in ((participant,peer),(peer,participant))) and not exists(
      select from marriage.exclusive_members e where e.member_id=participant) then
    perform marriage.queue_member_update(participant,event,new.id);
   end if;
  end loop;
 end if;
 return null;
end $$;
create trigger introduction_notice after update of status on marriage.member_requests
for each row execute function marriage.notify_introduction_change();

create function marriage.notify_family_room() returns trigger
language plpgsql security definer set search_path='' as $$
declare participant text; event text;
begin
 if tg_op='INSERT' then
  event:='family_room:invited:'||new.id;
 elsif old.status is distinct from new.status and new.status='active' then
  event:='family_room:active:'||new.id;
 else return null;
 end if;
 foreach participant in array array[new.member_a,new.member_b] loop
  if tg_op='INSERT' and participant=new.created_by then continue; end if;
  if participant like 'member:%' and new.request_id is not null then
   perform marriage.queue_member_update(split_part(participant,':',2)::uuid,
     case when new.status='active' and not marriage.family_room_can_read(participant,new)
       then 'family_room:ready:'||new.id else event end,new.id,new.request_id);
  elsif participant like 'test:%' and new.request_id is null then
   insert into marriage.notification_updates(test_actor,event_key,target_id)
    values(split_part(participant,':',2),event,new.id) on conflict(test_actor,event_key) do nothing;
  end if;
 end loop;
 return null;
end $$;
create trigger family_room_notice after insert or update of status on marriage.family_rooms
for each row execute function marriage.notify_family_room();

create function marriage.notify_analysis_decision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='requested' and (tg_op='INSERT' or old.status is distinct from 'requested') then
  perform marriage.queue_member_update(new.recipient_id,'analysis:invited:'||new.id,new.connection_id,new.connection_id);
 elsif new.status='shared' and (tg_op='INSERT' or old.status is distinct from 'shared') then
  perform marriage.queue_member_update(new.requester_id,'analysis:shared:'||new.id,new.connection_id,new.connection_id);
  perform marriage.queue_member_update(new.recipient_id,'analysis:shared:'||new.id,new.connection_id,new.connection_id);
 end if;
 return null;
end $$;
create trigger analysis_decision_notice after insert or update of status on marriage.deep_analyses
for each row execute function marriage.notify_analysis_decision();

-- Keep the existing push registration, mute, lifecycle and permission checks.
do $$
declare definition text:=pg_get_functiondef('marriage.push_allowed(marriage.push_outbox)'::regprocedure);
begin
 if position('and a.status=''review'' and a.expires_at>now()' in definition)=0 then
  raise exception 'Unexpected analysis notification rule';
 end if;
 definition:=replace(definition,
  'and a.status=''review'' and a.expires_at>now()'||
  E'\n   and (case when a.requester_id=job.member_id then a.a_decisions when a.recipient_id=job.member_id then a.b_decisions end) is null',
  'and a.expires_at>now() and case split_part(job.event_key,'':'',2)'||
  ' when ''invited'' then a.status=''requested'' and a.recipient_id=job.member_id'||
  ' when ''shared'' then a.status=''shared'' and job.member_id in(a.requester_id,a.recipient_id)'||
  ' when ''review'' then a.status=''review'' and (case when a.requester_id=job.member_id then a.a_decisions when a.recipient_id=job.member_id then a.b_decisions end) is null else false end');
 if position('when ''shared'' then a.status' in definition)=0 then raise exception 'Analysis event rules were not installed'; end if;
 execute definition;
end $$;

create function marriage.alert_inbox()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member uuid:=marriage.require_communication_member();
begin
 return (select coalesce(jsonb_agg(item ||
  jsonb_strip_nulls(jsonb_build_object('latestUnreadAt',incoming.created_at,'celebrationKey',notice.id)) ||
  case when item->>'status'='pending' then jsonb_build_object('expiresAt',(item->>'createdAt')::timestamptz+interval '7 days')
       else '{}'::jsonb end order by ordinal),'[]'::jsonb)
 from jsonb_array_elements(marriage.inbox()) with ordinality rows(item,ordinal)
 join marriage.member_requests r on r.id=(item->>'id')::uuid and member in(r.requester_id,r.recipient_id)
 left join marriage.thread_read_positions s on s.request_id=r.id and s.reader_id=member
 left join lateral (select m.created_at from marriage.thread_messages m where r.status='accepted'
   and m.request_id=r.id and m.sender_id=case when r.requester_id=member then r.recipient_id else r.requester_id end
   and m.deleted_at is null and (m.created_at,m.id)>
   (coalesce(s.through_created_at,'-infinity'::timestamptz),coalesce(s.through_id,'00000000-0000-0000-0000-000000000000'::uuid))
   order by m.created_at desc,m.id desc limit 1) incoming on true
 left join marriage.notification_updates notice on notice.member_id=member and notice.request_id=r.id and r.status='accepted'
   and notice.event_key='introduction:accepted:'||r.id and notice.read_at is null and notice.created_at>now()-interval '7 days');
end $$;

create or replace function public.marriage_inbox() returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform marriage.expire_my_requests();
 return marriage.alert_inbox();
end $$;

create function marriage.closed_introduction_row(r marriage.member_requests, member uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'alias',coalesce(case when r.requester_id=member then r.closed_recipient_alias else r.closed_requester_alias end,'عضو'),
 'direction',case when r.requester_id=member then 'outgoing' else 'incoming' end,
 'createdAt',r.created_at,'closedAt',r.closed_at,'outcome',coalesce(r.closure_outcome,'closed'),
 'resolution',coalesce(r.notice_resolution,case when r.closure_outcome='expired' then 'expired' when r.status='declined' then 'declined' else 'closed' end),
 'canRequestAgain',not marriage.permanent_boundary(r.requester_id,r.recipient_id)
   and (r.closure_outcome='expired' or (r.status='cancelled' and r.allow_rematch)))
$$;

create or replace function marriage.request_history_page(before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member uuid:=marriage.require_member(); cursor_at timestamptz;
begin
 perform marriage.expire_my_requests();
 if before_id is not null then
  select coalesce(closed_at,updated_at) into cursor_at from marriage.member_requests
   where id=before_id and member in(requester_id,recipient_id) and status in('closed','cancelled','declined');
  if not found then return '[]'; end if;
 end if;
 return (select coalesce(jsonb_agg(marriage.closed_introduction_row(r,member) order by coalesce(r.closed_at,r.updated_at) desc,r.id),'[]')
 from (select * from marriage.member_requests where member in(requester_id,recipient_id)
  and status in('closed','cancelled','declined')
  and (before_id is null or coalesce(closed_at,updated_at)<cursor_at or (coalesce(closed_at,updated_at)=cursor_at and id>before_id))
  order by coalesce(closed_at,updated_at) desc,id limit 50) r);
end $$;

create function marriage.request_history_item(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare member uuid:=marriage.require_member();
begin
 return (select marriage.closed_introduction_row(r,member) from marriage.member_requests r
  where r.id=target and member in(r.requester_id,r.recipient_id) and r.status in('closed','cancelled','declined'));
end $$;

revoke all on function marriage.stamp_introduction_resolution(),marriage.notify_introduction_change(),marriage.notify_family_room(),
 marriage.notify_analysis_decision(),marriage.alert_inbox(),marriage.closed_introduction_row(marriage.member_requests,uuid),
 marriage.request_history_item(uuid) from public,anon,authenticated,service_role;
create function public.marriage_request_history_item(target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select marriage.request_history_item($1) $$;
revoke all on function public.marriage_request_history_item(uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.alert_inbox(),marriage.request_history_item(uuid),public.marriage_request_history_item(uuid) to authenticated;


-- Keep action prompts current even when their push was delivered before a decision.
create function marriage.member_update_current(u marriage.notification_updates)
returns boolean language sql stable set search_path='' as $$
 select case
 when u.event_key like 'journey:exclusive:%' then exists(select from marriage.exclusive_members e
  join marriage.exclusive_consents c on c.request_id=e.request_id and c.member_id=e.member_id
  where e.request_id=u.request_id and e.member_id=u.member_id and c.proposal_id::text=split_part(u.event_key,':',3))
 when u.event_key like 'family_room:%' then exists(select from marriage.family_rooms f where f.id=u.target_id and
  (f.member_a=coalesce('member:'||u.member_id,'test:'||u.test_actor) or f.member_b=coalesce('member:'||u.member_id,'test:'||u.test_actor)) and
  (case when u.event_key like 'family_room:ready:%' then f.status='active'
   when u.event_key like 'family_room:active:%' then f.status='active' and marriage.family_room_can_read(coalesce('member:'||u.member_id,'test:'||u.test_actor),f)
   else f.status='pending' and not exists(select from marriage.family_room_approvals p where p.room_id=f.id
    and p.member_key=coalesce('member:'||u.member_id,'test:'||u.test_actor)) end))
 when u.event_key like 'analysis:%' and u.member_id is not null then exists(select from marriage.deep_analyses a
  where a.id::text=split_part(u.event_key,':',3) and u.member_id in(a.requester_id,a.recipient_id) and a.expires_at>now()
   and case split_part(u.event_key,':',2)
    when 'invited' then a.status='requested' and a.recipient_id=u.member_id
    when 'shared' then a.status='shared'
    when 'review' then a.status='review' and (case when a.requester_id=u.member_id then a.a_decisions else a.b_decisions end) is null
    else false end)
 when u.event_key like 'agreement:due:%' then exists(select from marriage.conversation_agreements a where a.request_id=u.request_id
   and a.data->>'status'='accepted' and (a.data->>'deadline')::timestamptz>now()
   and u.event_key like '%:'||(a.data->>'deadline'))
 when u.event_key like 'agreement:%' then
  case when u.request_id is not null then exists(select from marriage.conversation_agreements a where a.request_id=u.request_id and marriage.agreement_update_valid(u.event_key,a.data))
  when u.test_actor is not null then exists(select from nisfayn_test.room r where r.id and r.data->>'matched'='true' and marriage.agreement_update_valid(u.event_key,r.data->'seriousness'))
  else false end
 else true end
$$;

create or replace function marriage.read_notification_updates(owner uuid,actor text,read_id uuid) returns jsonb
language plpgsql set search_path='' as $$
begin
 if read_id is not null then
  update marriage.notification_updates u set read_at=coalesce(u.read_at,now())
  where u.id=read_id and (u.member_id=owner or u.test_actor=actor);
  return '[]'::jsonb;
 end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q."createdAt" desc) from (
  select u.id,split_part(u.event_key,':',1)||':'||split_part(u.event_key,':',2) as event,
   u.target_id as "target", u.created_at as "createdAt", u.read_at is null as unread
  from marriage.notification_updates u
  where (u.member_id=owner or u.test_actor=actor) and u.created_at>now()-interval '7 days'
  and (u.request_id is null or exists(select from marriage.member_requests r where r.id=u.request_id
    and r.status='accepted' and owner in(r.requester_id,r.recipient_id) and marriage.compatible(r.requester_id,r.recipient_id)))
  and marriage.member_update_current(u)
  order by u.created_at desc,u.id desc limit 25
 ) q),'[]'::jsonb);
end $$;
revoke all on function marriage.member_update_current(marriage.notification_updates) from public,anon,authenticated,service_role;


create index member_request_expiry_queue on marriage.member_requests(created_at,id) where status='pending';

-- The existing reminder keeps handling device delivery. Add the same deadline to the in-app queue.
alter function public.nisfayn_enqueue_deadline_reminders() rename to nisfayn_enqueue_deadline_reminders_before_alert_feed;
create function public.nisfayn_enqueue_deadline_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare device_count integer;
begin
 device_count:=public.nisfayn_enqueue_deadline_reminders_before_alert_feed();
 -- Use the same seven-day rule as the inbox. The bounded batch leaves concurrent
 -- response transactions alone and lets the next tick pick up the rest.
 with overdue as (
   select id from marriage.member_requests where status='pending' and created_at<now()-interval '7 days'
   order by created_at,id limit 200 for update skip locked
 )
 update marriage.member_requests r set status='closed',updated_at=statement_timestamp(),closure_outcome='expired'
 from overdue where overdue.id=r.id and r.status='pending';
 insert into marriage.notification_updates(member_id,request_id,event_key,target_id)
 select member,r.id,'agreement:due:'||r.id||':'||(a.data->>'deadline'),r.id
 from marriage.conversation_agreements a join marriage.member_requests r on r.id=a.request_id
 cross join lateral unnest(array[r.requester_id,r.recipient_id]) member
 where r.status='accepted' and a.data->>'status'='accepted'
 and (a.data->>'deadline')::timestamptz between now() and now()+interval '24 hours'
 on conflict(member_id,event_key) do nothing;
 return device_count;
end $$;
revoke all on function public.nisfayn_enqueue_deadline_reminders(),public.nisfayn_enqueue_deadline_reminders_before_alert_feed()
 from public,anon,authenticated,service_role;
grant execute on function public.nisfayn_enqueue_deadline_reminders() to service_role;

-- The private broadcast carries no event type, names, message, or identifiers.
create function marriage.signal_member_alert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.member_id is not null then
  begin
   perform realtime.send('{}'::jsonb,'changed','marriage:member:'||new.member_id,true);
  exception when others then null;
  end;
 end if;
 return null;
end $$;
create trigger signal_member_alert after insert on marriage.notification_updates
for each row execute function marriage.signal_member_alert();
revoke all on function marriage.signal_member_alert() from public,anon,authenticated,service_role;

create function marriage.notify_exclusive_member() returns trigger
language plpgsql security definer set search_path='' as $$
declare proposal uuid;
begin
 select c.proposal_id into proposal from marriage.exclusive_consents c
 where c.request_id=new.request_id and c.member_id=new.member_id;
 if proposal is not null then
  delete from marriage.notification_updates where member_id=new.member_id and request_id=new.request_id
   and event_key in ('journey:invited:'||proposal,'journey:confirmed:'||proposal);
  delete from marriage.push_outbox where member_id=new.member_id and request_id=new.request_id
   and kind='update' and event_key='journey:confirmed:'||proposal and attempts=0;
  perform marriage.queue_member_update(new.member_id,'journey:exclusive:'||proposal,new.request_id,new.request_id);
 end if;
 return null;
end $$;
create trigger exclusive_member_notice after insert on marriage.exclusive_members
for each row execute function marriage.notify_exclusive_member();
revoke all on function marriage.notify_exclusive_member() from public,anon,authenticated,service_role;
