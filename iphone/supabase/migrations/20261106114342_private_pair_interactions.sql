-- The private tester room only. Preserve the established core RPC behind a
-- service-only wrapper; production membership and BlindMatch are untouched.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_v1;
revoke all on function nisfayn_test.rpc_v1(text,text,jsonb) from public,anon,authenticated,service_role;
create table nisfayn_test.media (
 id uuid primary key, actor text not null check(actor in('abdulrahman','reham')),
 path text not null unique, kind text not null check(kind in('photo','audio')),
 mime text not null, size integer not null check(size between 1 and 8388608),
 duration numeric check(duration between 0 and 60), created_at timestamptz not null default now(),
 ready boolean not null default false, failed boolean not null default false
);
alter table nisfayn_test.media enable row level security;
revoke all on nisfayn_test.media from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nisfayn-test-chat','nisfayn-test-chat',false,8388608,array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg','audio/wav']);

create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor text; d jsonb; permission jsonb; msg jsonb; media_row nisfayn_test.media; result jsonb; latest text; cid uuid;
begin
 if action in('attempt','login','logout') then return nisfayn_test.rpc_v1(action,session_token,payload); end if;
 select s.actor into v_actor from nisfayn_test.sessions s where s.token_hash=sha256(session_token::bytea) and s.expires_at>now();
 if v_actor is null then raise exception 'انتهت جلسة الاختبار. سجّل الدخول مجددًا.' using errcode='42501'; end if;
 select data into d from nisfayn_test.room where id for update;
 permission:=coalesce(d->'callPermission','{"status":"none"}'::jsonb);
 if action in('call_start','token','call_accept') and permission->>'status'<>'accepted' then
  raise exception 'يجب قبول دعوة تفعيل المكالمات أولًا.' using errcode='42501';
 end if;
 if action in('permission_invite','permission_accept','permission_decline') then
  if not (d->>'matched')::boolean then raise exception 'التعارف مغلق.' using errcode='42501';end if;
  if permission->>'status'='accepted' then return d||jsonb_build_object('actor',v_actor);end if;
  if action='permission_invite' then
   if permission->>'status'='pending' then return d||jsonb_build_object('actor',v_actor);end if;
   if (permission->>'updatedAt')::timestamptz>now()-interval '30 seconds' then raise exception 'انتظر قليلًا قبل إرسال دعوة أخرى.';end if;
   permission:=jsonb_build_object('status','pending','invitedBy',v_actor,'updatedAt',now());
  else
   if permission->>'status'<>'pending' or permission->>'invitedBy'=v_actor then raise exception 'لا يمكنك الرد على دعوتك.' using errcode='42501';end if;
   permission:=permission||jsonb_build_object('status',case when action='permission_accept' then 'accepted' else 'declined' end,'updatedAt',now());
  end if;
  d:=jsonb_set(d,'{callPermission}',permission);
 elsif action in('delivered','read') then
  select m into msg from jsonb_array_elements(d->'messages') m where m->>'id'=payload->>'id' and m->>'sender'<>v_actor;
  if msg is not null then
   d:=jsonb_set(d,'{delivered}',coalesce(d->'delivered','{}'));
   d:=jsonb_set(d,array['delivered',v_actor],to_jsonb(greatest(coalesce(d#>>array['delivered',v_actor],''),msg->>'createdAt')));
   if action='read' then d:=jsonb_set(d,array['read',v_actor],to_jsonb(greatest(coalesce(d#>>array['read',v_actor],''),msg->>'createdAt')));end if;
  end if;
 elsif action='media_reserve' then
  if not (d->>'matched')::boolean then raise exception 'التعارف مغلق.' using errcode='42501';end if;
  cid:=(payload->>'id')::uuid;
  select * into media_row from nisfayn_test.media m where m.id=cid;
  if found then
   if media_row.actor<>v_actor then raise exception 'ملف غير متاح.' using errcode='42501';end if;
   if media_row.ready then return jsonb_build_object('already',true);end if;
   if media_row.mime is distinct from payload->>'mime' or media_row.size is distinct from (payload->>'size')::integer or media_row.duration is distinct from (payload->>'duration')::numeric then raise exception 'لا يمكن تغيير الملف أثناء إعادة المحاولة.';end if;
   if exists(select 1 from storage.objects o where o.bucket_id='nisfayn-test-chat' and o.name=media_row.path and (o.metadata->>'size')::integer=media_row.size and o.metadata->>'mimetype'=media_row.mime) then
    update nisfayn_test.media m set failed=false where m.id=cid;
    return jsonb_build_object('already',false,'resume',true,'path',media_row.path);
   end if;
   if not media_row.failed and media_row.created_at>now()-interval '30 seconds' then raise exception 'الرفع قيد التنفيذ. انتظر قليلًا.';end if;
   update nisfayn_test.media m set failed=false,created_at=now() where m.id=cid;
   return jsonb_build_object('already',false,'resume',false,'path',media_row.path);
  end if;
  if (select count(*) from nisfayn_test.media m where m.actor=v_actor and m.created_at>now()-interval '1 hour')>=30 then raise exception 'بلغت الحد المؤقت للملفات. حاول لاحقًا.';end if;
  if (select coalesce(sum(m.size),0) from nisfayn_test.media m where m.actor=v_actor and not m.failed)+(payload->>'size')::integer>209715200 then raise exception 'بلغت مساحة ملفات الاختبار المتاحة.';end if;
  if not (payload->>'mime'=any(array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg','audio/wav'])) or payload->>'mime' is null then raise exception 'نوع الملف غير مدعوم.';end if;
  insert into nisfayn_test.media(id,actor,path,kind,mime,size,duration)
  values(cid,v_actor,v_actor||'/'||cid::text,case when payload->>'mime' like 'image/%' then 'photo' else 'audio' end,payload->>'mime',(payload->>'size')::integer,(payload->>'duration')::numeric)
  returning * into media_row;
  return jsonb_build_object('path',media_row.path,'already',false);
 elsif action='media_publish' then
  if not (d->>'matched')::boolean then raise exception 'التعارف مغلق.' using errcode='42501';end if;
  select * into media_row from nisfayn_test.media m where m.id=(payload->>'id')::uuid and m.actor=v_actor and not m.failed for update;
  if not found then raise exception 'الملف غير متاح.' using errcode='42501';end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='nisfayn-test-chat' and o.name=media_row.path and (o.metadata->>'size')::integer=media_row.size and o.metadata->>'mimetype'=media_row.mime) then raise exception 'لم يكتمل رفع الملف.';end if;
  if not media_row.ready then
   if (select count(*) from jsonb_array_elements(d->'messages') m where m->>'sender'=v_actor and (m->>'createdAt')::timestamptz>now()-interval '1 minute')>=30 then raise exception 'انتظر قليلًا قبل إرسال المزيد.';end if;
   if exists(select 1 from jsonb_array_elements(d->'messages') m where m->>'id'=media_row.id::text) then raise exception 'معرّف الرسالة مستخدم.';end if;
   msg:=jsonb_build_object('id',media_row.id,'clientId',media_row.id,'sender',v_actor,'body',case when media_row.kind='photo' then 'صورة' else 'رسالة صوتية' end,'createdAt',now(),
    'attachment',jsonb_strip_nulls(jsonb_build_object('id',media_row.id,'kind',media_row.kind,'mime',media_row.mime,'size',media_row.size,'duration',media_row.duration)));
   d:=jsonb_set(d,'{messages}',coalesce((select jsonb_agg(v order by ord) from (select value v,ordinality ord from jsonb_array_elements((d->'messages')||jsonb_build_array(msg)) with ordinality order by ordinality desc limit 500) q),'[]'));
   update nisfayn_test.media m set ready=true where m.id=media_row.id;
  end if;
 elsif action='media_abort' then
  update nisfayn_test.media m set failed=true where m.id=(payload->>'id')::uuid and m.actor=v_actor and not m.ready;
  return 'true';
 elsif action='media_url' then
  if not (d->>'matched')::boolean then raise exception 'التعارف مغلق.' using errcode='42501';end if;
  select * into media_row from nisfayn_test.media m where m.id=(payload->>'id')::uuid and m.ready;
  if not found or not exists(select 1 from jsonb_array_elements(d->'messages') m where m#>>'{attachment,id}'=media_row.id::text) then raise exception 'الملف غير متاح.' using errcode='42501';end if;
  return jsonb_build_object('path',media_row.path);
 elsif action='media_stale' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'path',m.path)) from (select * from nisfayn_test.media where not ready and created_at<now()-interval '1 hour' limit 20) m),'[]');
 elsif action='media_purge' then
  delete from nisfayn_test.media m where m.id=(payload->>'id')::uuid and not m.ready and m.created_at<now()-interval '1 hour';return 'true';
 else
  return nisfayn_test.rpc_v1(action,session_token,payload);
 end if;
 update nisfayn_test.room set data=d where id;
 return d||jsonb_build_object('actor',v_actor,'callPermission',coalesce(d->'callPermission','{"status":"none"}'::jsonb));
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
