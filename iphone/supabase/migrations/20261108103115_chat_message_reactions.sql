-- One private reaction per member and message. Clients receive only aggregates;
-- the existing thread authorization remains the only read path.
create table marriage.message_reactions (
 message_id uuid not null references marriage.thread_messages(id) on delete cascade,
 member_id uuid not null references marriage.members(id) on delete cascade,
 emoji text not null check(emoji in('❤️','😂','😮','😢','🙏','👍')),
 primary key(message_id,member_id)
);
create index message_reactions_member on marriage.message_reactions(member_id);
alter table marriage.message_reactions enable row level security;
revoke all on marriage.message_reactions from public,anon,authenticated,service_role;

create function marriage.message_reactions_json(message_id uuid,viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.n,'mine',r.mine)
  order by array_position(array['❤️','😂','😮','😢','🙏','👍'],r.emoji)),'[]'::jsonb)
 from (select emoji,count(*) n,bool_or(member_id=$2) mine from marriage.message_reactions
  where message_id=$1 group by emoji) r
$$;

create or replace function marriage.chat_message_json(m marriage.thread_messages,viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'senderIsMe',m.sender_id=viewer,'body',m.body,'createdAt',m.created_at,
  'clientId',case when m.sender_id=viewer then m.client_id end,'deletedAt',m.deleted_at,
  'reactions',case when m.deleted_at is null then marriage.message_reactions_json(m.id,viewer) else '[]'::jsonb end,
  'reply',case when m.deleted_at is null and original.id is not null then
   jsonb_build_object('id',original.id,'body',left(original.body,240),'senderIsMe',original.sender_id=viewer)||
    case when original.deleted_at is not null then jsonb_build_object('deletedAt',original.deleted_at) else '{}'::jsonb end end)
 from (select 1) x left join marriage.thread_messages original on original.id=m.reply_to_id and original.request_id=m.request_id
$$;

create function marriage.react_to_message(request_id uuid,message_id uuid,reaction text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();peer uuid;r marriage.member_requests;m marriage.thread_messages;changed integer;
begin
 select * into r from marriage.member_requests where id=$1 and me in(requester_id,recipient_id);
 if r.id is null then raise exception 'المحادثة غير متاحة.' using errcode='42501';end if;
 perform marriage.lock_member_pair(r.requester_id,r.recipient_id);
 -- Serialize with ending a connection and deleting the target message, then
 -- recheck current membership, availability and payment under the pair lock.
 perform 1 from marriage.member_requests where id=$1 for update;
 peer:=marriage.chat_peer($1);
 if reaction is not null and reaction not in('❤️','😂','😮','😢','🙏','👍') then
  raise exception 'اختر تفاعلاً متاحًا.' using errcode='22023';end if;
 select * into m from marriage.thread_messages t where t.id=$2 and t.request_id=$1 for update;
 if m.id is null or m.deleted_at is not null then raise exception 'الرسالة غير متاحة للتفاعل.' using errcode='42501';end if;
 if reaction is null then
  delete from marriage.message_reactions existing where existing.message_id=$2 and existing.member_id=me;
 else
  insert into marriage.message_reactions(message_id,member_id,emoji) values($2,me,$3)
   on conflict on constraint message_reactions_pkey do update set emoji=excluded.emoji
   where marriage.message_reactions.emoji is distinct from excluded.emoji;
 end if;
 get diagnostics changed=row_count;
 if changed>0 then
  begin
   perform realtime.send('{}'::jsonb,'changed','marriage:member:'||me::text,true);
   perform realtime.send('{}'::jsonb,'changed','marriage:member:'||peer::text,true);
  exception when others then
   raise log 'Nisfayn reaction notification deferred (SQLSTATE %)',sqlstate;
  end;
 end if;
 return marriage.message_reactions_json($2,me);
end $$;

create function public.marriage_react_to_message(request_id uuid,message_id uuid,reaction text default null) returns jsonb
language sql security invoker set search_path='' as $$select marriage.react_to_message($1,$2,$3)$$;

create function marriage.clear_deleted_message_reactions() returns trigger
language plpgsql security definer set search_path='' as $$begin
 delete from marriage.message_reactions where message_id=new.id;return new;
end $$;
create trigger clear_deleted_message_reactions after update of deleted_at on marriage.thread_messages
 for each row when(new.deleted_at is not null and old.deleted_at is distinct from new.deleted_at)
 execute function marriage.clear_deleted_message_reactions();

revoke all on function marriage.message_reactions_json(uuid,uuid),marriage.react_to_message(uuid,uuid,text),
 public.marriage_react_to_message(uuid,uuid,text),marriage.clear_deleted_message_reactions()
 from public,anon,authenticated,service_role;
grant execute on function marriage.react_to_message(uuid,uuid,text),public.marriage_react_to_message(uuid,uuid,text) to authenticated;
