-- Realtime sends empty invalidations. All message bodies still pass through the
-- authenticated, paid and mutually accepted member RPCs on every read.
create policy nisfayn_receive_own_member_changes on realtime.messages
  for select to authenticated
  using (extension = 'broadcast'
    and topic = (select realtime.topic())
    and (select realtime.topic()) = 'marriage:member:' || (select auth.uid())::text);

create function marriage.signal_community_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare a uuid; b uuid;
begin
  if tg_table_name='thread_messages' then
    select r.requester_id,r.recipient_id into strict a,b
    from marriage.member_requests r where r.id=new.request_id;
  else
    a:=new.requester_id;
    b:=new.recipient_id;
  end if;
  begin
    perform realtime.send('{}'::jsonb,'changed','marriage:member:'||a::text,true);
    perform realtime.send('{}'::jsonb,'changed','marriage:member:'||b::text,true);
  exception when others then
    -- The durable message/request is authoritative. Clients also refresh on
    -- reconnect and on a timer when socket delivery is unavailable.
    raise log 'Nisfayn realtime notification deferred (SQLSTATE %)', sqlstate;
  end;
  return new;
end $$;
revoke all on function marriage.signal_community_change() from public, anon, authenticated;
create trigger signal_message_insert after insert on marriage.thread_messages
  for each row execute function marriage.signal_community_change();
create trigger signal_request_insert after insert on marriage.member_requests
  for each row execute function marriage.signal_community_change();
create trigger signal_request_status after update of status on marriage.member_requests
  for each row when (old.status is distinct from new.status) execute function marriage.signal_community_change();

create function marriage.thread_page(request_id uuid,before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid; boundary timestamptz;
begin
  select case when r.requester_id=me then r.recipient_id else r.requester_id end into peer
  from marriage.member_requests r where r.id=$1 and r.status='accepted' and me in(r.requester_id,r.recipient_id);
  if peer is null or not marriage.is_paid(peer) or not marriage.compatible(me,peer) then
    raise exception 'المحادثة غير متاحة.' using errcode='42501';
  end if;
  if before_id is not null then
    select t.created_at into boundary from marriage.thread_messages t where t.request_id=$1 and t.id=$2;
    if not found then return '[]'::jsonb; end if;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'senderIsMe',m.sender_id=me,
    'body',m.body,'createdAt',m.created_at,'clientId',case when m.sender_id=me then m.client_id end)
    order by m.created_at,m.id),'[]'::jsonb)
    from (select t.id,t.sender_id,t.client_id,t.body,t.created_at from marriage.thread_messages t
      where t.request_id=$1 and ($2 is null or (t.created_at,t.id)<(boundary,$2))
      order by t.created_at desc,t.id desc limit 50) m);
end $$;
create function public.marriage_thread_page(request_id uuid,before_id uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select marriage.thread_page($1,$2) $$;
revoke all on function marriage.thread_page(uuid,uuid),public.marriage_thread_page(uuid,uuid) from public,anon;
grant execute on function marriage.thread_page(uuid,uuid),public.marriage_thread_page(uuid,uuid) to authenticated;

create or replace function marriage.inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,
    'direction',case when r.requester_id=me then 'outgoing' else 'incoming' end,
    'person',marriage.member_card(me,p.peer),
    'lastMessage',case when last.id is not null then jsonb_build_object('body',last.body,
      'senderIsMe',last.sender_id=me,'createdAt',last.created_at) end)
    order by greatest(r.updated_at,last.created_at) desc,r.id),'[]'::jsonb)
    from marriage.member_requests r cross join lateral (select case when r.requester_id=me
      then r.recipient_id else r.requester_id end as peer) p
    left join lateral (select t.id,t.sender_id,t.body,t.created_at from marriage.thread_messages t
      where t.request_id=r.id and r.status='accepted' order by t.created_at desc,t.id desc limit 1) last on true
    where me in(r.requester_id,r.recipient_id) and r.status in ('pending','accepted')
      and marriage.is_paid(p.peer) and marriage.compatible(me,p.peer));
end $$;
