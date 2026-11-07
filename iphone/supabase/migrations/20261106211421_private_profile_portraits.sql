-- One optional, flattened JPEG portrait, independent of the three-photo gallery.
-- The client applies the chosen blur before upload; originals are never uploaded.
-- Staging a replacement leaves the current portrait visible until commit succeeds.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('nisfayn-profile-portraits','nisfayn-profile-portraits',false,3145728,array['image/jpeg']);
create table marriage.member_portraits (
 id uuid primary key default gen_random_uuid(),member_id uuid not null references marriage.members(id) on delete cascade,
 path text not null unique,blur smallint not null check(blur between 0 and 100),ready boolean not null default false,
 created_at timestamptz not null default now()
);
create index member_portraits_owner on marriage.member_portraits(member_id);
create unique index member_portraits_current on marriage.member_portraits(member_id) where ready;
alter table marriage.member_portraits enable row level security;
revoke all on marriage.member_portraits from public,anon,authenticated,service_role;
create table nisfayn_test.member_portraits (
 id uuid primary key default gen_random_uuid(),actor text not null check(actor in('reham','abdulrahman')),
 path text not null unique,blur smallint not null check(blur between 0 and 100),ready boolean not null default false,
 created_at timestamptz not null default now()
);
create index test_portraits_actor on nisfayn_test.member_portraits(actor);
create unique index test_portraits_current on nisfayn_test.member_portraits(actor) where ready;
alter table nisfayn_test.member_portraits enable row level security;
revoke all on nisfayn_test.member_portraits from public,anon,authenticated,service_role;

