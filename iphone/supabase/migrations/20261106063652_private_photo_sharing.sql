-- Only the dedicated Nisfayn project. Media is never public or part of discovery.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nisfayn-private-photos','nisfayn-private-photos',false,3145728,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=array['image/jpeg'];

create table marriage.photo_assets (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references marriage.members(id) on delete cascade,
 object_path text not null unique,
 state text not null default 'pending' check(state in('pending','active')),
 created_at timestamptz not null default now(),
 check(object_path=owner_id::text||'/'||id::text||'.jpg')
);
create unique index photo_one_state_per_owner on marriage.photo_assets(owner_id,state);
create table marriage.photo_grants (
 photo_id uuid not null references marriage.photo_assets(id) on delete cascade,
 request_id uuid not null references marriage.member_requests(id) on delete cascade,
 recipient_id uuid not null references marriage.members(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '24 hours',
 primary key(photo_id,request_id)
);
create index photo_grants_recipient on marriage.photo_grants(recipient_id,expires_at);
create index photo_grants_request on marriage.photo_grants(request_id);
create table marriage.photo_upload_limits (
 owner_id uuid primary key references marriage.members(id) on delete cascade,
 window_start timestamptz not null default now(), attempts integer not null default 1
);
-- Removed metadata queues a Storage API delete; never delete storage.objects in SQL.
create table marriage.photo_cleanup (
 object_path text primary key,queued_at timestamptz not null default now()
);
alter table marriage.photo_assets enable row level security;
alter table marriage.photo_grants enable row level security;
alter table marriage.photo_cleanup enable row level security;
alter table marriage.photo_upload_limits enable row level security;
revoke all on marriage.photo_assets,marriage.photo_grants,marriage.photo_cleanup,marriage.photo_upload_limits from public,anon,authenticated;
insert into marriage.consent_versions(version) values('2026-11-06-private-photo'),('2026-11-06-photo-sharing') on conflict do nothing;

create function marriage.photo_signal(a uuid,b uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 begin
  perform realtime.send('{}'::jsonb,'changed','marriage:member:'||a::text,true);
  if b is not null then perform realtime.send('{}'::jsonb,'changed','marriage:member:'||b::text,true); end if;
 exception when others then raise log 'Nisfayn photo refresh deferred (SQLSTATE %)',sqlstate;
 end;
end $$;
create function marriage.photo_before_delete() returns trigger
language plpgsql security definer set search_path='' as $$
declare peer uuid;
begin
 insert into marriage.photo_cleanup(object_path) values(old.object_path) on conflict do nothing;
 perform marriage.photo_signal(old.owner_id);
 for peer in select recipient_id from marriage.photo_grants where photo_id=old.id loop
  perform marriage.photo_signal(peer);
 end loop;
 return old;
end $$;
create trigger photo_cleanup_before_delete before delete on marriage.photo_assets
for each row execute function marriage.photo_before_delete();

create function marriage.photo_owns_path(path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin return split_part(path,'/',1)=me::text and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'; end $$;
create function marriage.photo_can_upload(path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 return exists(select 1 from marriage.photo_assets p join marriage.members m on m.id=p.owner_id
 where p.owner_id=me and p.object_path=path and p.state='pending' and p.created_at>now()-interval '15 minutes' and not m.suspended);
end $$;
create function marriage.photo_can_read(path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if exists(select 1 from marriage.photo_assets where owner_id=me and object_path=path) then return true; end if;
 perform marriage.require_discovery_member();
 return exists(select 1 from marriage.photo_assets p join marriage.photo_grants g on g.photo_id=p.id
 join marriage.member_requests r on r.id=g.request_id
 where p.object_path=path and p.state='active' and g.recipient_id=me and g.expires_at>now()
 and r.status='accepted' and ((r.requester_id=me and r.recipient_id=p.owner_id) or (r.recipient_id=me and r.requester_id=p.owner_id))
 and marriage.is_paid(p.owner_id) and marriage.compatible(me,p.owner_id));
exception when insufficient_privilege then return false;
end $$;

-- SELECT also powers URL signing/copying/listing. Only authorize direct reads.
create policy nisfayn_photo_read on storage.objects for select to authenticated using (
 bucket_id='nisfayn-private-photos' and (
  (storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info']) and marriage.photo_can_read(name))
  or (storage.allow_any_operation(array['object.delete','object.delete_many']) and marriage.photo_owns_path(name))
 )
);
create policy nisfayn_photo_upload on storage.objects for insert to authenticated with check (
 bucket_id='nisfayn-private-photos' and storage.allow_only_operation('object.upload') and marriage.photo_can_upload(name)
);
create policy nisfayn_photo_delete on storage.objects for delete to authenticated using (
 bucket_id='nisfayn-private-photos' and storage.allow_any_operation(array['object.delete','object.delete_many']) and marriage.photo_owns_path(name)
);

create function marriage.photo_state(request_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); peer uuid; mine jsonb; theirs jsonb; expiry timestamptz;
begin
 select jsonb_build_object('id',p.id,'path',p.object_path) into mine from marriage.photo_assets p where p.owner_id=me and p.state='active';
 if request_id is not null then
  perform marriage.require_discovery_member(); peer:=marriage.progress_peer(me,request_id);
  select g.expires_at into expiry from marriage.photo_grants g join marriage.photo_assets p on p.id=g.photo_id
   where p.owner_id=me and p.state='active' and g.request_id=$1 and g.expires_at>now();
  select jsonb_build_object('id',p.id,'path',p.object_path,'expiresAt',g.expires_at) into theirs
   from marriage.photo_grants g join marriage.photo_assets p on p.id=g.photo_id
   where g.request_id=$1 and g.recipient_id=me and g.expires_at>now() and p.owner_id=peer and p.state='active';
 end if;
 return jsonb_build_object('mine',mine,'sharedUntil',expiry,'peer',theirs);
end $$;
create function marriage.photo_prepare() returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); picture uuid:=gen_random_uuid(); path text; attempts integer;
begin
 perform 1 from marriage.members m join marriage.profiles p on p.member_id=m.id where m.id=me and not m.suspended for update of m;
 if not found then raise exception 'أكمل ملفك قبل إضافة الصورة.' using errcode='42501'; end if;
 insert into marriage.photo_upload_limits(owner_id) values(me) on conflict(owner_id) do update
 set attempts=case when photo_upload_limits.window_start<now()-interval '1 hour' then 1 else photo_upload_limits.attempts+1 end,
 window_start=case when photo_upload_limits.window_start<now()-interval '1 hour' then now() else photo_upload_limits.window_start end
 returning photo_upload_limits.attempts into attempts;
 if attempts>12 then raise exception 'تغييرات كثيرة على الصورة. حاول لاحقًا.' using errcode='22023'; end if;
 delete from marriage.photo_assets where owner_id=me and state='pending';
 path:=me::text||'/'||picture::text||'.jpg';
 insert into marriage.photo_assets(id,owner_id,object_path) values(picture,me,path);
 return jsonb_build_object('id',picture,'path',path);
end $$;
create function marriage.photo_commit(photo_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); photo marriage.photo_assets%rowtype;
begin
 perform 1 from marriage.members where id=me and not suspended for update;
 if not found then raise exception 'الصورة غير متاحة.' using errcode='42501'; end if;
 select * into photo from marriage.photo_assets where id=$1 and owner_id=me for update;
 if not found then raise exception 'الصورة غير متاحة.' using errcode='42501'; end if;
 if photo.state='active' then return marriage.photo_state(); end if;
 if photo.created_at<now()-interval '15 minutes' or not exists(select 1 from storage.objects o
  where o.bucket_id='nisfayn-private-photos' and o.name=photo.object_path
  and o.metadata->>'mimetype'='image/jpeg' and (o.metadata->>'size')::bigint between 1 and 3145728) then
  raise exception 'تعذّر تأكيد رفع الصورة. اخترها مجددًا.' using errcode='22023';
 end if;
 delete from marriage.photo_assets where owner_id=me and state='active';
 update marriage.photo_assets set state='active' where id=$1;
 insert into marriage.consents(member_id,version) values(me,'2026-11-06-private-photo');
 perform marriage.photo_signal(me);
 return marriage.photo_state();
end $$;
create function marriage.photo_remove() returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); paths jsonb;
begin
 perform 1 from marriage.members where id=me for update;
 select coalesce(jsonb_agg(object_path),'[]'::jsonb) into paths from marriage.photo_assets where owner_id=me;
 delete from marriage.photo_assets where owner_id=me;
 return paths;
end $$;
create function marriage.photo_share(request_id uuid,share boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid; photo uuid;
begin
 perform 1 from marriage.members where id=me for update;
 peer:=marriage.progress_peer(me,request_id);
 select id into photo from marriage.photo_assets where owner_id=me and state='active';
 if share then
  if photo is null then raise exception 'أضف صورتك الخاصة أولًا.' using errcode='22023'; end if;
  insert into marriage.photo_grants(photo_id,request_id,recipient_id) values(photo,request_id,peer)
   on conflict on constraint photo_grants_pkey do update set expires_at=now()+interval '24 hours';
  insert into marriage.consents(member_id,version) values(me,'2026-11-06-photo-sharing');
 else
  delete from marriage.photo_grants where photo_id=photo and photo_grants.request_id=$1;
 end if;
 perform marriage.photo_signal(me,peer);
 return marriage.photo_state(request_id);
end $$;

create function public.marriage_photo_state(request_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select marriage.photo_state($1)$$;
create function public.marriage_photo_prepare() returns jsonb language sql security invoker set search_path='' as $$select marriage.photo_prepare()$$;
create function public.marriage_photo_commit(photo_id uuid) returns jsonb language sql security invoker set search_path='' as $$select marriage.photo_commit($1)$$;
create function public.marriage_photo_remove() returns jsonb language sql security invoker set search_path='' as $$select marriage.photo_remove()$$;
create function public.marriage_photo_share(request_id uuid,share boolean) returns jsonb language sql security invoker set search_path='' as $$select marriage.photo_share($1,$2)$$;

-- Export the member's own photo/consent metadata, never a recipient's photo or URL.
create or replace function marriage.personal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 return jsonb_build_object('exportVersion',2,'exportedAt',statement_timestamp(),
  'account',(select jsonb_build_object('email',nullif(u.email,''),'phone',u.phone,'joinedAt',m.joined_at,'reviewStatus',m.review_status,'paused',m.paused)
   from marriage.members m join auth.users u on u.id=m.id where m.id=me),
  'profile',marriage.profile_json(me),
  'consents',coalesce((select jsonb_agg(jsonb_build_object('version',c.version,'recordedAt',c.recorded_at) order by c.recorded_at)
   from marriage.consents c where c.member_id=me),'[]'),
  'sentMessages',coalesce((select jsonb_agg(jsonb_build_object('sentAt',t.created_at,'body',t.body) order by t.created_at,t.id)
   from marriage.thread_messages t where t.sender_id=me),'[]'),
  'steps',coalesce((select jsonb_agg(jsonb_build_object('stage',s.stage,'agreedAt',s.agreed_at) order by s.agreed_at)
   from marriage.stage_choices s where s.member_id=me),'[]'),
  'privatePhoto',(select jsonb_build_object('id',p.id,'addedAt',p.created_at) from marriage.photo_assets p where p.owner_id=me and p.state='active'),
  'photoShares',coalesce((select jsonb_agg(jsonb_build_object('photoId',p.id,'requestId',g.request_id,'expiresAt',g.expires_at) order by g.expires_at)
   from marriage.photo_grants g join marriage.photo_assets p on p.id=g.photo_id where p.owner_id=me),'[]'));
end $$;

create function marriage.photo_cleanup_batch() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 delete from marriage.photo_assets where state='pending' and created_at<now()-interval '15 minutes';
 return (select coalesce(jsonb_agg(q.object_path),'[]'::jsonb) from (select object_path from marriage.photo_cleanup order by queued_at limit 100) q);
end $$;
create function marriage.photo_cleanup_done(paths text[]) returns void language sql security definer set search_path='' as $$
 delete from marriage.photo_cleanup where object_path=any(paths)
$$;
create function public.marriage_photo_cleanup_batch() returns jsonb language sql security invoker set search_path='' as $$select marriage.photo_cleanup_batch()$$;
create function public.marriage_photo_cleanup_done(paths text[]) returns void language sql security invoker set search_path='' as $$select marriage.photo_cleanup_done($1)$$;

revoke all on function marriage.photo_signal(uuid,uuid),marriage.photo_before_delete(),marriage.photo_owns_path(text),marriage.photo_can_upload(text),marriage.photo_can_read(text),marriage.photo_state(uuid),marriage.photo_prepare(),marriage.photo_commit(uuid),marriage.photo_remove(),marriage.photo_share(uuid,boolean),marriage.photo_cleanup_batch(),marriage.photo_cleanup_done(text[]) from public,anon,authenticated;
revoke all on function public.marriage_photo_state(uuid),public.marriage_photo_prepare(),public.marriage_photo_commit(uuid),public.marriage_photo_remove(),public.marriage_photo_share(uuid,boolean),public.marriage_photo_cleanup_batch(),public.marriage_photo_cleanup_done(text[]) from public,anon,authenticated;
grant execute on function marriage.photo_owns_path(text),marriage.photo_can_upload(text),marriage.photo_can_read(text),marriage.photo_state(uuid),marriage.photo_prepare(),marriage.photo_commit(uuid),marriage.photo_remove(),marriage.photo_share(uuid,boolean),public.marriage_photo_state(uuid),public.marriage_photo_prepare(),public.marriage_photo_commit(uuid),public.marriage_photo_remove(),public.marriage_photo_share(uuid,boolean) to authenticated;
grant execute on function marriage.photo_cleanup_batch(),marriage.photo_cleanup_done(text[]),public.marriage_photo_cleanup_batch(),public.marriage_photo_cleanup_done(text[]) to service_role;
