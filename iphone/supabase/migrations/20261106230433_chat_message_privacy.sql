-- Nisfayn only. A deleted message retains its identity/receipt timestamps but
-- never its body. View-once media is redeemed by the recipient through the
-- service worker; there is no authenticated Storage or signed-URL route.
alter table marriage.thread_messages add column deleted_at timestamptz;
create trigger signal_message_delete after update of deleted_at on marriage.thread_messages
 for each row when(old.deleted_at is distinct from new.deleted_at) execute function marriage.signal_community_change();

create function marriage.chat_peer(request_id uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();peer uuid;begin
 select case when r.requester_id=me then r.recipient_id else r.requester_id end into peer
 from marriage.member_requests r where r.id=$1 and r.status='accepted' and me in(r.requester_id,r.recipient_id);
 if peer is null or not marriage.is_paid(peer) or not marriage.compatible(me,peer) then raise exception 'المحادثة غير متاحة.' using errcode='42501';end if;
 return peer;
end $$;
create function marriage.chat_message_json(m marriage.thread_messages,viewer uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'senderIsMe',m.sender_id=viewer,'body',m.body,'createdAt',m.created_at,
  'clientId',case when m.sender_id=viewer then m.client_id end,'deletedAt',m.deleted_at,
  'reply',case when m.deleted_at is null and original.id is not null then
   jsonb_build_object('id',original.id,'body',left(original.body,240),'senderIsMe',original.sender_id=viewer)||
    case when original.deleted_at is not null then jsonb_build_object('deletedAt',original.deleted_at) else '{}'::jsonb end end)
 from (select 1) x left join marriage.thread_messages original on original.id=m.reply_to_id and original.request_id=m.request_id
$$;
create or replace function marriage.thread_page(request_id uuid,before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();boundary timestamptz;begin
 perform marriage.chat_peer($1);
 if before_id is not null then select t.created_at into boundary from marriage.thread_messages t where t.request_id=$1 and t.id=$2;
  if not found then return '[]'::jsonb;end if;end if;
 return coalesce((select jsonb_agg(marriage.chat_message_json(m,me) order by m.created_at,m.id)
  from (select t.* from marriage.thread_messages t where t.request_id=$1 and ($2 is null or (t.created_at,t.id)<(boundary,$2))
   order by t.created_at desc,t.id desc limit 50) m),'[]');
end $$;
create or replace function marriage.thread(request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();begin
 perform marriage.chat_peer($1);
 return coalesce((select jsonb_agg(marriage.chat_message_json(m,me) order by m.created_at,m.id)
  from (select t.* from marriage.thread_messages t where t.request_id=$1 order by t.created_at desc,t.id desc limit 200) m),'[]');
end $$;
create function marriage.message_changes(request_id uuid,message_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();begin
 perform marriage.chat_peer($1);
 if coalesce(cardinality(message_ids),0)>100 then raise exception 'حدّث الرسائل على دفعات أصغر.' using errcode='22023';end if;
 return coalesce((select jsonb_agg(marriage.chat_message_json(m,me) order by m.created_at,m.id)
  from marriage.thread_messages m where m.request_id=$1 and m.id=any($2)),'[]');
end $$;
create function public.marriage_message_changes(request_id uuid,message_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$select marriage.message_changes($1,$2)$$;
create function marriage.delete_message(request_id uuid,message_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();m marriage.thread_messages;r marriage.member_requests;begin
 perform 1 from marriage.members where id=me and not suspended for share;
 if not found then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 select * into r from marriage.member_requests where id=$1 and me in(requester_id,recipient_id);
 if r.id is null then raise exception 'المحادثة غير متاحة.' using errcode='42501';end if;
 perform marriage.lock_member_pair(r.requester_id,r.recipient_id);
 select * into m from marriage.thread_messages t where t.id=$2 and t.request_id=$1 and t.sender_id=me for update;
 if m.id is null then raise exception 'يمكنك حذف رسائلك فقط.' using errcode='42501';end if;
 if m.deleted_at is not null then return true;end if;
 if m.created_at<now()-interval '48 hours' then raise exception 'يمكن الحذف لدى الجميع خلال ٤٨ ساعة من الإرسال.' using errcode='22023';end if;
 update marriage.thread_messages set body='تم حذف هذه الرسالة',reply_to_id=null,deleted_at=clock_timestamp() where id=m.id;
 return true;
end $$;
create function public.marriage_delete_message(request_id uuid,message_id uuid) returns boolean
language sql security invoker set search_path='' as $$select marriage.delete_message($1,$2)$$;

alter table nisfayn_test.media add column view_once boolean not null default false,
 add column opened_at timestamptz,add column deleted_at timestamptz,
 add constraint view_once_photo_only check(not view_once or kind='photo');
create table nisfayn_test.message_deletions(id uuid primary key,actor text not null check(actor in('abdulrahman','reham')),
 deleted_at timestamptz not null default clock_timestamp());
alter table nisfayn_test.message_deletions enable row level security;
revoke all on nisfayn_test.message_deletions from public,anon,authenticated,service_role;
create table nisfayn_test.chat_cleanup(path text primary key,available_at timestamptz not null default now());
alter table nisfayn_test.chat_cleanup enable row level security;
revoke all on nisfayn_test.chat_cleanup from public,anon,authenticated,service_role;
create function marriage.test_chat_cleanup_batch() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(path),'[]') from (select path from nisfayn_test.chat_cleanup where available_at<=now() order by available_at limit 100) q
$$;
create function marriage.test_chat_cleanup_done(paths text[]) returns void language sql security definer set search_path='' as $$
 delete from nisfayn_test.chat_cleanup where path=any($1) and available_at<=now()
$$;
create function public.nisfayn_chat_cleanup_batch() returns jsonb language sql security invoker set search_path='' as $$select marriage.test_chat_cleanup_batch()$$;
create function public.nisfayn_chat_cleanup_done(paths text[]) returns void language sql security invoker set search_path='' as $$select marriage.test_chat_cleanup_done($1)$$;

create function nisfayn_test.chat_messages(items jsonb) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(case when gone.id is not null then
  (m-'body'-'attachment'-'reply')||jsonb_build_object('body','تم حذف هذه الرسالة','deletedAt',gone.deleted_at)
 else m||case when media.view_once then jsonb_build_object('attachment',(m->'attachment')||
  jsonb_build_object('viewOnce',true,'openedAt',media.opened_at)) else '{}'::jsonb end||
  case when quote_gone.id is not null then jsonb_build_object('reply',(m->'reply')||jsonb_build_object('body','تم حذف هذه الرسالة','deletedAt',quote_gone.deleted_at))
  else '{}'::jsonb end end order by ord),'[]')
 from jsonb_array_elements(coalesce(items,'[]')) with ordinality rows(m,ord)
 left join nisfayn_test.message_deletions gone on gone.id::text=m->>'id'
 left join nisfayn_test.message_deletions quote_gone on quote_gone.id::text=m#>>'{reply,id}'
 left join nisfayn_test.media media on media.id::text=m#>>'{attachment,id}'
$$;
-- Sanitize persisted JSON as well as API output, so subsequent legacy updates
-- cannot reintroduce copied reply text or an attachment removed by its sender.
create function nisfayn_test.redact_room_messages() returns trigger language plpgsql security definer set search_path='' as $$begin
 new.data:=jsonb_set(new.data,'{messages}',nisfayn_test.chat_messages(new.data->'messages'));return new;
end $$;
create trigger redact_chat_messages before update on nisfayn_test.room for each row execute function nisfayn_test.redact_room_messages();

alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_chat_privacy;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;d jsonb;result jsonb;m jsonb;media nisfayn_test.media;once_only boolean;deleted_path text;stamp timestamptz;
begin
 if action in('message_delete','media_open','media_url','media_reserve','media_publish','send') then
  select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
  if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
  -- Deleting one's own content remains possible after the match closes or access
  -- expires; it never depends on the recipient being online/approved/available.
  perform 1 from marriage.admin_test_members where actor=who and not suspended for share;
  if not found then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
  select data into d from nisfayn_test.room where id for update;
  if action='message_delete' then
   select value into m from jsonb_array_elements(d->'messages') where value->>'id'=payload->>'id' and value->>'sender'=who;
   if m is null then raise exception 'يمكنك حذف رسائلك فقط.' using errcode='42501';end if;
   if not exists(select 1 from nisfayn_test.message_deletions where id=(m->>'id')::uuid) then
    if (m->>'createdAt')::timestamptz<now()-interval '48 hours' then raise exception 'يمكن الحذف لدى الجميع خلال ٤٨ ساعة من الإرسال.' using errcode='22023';end if;
    insert into nisfayn_test.message_deletions(id,actor) values((m->>'id')::uuid,who);
    update nisfayn_test.media set deleted_at=clock_timestamp() where id=(m->>'id')::uuid and actor=who returning path into deleted_path;
    if deleted_path is not null then insert into nisfayn_test.chat_cleanup(path) values(deleted_path)
     on conflict(path) do update set available_at=least(nisfayn_test.chat_cleanup.available_at,now());end if;
   else select path into deleted_path from nisfayn_test.media where id=(m->>'id')::uuid and deleted_at is not null;end if;
   update nisfayn_test.room set data=d where id returning data into d;
   -- Return only the existing state route when permitted so normal profile
   -- filtering/revision metadata remain unchanged. Closed accounts receive an ACK.
   begin result:=nisfayn_test.rpc_before_chat_privacy('state',session_token,'{}');
   exception when insufficient_privilege then result:=jsonb_build_object('ok',true);end;
   if deleted_path is not null then result:=result||jsonb_build_object('_deletedMediaPath',deleted_path);end if;
  elsif action in('media_url','media_open') then
   -- Existing read path validates session/account/peer/match before returning a path.
   perform nisfayn_test.rpc_before_chat_privacy('media_url',session_token,payload);
   select * into media from nisfayn_test.media where id=(payload->>'id')::uuid and ready for update;
   if media.id is null or media.deleted_at is not null then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
   if action='media_url' then
    if media.view_once then raise exception 'هذه الصورة متاحة للعرض مرة واحدة فقط.' using errcode='42501';end if;
   else
    if not media.view_once or media.kind<>'photo' or media.actor=who or media.opened_at is not null then
     raise exception 'الصورة غير متاحة للفتح مرة أخرى.' using errcode='42501';end if;
    if coalesce(d#>>'{seriousness,status}','none') not in('accepted','family') or
     d#>>'{seriousness,status}'='accepted' and not coalesce((d#>>'{seriousness,deadline}')::timestamptz>now(),false) then
     raise exception 'أكملا اتفاق الجدية والمدة قبل بدء التواصل.' using errcode='42501';end if;
    stamp:=clock_timestamp();
    update nisfayn_test.media stored set opened_at=stamp where stored.id=(payload->>'id')::uuid;
    insert into nisfayn_test.chat_cleanup(path,available_at) values(media.path,now()+interval '10 minutes') on conflict do nothing;
    update nisfayn_test.room set data=d where id;
   end if;
   return jsonb_build_object('path',media.path,'mime',media.mime);
  elsif action='media_reserve' then
   if payload?'viewOnce' and jsonb_typeof(payload->'viewOnce')<>'boolean' then raise exception 'خيار عرض الصورة غير صالح.' using errcode='22023';end if;
   once_only:=coalesce((payload->>'viewOnce')::boolean,false);
   if once_only and coalesce(payload->>'mime','') not like 'image/%' then raise exception 'العرض لمرة واحدة متاح للصور فقط.' using errcode='22023';end if;
   if exists(select 1 from nisfayn_test.message_deletions where id=(payload->>'id')::uuid) then raise exception 'تم حذف هذه الرسالة.' using errcode='42501';end if;
   select * into media from nisfayn_test.media where id=(payload->>'id')::uuid;
   if media.id is not null and (media.view_once<>once_only or media.deleted_at is not null) then raise exception 'لا يمكن تغيير خيار العرض أثناء إعادة المحاولة.' using errcode='22023';end if;
   result:=nisfayn_test.rpc_before_chat_privacy(action,session_token,payload);
   update nisfayn_test.media set view_once=once_only where id=(payload->>'id')::uuid and actor=who;
  else
   if exists(select 1 from nisfayn_test.message_deletions where id=(case when action='send' then payload->>'clientId' else payload->>'id' end)::uuid) then
    raise exception 'تم حذف هذه الرسالة.' using errcode='42501';end if;
   result:=nisfayn_test.rpc_before_chat_privacy(action,session_token,payload);
  end if;
 else result:=nisfayn_test.rpc_before_chat_privacy(action,session_token,payload);end if;
 if result?'messages' then result:=jsonb_set(result,'{messages}',nisfayn_test.chat_messages(result->'messages'));end if;
 return result;
end $$;

revoke all on function marriage.chat_peer(uuid),marriage.chat_message_json(marriage.thread_messages,uuid),
 marriage.message_changes(uuid,uuid[]),public.marriage_message_changes(uuid,uuid[]),marriage.delete_message(uuid,uuid),public.marriage_delete_message(uuid,uuid),
 marriage.test_chat_cleanup_batch(),marriage.test_chat_cleanup_done(text[]),public.nisfayn_chat_cleanup_batch(),public.nisfayn_chat_cleanup_done(text[]),
 nisfayn_test.chat_messages(jsonb),nisfayn_test.redact_room_messages(),nisfayn_test.rpc_before_chat_privacy(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function marriage.message_changes(uuid,uuid[]),public.marriage_message_changes(uuid,uuid[]),
 marriage.delete_message(uuid,uuid),public.marriage_delete_message(uuid,uuid) to authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb),marriage.test_chat_cleanup_batch(),marriage.test_chat_cleanup_done(text[]),
 public.nisfayn_chat_cleanup_batch(),public.nisfayn_chat_cleanup_done(text[]) to service_role;