create function marriage.portrait_json(subject uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',id,'path',path,'blur',blur) from marriage.member_portraits where member_id=$1 and ready
$$;
create function marriage.portrait_info(subject uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();target uuid:=coalesce(subject,me);begin
 if not marriage.gallery_access(target) then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
 return marriage.portrait_json(target);
end $$;
create function marriage.portrait_prepare(blur_level int) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.member_portraits;pid uuid:=gen_random_uuid();begin
 if blur_level is null or blur_level not between 0 and 100 then raise exception 'درجة التمويه غير صالحة.' using errcode='22023';end if;
 -- Draft/pending members may add a portrait during onboarding; suspended accounts may not.
 perform 1 from marriage.members where id=me and not suspended for update;
 if not found then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 if coalesce(marriage.signup_consents_json(me)->>'version','')<>'2026-11-06-onboarding' or (marriage.signup_consents_json(me)->'photo') is distinct from 'true'::jsonb then
  raise exception 'وافق على استخدام صورة الملف قبل رفعها.' using errcode='42501';end if;
 delete from marriage.member_portraits where member_id=me and not ready and created_at<=now()-interval '15 minutes';
 if (select count(*) from marriage.member_portraits where member_id=me and not ready)>=3 then raise exception 'انتظر اكتمال رفع الصورة وحاول مجددًا.';end if;
 insert into marriage.member_portraits(id,member_id,path,blur) values(pid,me,me::text||'/'||pid::text||'.jpg',blur_level) returning * into p;
 return jsonb_build_object('id',p.id,'path',p.path,'blur',p.blur);
end $$;
create function marriage.portrait_commit(photo_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.member_portraits;begin
 perform 1 from marriage.members where id=me and not suspended for update;
 if not found then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 if coalesce(marriage.signup_consents_json(me)->>'version','')<>'2026-11-06-onboarding' or (marriage.signup_consents_json(me)->'photo') is distinct from 'true'::jsonb then
  raise exception 'وافق على استخدام صورة الملف قبل رفعها.' using errcode='42501';end if;
 select * into p from marriage.member_portraits where id=photo_id and member_id=me;
 if p.id is null or (not p.ready and p.created_at<=now()-interval '15 minutes') then raise exception 'انتهت مهلة رفع الصورة.';end if;
 if not exists(select 1 from storage.objects where bucket_id='nisfayn-profile-portraits' and name=p.path
  and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 3145728) then raise exception 'لم يكتمل رفع الصورة.';end if;
 delete from marriage.member_portraits where member_id=me and ready and id<>p.id;
 update marriage.member_portraits set ready=true where id=p.id;
 return marriage.portrait_json(me);
end $$;
create function marriage.portrait_remove() returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 perform 1 from marriage.members where id=me for update;
 delete from marriage.member_portraits where member_id=me;return true;
end $$;
create function marriage.portrait_storage(object_name text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.member_portraits;begin
 select * into p from marriage.member_portraits where path=object_name;
 return p.id is not null and case when writing then p.member_id=me and not p.ready and p.created_at>now()-interval '15 minutes'
  and exists(select 1 from marriage.members where id=me and not suspended)
 else p.member_id=me or p.ready and marriage.gallery_access(p.member_id) end;
end $$;
create policy portrait_upload on storage.objects for insert to authenticated with check(
 bucket_id='nisfayn-profile-portraits' and storage.allow_only_operation('object.upload') and marriage.portrait_storage(name,true));
create policy portrait_download on storage.objects for select to authenticated using(
 bucket_id='nisfayn-profile-portraits' and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info'])
 and marriage.portrait_storage(name,false));
-- No list, signed-URL creation, image transformations, upsert or direct deletion for members.
-- Removal is via RPC so metadata, access revocation and retriable Storage cleanup stay atomic.
create function public.marriage_portrait_prepare(blur_level int) returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_prepare($1)$$;
create function public.marriage_portrait_commit(photo_id uuid) returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_commit($1)$$;
create function public.marriage_portrait_info(subject uuid default null) returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_info($1)$$;
create function public.marriage_portrait_remove() returns boolean language sql security invoker set search_path='' as $$select marriage.portrait_remove()$$;
revoke all on function marriage.portrait_json(uuid),marriage.portrait_info(uuid),marriage.portrait_prepare(int),marriage.portrait_commit(uuid),
 marriage.portrait_remove(),marriage.portrait_storage(text,boolean),public.marriage_portrait_prepare(int),public.marriage_portrait_commit(uuid),
 public.marriage_portrait_info(uuid),public.marriage_portrait_remove() from public,anon,authenticated,service_role;
grant execute on function marriage.portrait_info(uuid),marriage.portrait_prepare(int),marriage.portrait_commit(uuid),marriage.portrait_remove(),
 marriage.portrait_storage(text,boolean),public.marriage_portrait_prepare(int),public.marriage_portrait_commit(uuid),
 public.marriage_portrait_info(uuid),public.marriage_portrait_remove() to authenticated;

-- Portrait metadata is read-only; it must not make an unchanged profile save
-- look like a moderated text edit or close an existing introduction.
do $portrait_compare$ declare definition text;begin
 definition:=pg_get_functiondef('marriage.apply_profile(jsonb)'::regprocedure);
 if strpos(definition,'previous:=marriage.profile_json(me);')=0 then raise exception 'Unexpected profile comparison definition';end if;
 execute replace(definition,'previous:=marriage.profile_json(me);',$replace$previous:=marriage.profile_json(me)-'portrait';$replace$);
end $portrait_compare$;
alter function marriage.profile_json(uuid) rename to profile_json_before_portrait;
create function marriage.profile_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.profile_json_before_portrait($1)||jsonb_build_object('portrait',marriage.portrait_json($1))
$$;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_portrait;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_before_portrait($1,$2)||jsonb_build_object('portrait',marriage.portrait_json($2))
$$;
revoke all on function marriage.profile_json(uuid),marriage.profile_json_before_portrait(uuid),marriage.member_card(uuid,uuid),marriage.member_card_before_portrait(uuid,uuid)
 from public,anon,authenticated,service_role;

-- Pair-test dispatch retains its existing authenticated session and account controls.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_portraits;
revoke all on function nisfayn_test.rpc_before_portraits(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;target text;d jsonb;result jsonb;p nisfayn_test.member_portraits;pid uuid:=gen_random_uuid();level int;entry record;photo jsonb;begin
 if action in('portrait_info','portrait_prepare','portrait_commit','portrait_remove') then
  select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
  if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
  if action='portrait_info' then
   perform 1 from marriage.admin_test_members where actor=who and not paused and not suspended and review_status='approved' and access_until>now() for share;
  else
   perform 1 from marriage.admin_test_members where actor=who and not paused and not suspended and review_status='approved' and access_until>now() for update;
  end if;
  if not found then raise exception 'الحساب غير متاح حاليًا. راجع الإدارة.' using errcode='42501';end if;
  if action<>'portrait_info' and (select marriage.admin_review_revision(id) from marriage.admin_test_members where actor=who) is distinct from payload->>'expectedRevision' then
   raise exception 'تغيّر الملف. أعد تحميله قبل الحفظ.' using errcode='40001';end if;
  if action='portrait_info' then select data into d from nisfayn_test.room where id;
  else select data into d from nisfayn_test.room where id for update;end if;
  if action in('portrait_prepare','portrait_commit') and (coalesce(nisfayn_test.signup_consents_json(who)->>'version','')<>'2026-11-06-onboarding'
   or (nisfayn_test.signup_consents_json(who)->'photo') is distinct from 'true'::jsonb) then
   raise exception 'وافق على استخدام صورة الملف قبل رفعها.' using errcode='42501';end if;
  if action='portrait_info' then
   target:=coalesce(payload->>'subject',who);
   if payload?'id' then select actor into target from nisfayn_test.member_portraits where id=(payload->>'id')::uuid and ready;end if;
   if target is null then return null;end if;
   if target not in('reham','abdulrahman') or target<>who and d->'matched' is distinct from 'true'::jsonb then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
   if target<>who then
    perform 1 from marriage.admin_test_members where actor=target and not paused and not suspended and review_status='approved' and access_until>now() for share;
    if not found then raise exception 'الطرف الآخر غير متاح حاليًا.' using errcode='42501';end if;
   end if;
   return (select jsonb_build_object('id',id,'path',path,'blur',blur) from nisfayn_test.member_portraits where actor=target and ready);
  elsif action='portrait_prepare' then
   level:=(payload->>'blur')::int;
   if level is null or level not between 0 and 100 then raise exception 'درجة التمويه غير صالحة.' using errcode='22023';end if;
   delete from nisfayn_test.member_portraits where actor=who and not ready and created_at<=now()-interval '15 minutes';
   if (select count(*) from nisfayn_test.member_portraits where actor=who and not ready)>=3 then raise exception 'انتظر اكتمال رفع الصورة وحاول مجددًا.';end if;
   insert into nisfayn_test.member_portraits(id,actor,path,blur) values(pid,who,'test/'||who||'/'||pid::text||'.jpg',level) returning * into p;
   return jsonb_build_object('id',p.id,'path',p.path,'blur',p.blur);
  elsif action='portrait_commit' then
   select * into p from nisfayn_test.member_portraits where id=(payload->>'id')::uuid and actor=who;
   if p.id is null or (not p.ready and p.created_at<=now()-interval '15 minutes') then raise exception 'انتهت مهلة رفع الصورة.';end if;
   if not exists(select 1 from storage.objects where bucket_id='nisfayn-profile-portraits' and name=p.path
    and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 3145728) then raise exception 'لم يكتمل رفع الصورة.';end if;
   delete from nisfayn_test.member_portraits where actor=who and ready and id<>p.id;
   update nisfayn_test.member_portraits set ready=true where id=p.id;
  else delete from nisfayn_test.member_portraits where actor=who;end if;
  update marriage.admin_test_members set revision=revision+1 where actor=who;
  result:=nisfayn_test.rpc_before_portraits('state',session_token,'{}');
 else
  -- A JSON profile edit cannot forge storage paths or resurrect a removed portrait.
  if action='profile' and jsonb_typeof(payload->'profile')='object' then payload:=jsonb_set(payload,'{profile}',(payload->'profile')-'portrait');end if;
  result:=nisfayn_test.rpc_before_portraits(action,session_token,payload);
 end if;
 if jsonb_typeof(result->'profiles')='object' then
  who:=result->>'actor';
  if who is null then select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();end if;
  for entry in select a.key,coalesce(result#>array['profiles',a.key],'{}'::jsonb) value from (values('reham'),('abdulrahman')) a(key) loop
   photo:=null;
   if entry.key=who or result->'matched'='true'::jsonb and exists(select 1 from marriage.admin_test_members where actor=entry.key and not paused and not suspended and review_status='approved' and access_until>now()) then
    select jsonb_build_object('id',id,'path',path,'blur',blur) into photo from nisfayn_test.member_portraits where actor=entry.key and ready;
   end if;
   result:=jsonb_set(result,array['profiles',entry.key],entry.value||jsonb_build_object('portrait',photo));
  end loop;
 end if;
 return result;
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;

-- Cascaded account deletion and successful replacements revoke access immediately.
-- Only this private queue is consumed by the existing maintenance worker.
create table marriage.portrait_cleanup(path text primary key,queued_at timestamptz not null default now());
alter table marriage.portrait_cleanup enable row level security;
revoke all on marriage.portrait_cleanup from public,anon,authenticated,service_role;
create function marriage.queue_portrait_cleanup() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into marriage.portrait_cleanup(path) values(old.path) on conflict do nothing;return old;
end $$;
revoke all on function marriage.queue_portrait_cleanup() from public,anon,authenticated,service_role;
create trigger portrait_cleanup before delete on marriage.member_portraits for each row execute function marriage.queue_portrait_cleanup();
create trigger portrait_cleanup before delete on nisfayn_test.member_portraits for each row execute function marriage.queue_portrait_cleanup();
create function marriage.portrait_cleanup_batch() returns jsonb language plpgsql security definer set search_path='' as $$begin
 delete from marriage.member_portraits where not ready and created_at<now()-interval '15 minutes';
 delete from nisfayn_test.member_portraits where not ready and created_at<now()-interval '15 minutes';
 return coalesce((select jsonb_agg(path) from (select path from marriage.portrait_cleanup order by queued_at limit 100) q),'[]');
end $$;
create function marriage.portrait_cleanup_done(paths text[]) returns void language sql security definer set search_path='' as $$delete from marriage.portrait_cleanup where path=any(paths)$$;
create function public.marriage_portrait_cleanup_batch() returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_cleanup_batch()$$;
create function public.marriage_portrait_cleanup_done(paths text[]) returns void language sql security invoker set search_path='' as $$select marriage.portrait_cleanup_done($1)$$;
revoke all on function marriage.portrait_cleanup_batch(),marriage.portrait_cleanup_done(text[]),public.marriage_portrait_cleanup_batch(),public.marriage_portrait_cleanup_done(text[]) from public,anon,authenticated,service_role;
grant execute on function marriage.portrait_cleanup_batch(),marriage.portrait_cleanup_done(text[]),public.marriage_portrait_cleanup_batch(),public.marriage_portrait_cleanup_done(text[]) to service_role;
