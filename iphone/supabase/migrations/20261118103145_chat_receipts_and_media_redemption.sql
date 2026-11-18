-- opened_at records exclusive redemption; only the recipient's viewer acknowledges display.
alter table marriage.chat_media add column viewed_at timestamptz;
alter table nisfayn_test.media add column viewed_at timestamptz;

create or replace function marriage.chat_message_json(m marriage.thread_messages,viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'senderIsMe',m.sender_id=viewer,'body',m.body,'createdAt',m.created_at,
  'readByPeer',m.sender_id=viewer and exists (
   select 1 from marriage.thread_read_positions c join marriage.member_requests r on r.id=c.request_id
   where r.id=m.request_id and r.status='accepted' and viewer in(r.requester_id,r.recipient_id)
    and c.reader_id=case when viewer=r.requester_id then r.recipient_id else r.requester_id end
    and (m.created_at,m.id)<=(c.through_created_at,c.through_id)),
  'clientId',case when m.sender_id=viewer then m.client_id end,'deletedAt',m.deleted_at,
  'attachment',case when m.deleted_at is null and media.published_at is not null then jsonb_build_object(
   'id',media.id,'kind',media.kind,'mime',media.mime,'size',media.size,'duration',media.duration,'viewOnce',media.view_once,'openedAt',media.opened_at,'viewedAt',media.viewed_at) end,
  'reactions',case when m.deleted_at is null then marriage.message_reactions_json(m.id,viewer) else '[]'::jsonb end,
  'reply',case when m.deleted_at is null and original.id is not null then
   jsonb_build_object('id',original.id,'body',left(original.body,240),'senderIsMe',original.sender_id=viewer)||
    case when original.deleted_at is not null then jsonb_build_object('deletedAt',original.deleted_at) else '{}'::jsonb end end)
 from (select 1) x left join marriage.thread_messages original on original.id=m.reply_to_id and original.request_id=m.request_id
 left join marriage.chat_media media on media.id=m.id and media.request_id=m.request_id
$$;

-- A restarted phone may have missed more than one page. Return only the caller's committed keys.
create function marriage.committed_chat_sends(request_id uuid, client_ids uuid[]) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
begin
 perform marriage.chat_peer($1);
 if cardinality($2)>100 then raise exception 'عدد الرسائل كبير.' using errcode='22023';end if;
 return array(select m.client_id from marriage.thread_messages m
   where m.request_id=$1 and m.sender_id=auth.uid() and m.client_id=any($2));
end $$;
create function public.marriage_committed_chat_sends(request_id uuid, client_ids uuid[]) returns uuid[]
language sql stable security invoker set search_path='' as $$select marriage.committed_chat_sends($1,$2)$$;
revoke all on function marriage.committed_chat_sends(uuid,uuid[]),public.marriage_committed_chat_sends(uuid,uuid[])
 from public,anon,authenticated,service_role;
grant execute on function marriage.committed_chat_sends(uuid,uuid[]),public.marriage_committed_chat_sends(uuid,uuid[]) to authenticated;

-- Only an advancing, authorized read cursor fires this private wake-up.
create function marriage.notify_chat_reader_advanced() returns trigger
language plpgsql security definer set search_path='' as $$
declare peer uuid;
begin
 select case when requester_id=new.reader_id then recipient_id else requester_id end into peer
 from marriage.member_requests where id=new.request_id and new.reader_id in(requester_id,recipient_id);
 if peer is not null then perform realtime.send('{}','changed','marriage:member:'||peer::text,true);end if;
 return new;
