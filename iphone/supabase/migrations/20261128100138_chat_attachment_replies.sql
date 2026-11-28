-- Reply metadata is written atomically with the published message. Never duplicate media bytes or URLs.
alter table marriage.thread_messages add column reply_at_seconds integer check (reply_at_seconds between 0 and 59);
alter table marriage.chat_media add column reply_to_id uuid, add column reply_at_seconds integer;

create function marriage.validate_chat_quote(room uuid, target uuid, at_seconds integer) returns void
language plpgsql set search_path='' as $$
begin
 if target is null and at_seconds is null then return; end if;
 if not exists (select 1 from marriage.thread_messages m where m.request_id=room and m.id=target and m.deleted_at is null) then
  raise exception 'الرسالة الأصلية غير متاحة.' using errcode='22023';
 end if;
 if at_seconds is not null and not exists (
  select 1 from marriage.chat_media a where a.request_id=room and a.id=target and a.kind='audio'
  and a.published_at is not null and at_seconds>=0 and at_seconds<a.duration
 ) then raise exception 'موضع التسجيل غير متاح.' using errcode='22023'; end if;
end $$;
revoke all on function marriage.validate_chat_quote(uuid,uuid,integer) from public,anon,authenticated,service_role;

create function marriage.reply_at(request_id uuid,message_body text,client_id uuid,reply_to_id uuid,at_seconds integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); previous marriage.thread_messages; sent uuid;
begin
 perform marriage.lock_member_pair(r.requester_id,r.recipient_id) from marriage.member_requests r
 where r.id=$1 and me in(r.requester_id,r.recipient_id);
 select * into previous from marriage.thread_messages m where m.request_id=$1 and m.sender_id=me and m.client_id=$3;
 sent:=marriage.reply_message($1,$2,$3,$4);
 if $5 is null then raise exception 'موضع التسجيل غير متاح.' using errcode='22023'; end if;
 if previous.id is not null then
  if previous.reply_at_seconds is distinct from $5 then raise exception 'استُخدم معرّف الإرسال لرد آخر.' using errcode='22023'; end if;
 else
  perform marriage.validate_chat_quote($1,$4,$5);
  update marriage.thread_messages set reply_at_seconds=$5 where id=sent;
 end if;
 return sent;
end $$;
create function public.marriage_reply_at(request_id uuid,message_body text,client_id uuid,reply_to_id uuid,at_seconds integer) returns uuid
language sql security invoker set search_path='' as $$select marriage.reply_at($1,$2,$3,$4,$5)$$;
revoke all on function public.marriage_reply_at(uuid,text,uuid,uuid,integer), marriage.reply_at(uuid,text,uuid,uuid,integer) from public,anon;
grant execute on function public.marriage_reply_at(uuid,text,uuid,uuid,integer), marriage.reply_at(uuid,text,uuid,uuid,integer) to authenticated;

