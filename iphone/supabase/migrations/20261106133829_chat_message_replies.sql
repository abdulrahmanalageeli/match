-- Replies retain a server-validated reference, never client-supplied quoted text.
alter table marriage.thread_messages add column reply_to_id uuid
  references marriage.thread_messages(id) on delete set null;
create index thread_messages_reply_to on marriage.thread_messages(reply_to_id) where reply_to_id is not null;

create function marriage.reply_message(request_id uuid,message_body text,client_id uuid,reply_to_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); prior uuid; sent uuid;
begin
  perform marriage.lock_member_pair(r.requester_id,r.recipient_id) from marriage.member_requests r
    where r.id=$1 and me in(r.requester_id,r.recipient_id);
  select t.id into prior from marriage.thread_messages t
    where t.request_id=$1 and t.sender_id=me and t.client_id=$3;
  -- Reuse existing membership, request locking, validation and idempotency checks.
  sent:=marriage.message($1,$2,$3);
  if prior is not null then
    if (select t.reply_to_id from marriage.thread_messages t where t.id=sent) is distinct from $4 then
      raise exception 'استُخدم معرّف الإرسال لرد آخر.' using errcode='22023';
    end if;
    return sent;
  end if;
  if $4 is null or $4=sent or not exists(select 1 from marriage.thread_messages t where t.id=$4 and t.request_id=$1) then
    raise exception 'الرسالة الأصلية غير متاحة في هذه المحادثة.' using errcode='22023';
  end if;
  update marriage.thread_messages t set reply_to_id=$4 where t.id=sent;
  return sent;
end $$;
create function public.marriage_reply(request_id uuid,message_body text,client_id uuid,reply_to_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select marriage.reply_message($1,$2,$3,$4) $$;
revoke all on function marriage.reply_message(uuid,text,uuid,uuid),public.marriage_reply(uuid,text,uuid,uuid) from public,anon;
grant execute on function marriage.reply_message(uuid,text,uuid,uuid),public.marriage_reply(uuid,text,uuid,uuid) to authenticated;

create or replace function marriage.thread_page(request_id uuid,before_id uuid default null) returns jsonb
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
    'body',m.body,'createdAt',m.created_at,'clientId',case when m.sender_id=me then m.client_id end,
    'reply',case when original.id is not null then jsonb_build_object('id',original.id,
      'body',left(original.body,240),'senderIsMe',original.sender_id=me) end)
    order by m.created_at,m.id),'[]'::jsonb)
    from (select t.* from marriage.thread_messages t
      where t.request_id=$1 and ($2 is null or (t.created_at,t.id)<(boundary,$2))
      order by t.created_at desc,t.id desc limit 50) m
    left join marriage.thread_messages original on original.id=m.reply_to_id and original.request_id=m.request_id);
end $$;

-- The isolated pair preview stores its messages as JSON; preserve the same contract.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_replies;
revoke all on function nisfayn_test.rpc_before_replies(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text; d jsonb; original jsonb; prior jsonb; quoted jsonb; result jsonb; target uuid; cid uuid;
begin
  if action<>'send' or nullif(payload->>'replyToId','') is null then
    return nisfayn_test.rpc_before_replies(action,session_token,payload);
  end if;
  select s.actor into who from nisfayn_test.sessions s where s.token_hash=sha256(session_token::bytea) and s.expires_at>now();
  if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501'; end if;
  target:=(payload->>'replyToId')::uuid; cid:=(payload->>'clientId')::uuid;
  select data into d from nisfayn_test.room where id for update;
  select m into prior from jsonb_array_elements(d->'messages') m where m->>'id'=cid::text and m->>'sender'=who;
  if prior is not null then
    if prior#>>'{reply,id}' is distinct from target::text then raise exception 'استُخدم معرّف الإرسال لرد آخر.'; end if;
    return nisfayn_test.rpc_before_replies(action,session_token,payload);
  end if;
  if target=cid or (select count(*) from jsonb_array_elements(d->'messages') m where m->>'id'=target::text)<>1 then
    raise exception 'الرسالة الأصلية غير متاحة في هذه المحادثة.';
  end if;
  select m into original from jsonb_array_elements(d->'messages') m where m->>'id'=target::text;
  quoted:=jsonb_build_object('id',target,'sender',original->>'sender','body',
    case original#>>'{attachment,kind}' when 'photo' then 'صورة' when 'audio' then 'رسالة صوتية' else left(original->>'body',240) end);
  result:=nisfayn_test.rpc_before_replies(action,session_token,payload);
  result:=jsonb_set(result,'{messages}',(select jsonb_agg(
    case when m->>'id'=cid::text and m->>'sender'=who then m||jsonb_build_object('reply',quoted) else m end order by ord)
    from jsonb_array_elements(result->'messages') with ordinality as rows(m,ord)));
  update nisfayn_test.room set data=result-'actor' where id;
  return result;
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
