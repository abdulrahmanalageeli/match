-- Normal member chat uses a private bucket. Only the Edge Function uploads or
-- downloads bytes; member RPCs authorize metadata and atomically consume once-only photos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('nisfayn-member-chat','nisfayn-member-chat',false,8388608,
 array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg','audio/wav']);
create table marriage.chat_media (
 id uuid primary key, request_id uuid not null references marriage.member_requests(id) on delete cascade,
 sender_id uuid not null references marriage.members(id) on delete cascade,
 path text not null unique, kind text not null check(kind in('photo','audio')),
 mime text not null, size integer not null check(size between 12 and 8388608), duration numeric,
 view_once boolean not null default false, opened_at timestamptz,
 created_at timestamptz not null default now(), published_at timestamptz,
 check(duration is null or duration between 0 and 60), check(not view_once or kind='photo')
);
create index chat_media_sender_created on marriage.chat_media(sender_id,created_at);
create table marriage.chat_media_cleanup(path text primary key,created_at timestamptz not null default now());
alter table marriage.chat_media enable row level security;
alter table marriage.chat_media_cleanup enable row level security;
revoke all on marriage.chat_media,marriage.chat_media_cleanup from public,anon,authenticated,service_role;

create function marriage.queue_chat_media_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='chat_media' then
  insert into marriage.chat_media_cleanup(path) values(old.path) on conflict do nothing;return old;
 end if;
 insert into marriage.chat_media_cleanup(path) select path from marriage.chat_media where id=new.id on conflict do nothing;
 return new;
end $$;
create trigger queue_removed_chat_media after delete on marriage.chat_media for each row execute function marriage.queue_chat_media_cleanup();
create trigger queue_deleted_chat_media after update of deleted_at on marriage.thread_messages
 for each row when(new.deleted_at is not null and old.deleted_at is distinct from new.deleted_at) execute function marriage.queue_chat_media_cleanup();

create function marriage.chat_media_action(action text,request_id uuid,media_id uuid default null,payload jsonb default '{}') returns jsonb
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
 if action not in('access','open') or item.published_at is null or not exists(select 1 from marriage.thread_messages where id=item.id and deleted_at is null) then
  raise exception 'الملف غير متاح.' using errcode='42501';end if;
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
create function public.marriage_chat_media(action text,request_id uuid,media_id uuid default null,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select marriage.chat_media_action($1,$2,$3,$4)$$;

create or replace function marriage.chat_message_json(m marriage.thread_messages,viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'senderIsMe',m.sender_id=viewer,'body',m.body,'createdAt',m.created_at,
  'clientId',case when m.sender_id=viewer then m.client_id end,'deletedAt',m.deleted_at,
  'attachment',case when m.deleted_at is null and media.published_at is not null then jsonb_build_object(
   'id',media.id,'kind',media.kind,'mime',media.mime,'size',media.size,'duration',media.duration,'viewOnce',media.view_once,'openedAt',media.opened_at) end,
  'reactions',case when m.deleted_at is null then marriage.message_reactions_json(m.id,viewer) else '[]'::jsonb end,
  'reply',case when m.deleted_at is null and original.id is not null then
   jsonb_build_object('id',original.id,'body',left(original.body,240),'senderIsMe',original.sender_id=viewer)||
    case when original.deleted_at is not null then jsonb_build_object('deletedAt',original.deleted_at) else '{}'::jsonb end end)
 from (select 1) x left join marriage.thread_messages original on original.id=m.reply_to_id and original.request_id=m.request_id
 left join marriage.chat_media media on media.id=m.id and media.request_id=m.request_id
$$;

create function marriage.chat_media_cleanup_paths(paths text[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if paths is not null then
  if cardinality(paths)>30 then raise exception 'Cleanup batch too large';end if;
  delete from marriage.chat_media where path=any(paths) and published_at is null and created_at<now()-interval '1 day';
  delete from marriage.chat_media_cleanup where path=any(paths);
  return '{"ok":true}';
 end if;
 return coalesce((select jsonb_agg(path) from (
  select path from marriage.chat_media_cleanup union select path from marriage.chat_media where published_at is null and created_at<now()-interval '1 day'
  limit 30) stale),'[]');
end $$;
create function public.marriage_chat_media_cleanup(paths text[] default null) returns jsonb language sql security invoker set search_path='' as $$select marriage.chat_media_cleanup_paths($1)$$;
revoke all on function marriage.chat_media_action(text,uuid,uuid,jsonb),public.marriage_chat_media(text,uuid,uuid,jsonb),
 marriage.queue_chat_media_cleanup(),marriage.chat_media_cleanup_paths(text[]),public.marriage_chat_media_cleanup(text[]) from public,anon,authenticated,service_role;
grant execute on function marriage.chat_media_action(text,uuid,uuid,jsonb),public.marriage_chat_media(text,uuid,uuid,jsonb) to authenticated;
grant execute on function marriage.chat_media_cleanup_paths(text[]),public.marriage_chat_media_cleanup(text[]) to service_role;
