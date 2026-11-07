-- Expose existing event times; do not backfill unknown historical events with today.
create or replace function marriage.inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,
  'createdAt',r.created_at,'updatedAt',r.updated_at,
  'direction',case when r.requester_id=me then 'outgoing' else 'incoming' end,
  'person',marriage.member_card(me,p.peer),
  'unreadCount',case when r.status='accepted' then marriage.thread_unread(r.id,p.peer,s.through_created_at,s.through_id) else 0 end,
  'lastMessage',case when last.id is not null then jsonb_build_object('body',last.body,'senderIsMe',last.sender_id=me,'createdAt',last.created_at) end)
  order by greatest(r.updated_at,last.created_at) desc,r.id),'[]'::jsonb)
  from marriage.member_requests r cross join lateral (select case when r.requester_id=me then r.recipient_id else r.requester_id end as peer) p
  left join marriage.thread_read_positions s on s.request_id=r.id and s.reader_id=me
  left join lateral (select t.id,t.sender_id,t.body,t.created_at from marriage.thread_messages t where t.request_id=r.id and r.status='accepted' order by t.created_at desc,t.id desc limit 1) last on true
  where me in(r.requester_id,r.recipient_id) and r.status in('pending','accepted') and marriage.is_paid(p.peer) and marriage.compatible(me,p.peer));
end $$;

create or replace function marriage.progress_view(request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid:=marriage.progress_peer(me,$1); p jsonb; mine boolean; theirs boolean; committed boolean; changed_at timestamptz;
begin
 p:=marriage.progress_before_exclusivity($1);
 select exists(select 1 from marriage.exclusive_members e where e.member_id=me and e.request_id=$1) into committed;
 select exists(select 1 from marriage.exclusive_consents c where c.request_id=$1 and c.member_id=me),
  exists(select 1 from marriage.exclusive_consents c where c.request_id=$1 and c.member_id=peer) into mine,theirs;
 select max(events.at) into changed_at from (
  select s.agreed_at as at from marriage.stage_choices s where s.request_id=$1
  union all select c.agreed_at from marriage.exclusive_consents c where c.request_id=$1
 ) events;
 return p||jsonb_build_object('exclusive',committed,'consentMine',mine,'consentPeer',theirs)||
  case when changed_at is not null then jsonb_build_object('updatedAt',changed_at) else '{}'::jsonb end||
  case when (p->>'stage')::int=0 then jsonb_build_object('mine',mine,'peer',theirs) else '{}'::jsonb end;
end $$;

-- Only real changes stamp the tester journey. Polling/read receipts/profile edits do not.
create function nisfayn_test.stamp_journey() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.data->'stage',new.data->'agree',new.data->'exclusiveConsent',new.data->'exclusive') is distinct from
    (old.data->'stage',old.data->'agree',old.data->'exclusiveConsent',old.data->'exclusive') then
  new.data:=new.data||jsonb_build_object('journeyUpdatedAt',clock_timestamp());
 end if;
 if new.data->'matched'='true'::jsonb and old.data->'matched' is distinct from 'true'::jsonb then
  new.data:=new.data||jsonb_build_object('matchedAt',clock_timestamp());
 end if;
 return new;
end $$;
revoke all on function nisfayn_test.stamp_journey() from public,anon,authenticated,service_role;
create trigger stamp_journey before update of data on nisfayn_test.room for each row execute function nisfayn_test.stamp_journey();