exception when others then raise log 'Read cursor notification deferred (%)',sqlstate;return new;
end $$;
revoke all on function marriage.notify_chat_reader_advanced() from public,anon,authenticated,service_role;
create trigger notify_peer_read after insert or update on marriage.thread_read_positions
 for each row execute function marriage.notify_chat_reader_advanced();

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
   if item.kind<>media_kind or item.mime<>media_mime or item.size<>media_size or item.duration is distinct from media_duration or item.view_once<>once_only then
    raise exception 'استُخدم معرّف الملف لمحتوى آخر.' using errcode='22023';end if;
   if exists(select 1 from marriage.thread_messages where id=item.id and deleted_at is not null) then raise exception 'حُذفت هذه الرسالة.' using errcode='42501';end if;
   return jsonb_build_object('id',item.id,'path',item.path,'already',item.published_at is not null,'resume',item.published_at is null);
  end if;
  if (select count(*) from marriage.chat_media where sender_id=me and created_at>now()-interval '1 day')>=100
   or (select count(*) from marriage.chat_media where sender_id=me and published_at is null)>=10 then
   raise exception 'وصلت إلى حد الملفات. حاول لاحقًا.' using errcode='54000';end if;
  insert into marriage.chat_media(id,request_id,sender_id,path,kind,mime,size,duration,view_once)
   values($3,$2,me,$2::text||'/'||me::text||'/'||$3::text,media_kind,media_mime,media_size,media_duration,once_only) returning * into item;
  return jsonb_build_object('id',item.id,'path',item.path,'already',false,'resume',false);
 end if;
 if item.id is null then raise exception 'الملف غير متاح.' using errcode='42501';end if;
 if action='commit' then
  if item.published_at is not null then return jsonb_build_object('id',item.id);end if;
  select metadata into object_metadata from storage.objects where bucket_id='nisfayn-member-chat' and name=item.path;
  if object_metadata is null or (object_metadata->>'size')::bigint is distinct from item.size::bigint
   or object_metadata->>'mimetype' is distinct from item.mime then raise exception 'لم يكتمل رفع الملف.' using errcode='22023';end if;
  insert into marriage.thread_messages(id,request_id,sender_id,client_id,body) values(item.id,item.request_id,me,item.id,
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
create or replace function nisfayn_test.chat_messages(items jsonb) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(case when gone.id is not null then
  (m-'body'-'attachment'-'reply')||jsonb_build_object('body','تم حذف هذه الرسالة','deletedAt',gone.deleted_at)
 else m||case when media.view_once then jsonb_build_object('attachment',(m->'attachment')||
  jsonb_build_object('viewOnce',true,'openedAt',media.opened_at,'viewedAt',media.viewed_at)) else '{}'::jsonb end||
  case when quote_gone.id is not null then jsonb_build_object('reply',(m->'reply')||jsonb_build_object('body','تم حذف هذه الرسالة','deletedAt',quote_gone.deleted_at))
  else '{}'::jsonb end end order by ord),'[]')
 from jsonb_array_elements(coalesce(items,'[]')) with ordinality rows(m,ord)
 left join nisfayn_test.message_deletions gone on gone.id::text=m->>'id'
 left join nisfayn_test.message_deletions quote_gone on quote_gone.id::text=m#>>'{reply,id}'
 left join nisfayn_test.media media on media.id::text=m#>>'{attachment,id}'
$$;

-- The tester Edge Function alone can preflight bytes or record a viewer confirmation.
create function public.nisfayn_test_media_receipt(action text,session_token text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who text;room_state jsonb;item nisfayn_test.media;
begin
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if who is null then raise exception 'انتهت الجلسة.' using errcode='42501';end if;
 select data into room_state from nisfayn_test.room where id for update;
 perform public.nisfayn_test_rpc('state',session_token,'{}');
 perform nisfayn_test.rpc_before_chat_privacy('media_url',session_token,payload);
 select * into item from nisfayn_test.media where id=(payload->>'id')::uuid and ready and deleted_at is null for update;
 if item.id is null or not item.view_once or item.kind<>'photo' or item.actor=who
  or not coalesce(room_state#>>'{seriousness,status}'='family' or
   (room_state#>>'{seriousness,status}'='accepted' and (room_state#>>'{seriousness,deadline}')::timestamptz>now()),false)
 then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
 if action='media_inspect' and item.opened_at is null then return jsonb_build_object('path',item.path,'mime',item.mime,'size',item.size);end if;
 if action='media_viewed' and item.opened_at is not null then
  update nisfayn_test.media set viewed_at=clock_timestamp() where id=item.id and viewed_at is null;
  if found then update nisfayn_test.room set data=room_state where id;end if;
  return '{"ok":true}';
 end if;
 raise exception 'الصورة غير متاحة.' using errcode='42501';
end $$;
revoke all on function public.nisfayn_test_media_receipt(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_media_receipt(text,text,jsonb) to service_role;