create or replace function marriage.chat_message_json(m marriage.thread_messages, viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select case when m.reply_at_seconds is not null and m.deleted_at is null and j#>>'{reply,id}' is not null and j#>>'{reply,deletedAt}' is null
   then jsonb_set(j,'{reply,atSeconds}',to_jsonb(m.reply_at_seconds)) else j end
 from (select marriage.chat_message_before_device_receipt(m,viewer) || jsonb_build_object('deliveredAt',m.device_delivered_at) as j) as projected
$$;

create or replace function marriage.chat_media_action(action text,request_id uuid,media_id uuid default null,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();peer uuid;r marriage.member_requests;item marriage.chat_media;
 media_kind text;media_mime text;media_size integer;media_duration numeric;once_only boolean;object_metadata jsonb;
begin
 select * into r from marriage.member_requests where id=$2 and me in(requester_id,recipient_id);
 if r.id is null or media_id is null then raise exception 'الملف غير متاح.' using errcode='42501';end if;
 perform marriage.lock_member_pair(r.requester_id,r.recipient_id);
 select * into item from marriage.chat_media where id=$3 for update;
 if item.id is not null and (item.request_id<>$2 or (action in('prepare','commit','abort') and item.sender_id<>me)) then
  raise exception 'الملف غير متاح.' using errcode='42501';end if;
 if action='abort' then
  if item.id is null or item.published_at is not null then return jsonb_build_object('path',null);end if;
  delete from marriage.chat_media where id=item.id;
  return jsonb_build_object('path',item.path);
 end if;
 peer:=marriage.chat_peer($2);
 perform marriage.require_communication_agreement($2);
 if action='prepare' then
  media_kind:=payload->>'kind';media_mime:=payload->>'mime';
  if jsonb_typeof(payload->'size') is distinct from 'number' or (payload->>'size')::numeric<>trunc((payload->>'size')::numeric)
   or (payload->>'size')::numeric not between 12 and 8388608
   or media_kind is null or media_kind not in('photo','audio')
   or media_mime is null or not ((media_kind='photo' and media_mime in('image/jpeg','image/png','image/webp'))
    or (media_kind='audio' and media_mime in('audio/webm','audio/mp4','audio/ogg','audio/wav'))) then
   raise exception 'نوع الملف أو حجمه غير صالح.' using errcode='22023';end if;
  media_size:=(payload->>'size')::integer;
  once_only:=coalesce((payload->>'viewOnce')::boolean,false);
  if media_kind='audio' then
   if jsonb_typeof(payload->'duration') is distinct from 'number' or (payload->>'duration')::numeric not between 0 and 60 then
    raise exception 'مدة الرسالة الصوتية القصوى دقيقة واحدة.' using errcode='22023';end if;
   media_duration:=(payload->>'duration')::numeric;
  end if;
  if once_only and media_kind<>'photo' then raise exception 'العرض لمرة واحدة للصور فقط.' using errcode='22023';end if;
  if item.id is not null then
   if item.reply_to_id is distinct from (payload->>'replyToId')::uuid
      or item.reply_at_seconds is distinct from (payload->>'atSeconds')::integer then
    raise exception 'استُخدم معرّف الإرسال لرد آخر.' using errcode='22023'; end if;
   if item.kind<>media_kind or item.mime<>media_mime or item.size<>media_size or item.duration is distinct from media_duration or item.view_once<>once_only then
    raise exception 'استُخدم معرّف الملف لمحتوى آخر.' using errcode='22023';end if;
   if exists(select 1 from marriage.thread_messages where id=item.id and deleted_at is not null) then raise exception 'حُذفت هذه الرسالة.' using errcode='42501';end if;
   return jsonb_build_object('id',item.id,'path',item.path,'already',item.published_at is not null,'resume',item.published_at is null);
  end if;
  if (select count(*) from marriage.chat_media where sender_id=me and created_at>now()-interval '1 day')>=100
   or (select count(*) from marriage.chat_media where sender_id=me and published_at is null)>=10 then
   raise exception 'وصلت إلى حد الملفات. حاول لاحقًا.' using errcode='54000';end if;
  perform marriage.validate_chat_quote($2,(payload->>'replyToId')::uuid,(payload->>'atSeconds')::integer);
  insert into marriage.chat_media(id,request_id,sender_id,path,kind,mime,size,duration,view_once,reply_to_id,reply_at_seconds)
   values($3,$2,me,$2::text||'/'||me::text||'/'||$3::text,media_kind,media_mime,media_size,media_duration,once_only,(payload->>'replyToId')::uuid,(payload->>'atSeconds')::integer) returning * into item;
  return jsonb_build_object('id',item.id,'path',item.path,'already',false,'resume',false);
 end if;
 if item.id is null then raise exception 'الملف غير متاح.' using errcode='42501';end if;
 if action='commit' then
  if item.published_at is not null then return jsonb_build_object('id',item.id);end if;
  select metadata into object_metadata from storage.objects where bucket_id='nisfayn-member-chat' and name=item.path;
  if object_metadata is null or (object_metadata->>'size')::bigint is distinct from item.size::bigint
   or object_metadata->>'mimetype' is distinct from item.mime then raise exception 'لم يكتمل رفع الملف.' using errcode='22023';end if;
  perform marriage.validate_chat_quote($2,item.reply_to_id,item.reply_at_seconds);
  insert into marriage.thread_messages(id,request_id,sender_id,client_id,reply_to_id,reply_at_seconds,body)
   values(item.id,item.request_id,me,item.id,item.reply_to_id,item.reply_at_seconds,
   case when item.kind='audio' then 'رسالة صوتية' when item.view_once then 'صورة لمرة واحدة' else 'صورة' end);
  update marriage.chat_media set published_at=now() where id=item.id;
  return jsonb_build_object('id',item.id);
 end if;
 if action not in('access','inspect','open','viewed') or item.published_at is null or not exists(select 1 from marriage.thread_messages where id=item.id and deleted_at is null) then
  raise exception 'الملف غير متاح.' using errcode='42501';end if;
 if action in ('inspect','viewed') then
  if not item.view_once or item.sender_id=me then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
  if action='inspect' and item.opened_at is null then
   return jsonb_build_object('path',item.path,'mime',item.mime,'size',item.size);
  elsif action='viewed' and item.opened_at is not null then
   update marriage.chat_media set viewed_at=clock_timestamp() where id=item.id and viewed_at is null;
   if found then
    begin perform realtime.send('{}','changed','marriage:member:'||peer::text,true);
    exception when others then raise log 'Media confirmation notification deferred (%)',sqlstate;end;
   end if;
   return jsonb_build_object('ok',true);
  end if;
  raise exception 'الصورة غير متاحة.' using errcode='42501';
 end if;
 if item.view_once and me<>item.sender_id then
  if action<>'open' or item.opened_at is not null then raise exception 'هذه الصورة متاحة لمرة واحدة فقط.' using errcode='42501';end if;
  update marriage.chat_media set opened_at=clock_timestamp() where id=item.id;
  begin
   perform realtime.send('{}'::jsonb,'changed','marriage:member:'||me::text,true);
   perform realtime.send('{}'::jsonb,'changed','marriage:member:'||peer::text,true);
  exception when others then raise log 'Member media open notification deferred (SQLSTATE %)',sqlstate;end;
 elsif action='open' and not item.view_once then raise exception 'الصورة ليست لمرة واحدة.' using errcode='22023';end if;
 return jsonb_build_object('id',item.id,'path',item.path,'mime',item.mime);
end $$;

-- The hosted demonstration pair keeps its conversations in a separate, service-only room.
alter table nisfayn_test.media add column reply_to_id uuid, add column reply_at_seconds integer;
create function public.nisfayn_test_chat_reply(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text; room jsonb; target uuid; seconds integer; cid uuid; item nisfayn_test.media;
 original jsonb; prior jsonb; quote jsonb; result jsonb; new_messages jsonb;
begin
 if action not in ('send','media_reserve','media_publish') then
  raise exception 'طلب غير صالح.' using errcode='22023';
 end if;
 select s.actor into who from nisfayn_test.sessions s where s.token_hash=sha256(session_token::bytea) and s.expires_at>now();
 if who is null then raise exception 'انتهت الجلسة.' using errcode='42501'; end if;
 select data into room from nisfayn_test.room where id for update;
 cid:=case when action='send' then (payload->>'clientId')::uuid else (payload->>'id')::uuid end;
 if action<>'send' then select * into item from nisfayn_test.media where id=cid and actor=who; end if;
 if action='media_publish' then
  target:=item.reply_to_id; seconds:=item.reply_at_seconds;
 else
  target:=(payload->>'replyToId')::uuid; seconds:=(payload->>'atSeconds')::integer;
 end if;
 select m into prior from jsonb_array_elements(room->'messages') m where m->>'id'=cid::text and m->>'sender'=who;
 if action='media_reserve' and item.id is not null and (item.reply_to_id is distinct from target or item.reply_at_seconds is distinct from seconds)
   or prior is not null and (prior#>>'{reply,id}' is distinct from target::text or prior#>>'{reply,atSeconds}' is distinct from seconds::text) then
  raise exception 'استُخدم معرّف الإرسال لرد آخر.' using errcode='22023';
 end if;
 if prior is null and (target is not null or seconds is not null) then
  select m into original from jsonb_array_elements(room->'messages') m where m->>'id'=target::text and m->>'deletedAt' is null;
  if original is null or target=cid then raise exception 'الرسالة الأصلية غير متاحة.' using errcode='22023'; end if;
  if seconds is not null and (original#>>'{attachment,kind}' is distinct from 'audio' or seconds<0 or seconds>=coalesce((original#>>'{attachment,duration}')::numeric,0)) then
   raise exception 'موضع التسجيل غير متاح.' using errcode='22023';
  end if;
  quote:=jsonb_strip_nulls(jsonb_build_object('id',target,'sender',original->>'sender','atSeconds',seconds,'body',
   case original#>>'{attachment,kind}' when 'audio' then 'رسالة صوتية' when 'photo' then
    case when (original#>>'{attachment,viewOnce}')::boolean then 'صورة لمرة واحدة' else 'صورة' end else left(original->>'body',240) end));
 end if;
 result:=public.nisfayn_test_rpc(action,session_token,payload);
 if action='media_reserve' and item.id is null and target is not null then
  update nisfayn_test.media set reply_to_id=target,reply_at_seconds=seconds where id=cid and actor=who;
 elsif action in ('send','media_publish') and quote is not null then
  select jsonb_agg(case when m->>'id'=cid::text and m->>'sender'=who then m||jsonb_build_object('reply',quote) else m end order by n)
   into new_messages from nisfayn_test.room r, jsonb_array_elements(r.data->'messages') with ordinality rows(m,n) where r.id;
  update nisfayn_test.room set data=jsonb_set(data,'{messages}',new_messages) where id;
  if result?'messages' then
   result:=jsonb_set(result,'{messages}',(select jsonb_agg(case when m->>'id'=cid::text and m->>'sender'=who then m||jsonb_build_object('reply',quote) else m end order by n)
    from jsonb_array_elements(result->'messages') with ordinality rows(m,n)));
  end if;
 end if;
 return result;
end $$;
revoke all on function public.nisfayn_test_chat_reply(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_chat_reply(text,text,jsonb) to service_role;
