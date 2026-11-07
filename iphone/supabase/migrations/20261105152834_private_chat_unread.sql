create table marriage.thread_read_positions (
  request_id uuid not null references marriage.member_requests(id) on delete cascade,
  reader_id uuid not null references marriage.members(id) on delete cascade,
  through_id uuid not null,
  through_created_at timestamptz not null,
  primary key (request_id,reader_id)
);
alter table marriage.thread_read_positions enable row level security;
revoke all on marriage.thread_read_positions from public, anon, authenticated;
create index thread_read_positions_reader on marriage.thread_read_positions(reader_id);
create index thread_messages_unread on marriage.thread_messages(request_id,sender_id,created_at,id);

-- Message writers already serialize on the relationship before inserting. Stamp after that
-- lock, so a transaction that waited for a writer cannot post behind an existing read cursor.
alter table marriage.thread_messages alter column created_at set default clock_timestamp();

create function marriage.thread_unread(request_key uuid,peer_id uuid,seen_at timestamptz,seen_id uuid)
returns integer language sql stable set search_path='' as $$
  select count(*)::integer from marriage.thread_messages m
  where m.request_id=$1 and m.sender_id=$2 and (m.created_at,m.id) >
    (coalesce($3,'-infinity'::timestamptz),coalesce($4,'00000000-0000-0000-0000-000000000000'::uuid))
$$;
revoke all on function marriage.thread_unread(uuid,uuid,timestamptz,uuid) from public,anon,authenticated;

create function marriage.mark_thread_read(request_id uuid,through_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid; seen_at timestamptz;
begin
  select case when r.requester_id=me then r.recipient_id else r.requester_id end into peer
  from marriage.member_requests r where r.id=$1 and r.status='accepted'
    and me in(r.requester_id,r.recipient_id) for share;
  if peer is null or not marriage.is_paid(peer) or not marriage.compatible(me,peer) then
    raise exception 'المحادثة غير متاحة.' using errcode='42501';
  end if;
  select m.created_at into seen_at from marriage.thread_messages m where m.request_id=$1 and m.id=$2;
  if not found then raise exception 'الرسالة غير متاحة في هذه المحادثة.' using errcode='22023'; end if;

  insert into marriage.thread_read_positions as stored(request_id,reader_id,through_id,through_created_at)
  values ($1,me,$2,seen_at)
  on conflict on constraint thread_read_positions_pkey do update
    set through_id=excluded.through_id,through_created_at=excluded.through_created_at
    where (stored.through_created_at,stored.through_id)<(excluded.through_created_at,excluded.through_id);
  if not found then return false; end if;
  begin
    perform realtime.send('{}'::jsonb,'changed','marriage:member:'||me::text,true);
  exception when others then
    raise log 'Nisfayn read signal deferred (SQLSTATE %)', sqlstate;
  end;
  return true;
end $$;

create function marriage.unread_count() returns integer
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
  return (select coalesce(sum(marriage.thread_unread(r.id,p.peer,s.through_created_at,s.through_id)),0)::integer
    from marriage.member_requests r
    cross join lateral (select case when r.requester_id=me then r.recipient_id else r.requester_id end as peer) p
    left join marriage.thread_read_positions s on s.request_id=r.id and s.reader_id=me
    where r.status='accepted' and me in (r.requester_id,r.recipient_id)
      and marriage.is_paid(p.peer) and marriage.compatible(me,p.peer));
end $$;

create or replace function marriage.inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,
    'direction',case when r.requester_id=me then 'outgoing' else 'incoming' end,
    'person',marriage.member_card(me,p.peer),
    'unreadCount',case when r.status='accepted' then marriage.thread_unread(r.id,p.peer,s.through_created_at,s.through_id) else 0 end,
    'lastMessage',case when last.id is not null then jsonb_build_object('body',last.body,
      'senderIsMe',last.sender_id=me,'createdAt',last.created_at) end)
    order by greatest(r.updated_at,last.created_at) desc,r.id),'[]'::jsonb)
    from marriage.member_requests r cross join lateral (select case when r.requester_id=me
      then r.recipient_id else r.requester_id end as peer) p
    left join marriage.thread_read_positions s on s.request_id=r.id and s.reader_id=me
    left join lateral (select t.id,t.sender_id,t.body,t.created_at from marriage.thread_messages t
      where t.request_id=r.id and r.status='accepted' order by t.created_at desc,t.id desc limit 1) last on true
    where me in(r.requester_id,r.recipient_id) and r.status in ('pending','accepted')
      and marriage.is_paid(p.peer) and marriage.compatible(me,p.peer));
end $$;

create function public.marriage_mark_thread_read(request_id uuid,through_id uuid)
returns boolean language sql security invoker set search_path='' as $$ select marriage.mark_thread_read($1,$2) $$;
create function public.marriage_unread_count()
returns integer language sql stable security invoker set search_path='' as $$ select marriage.unread_count() $$;
revoke all on function marriage.mark_thread_read(uuid,uuid),marriage.unread_count(),
  public.marriage_mark_thread_read(uuid,uuid),public.marriage_unread_count() from public,anon,authenticated;
grant execute on function marriage.mark_thread_read(uuid,uuid),marriage.unread_count(),
  public.marriage_mark_thread_read(uuid,uuid),public.marriage_unread_count() to authenticated;
