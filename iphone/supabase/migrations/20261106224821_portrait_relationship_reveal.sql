-- Nisfayn only. Preserve the rendered blur for discovery. A second, normalized
-- JPEG is retained only after explicit opt-in and is authorized for each viewer.
alter table marriage.member_portraits add column reveal_policy text not null default 'never'
 check(reveal_policy in('never','matched','serious','family')),add column clear_path text unique;
alter table nisfayn_test.member_portraits add column reveal_policy text not null default 'never'
 check(reveal_policy in('never','matched','serious','family')),add column clear_path text unique;
alter table marriage.member_portraits add constraint portrait_clear_policy check((reveal_policy='never')=(clear_path is null));
alter table nisfayn_test.member_portraits add constraint test_portrait_clear_policy check((reveal_policy='never')=(clear_path is null));

create function marriage.portrait_revealed(viewer uuid,subject uuid,policy text) returns boolean
language sql stable set search_path='' as $$
 select viewer<>subject and policy in('matched','serious','family')
  and marriage.is_paid(viewer) and marriage.is_paid(subject) and marriage.compatible(viewer,subject)
  and (
   exists(select 1 from marriage.member_requests r where r.status='accepted'
    and viewer in(r.requester_id,r.recipient_id) and subject in(r.requester_id,r.recipient_id)
    and (policy='matched' or exists(select 1 from marriage.stage_choices c where c.request_id=r.id
      and c.stage>=case when policy='serious' then 1 else 2 end
      and c.member_id in(viewer,subject) group by c.stage having count(distinct c.member_id)=2)))
   or policy='matched' and exists(select 1 from marriage.introductions i
    where i.member_a=least(viewer,subject) and i.member_b=greatest(viewer,subject) and i.closed_at is null
    and (select count(*) from marriage.introduction_decisions d where d.introduction_id=i.id and d.member_id in(viewer,subject))=2)
  )
$$;

create or replace function marriage.portrait_json(subject uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',id,'path',path,'blur',blur,'revealPolicy',reveal_policy,'hasClear',clear_path is not null)
 from marriage.member_portraits where member_id=$1 and ready
$$;
create function marriage.portrait_public(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',id,'path',path,'blur',blur,'revealed',marriage.portrait_revealed($1,$2,reveal_policy))
 from marriage.member_portraits where member_id=$2 and ready
$$;
create or replace function marriage.portrait_info(subject uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();target uuid:=coalesce(subject,me);begin
 if not marriage.gallery_access(target) then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
 return case when target=me then marriage.portrait_json(target) else marriage.portrait_public(me,target) end;
end $$;
create function marriage.portrait_view(photo_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.member_portraits;revealed boolean;begin
 select * into p from marriage.member_portraits where id=photo_id and ready;
 if p.id is null or not marriage.gallery_access(p.member_id) then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
 revealed:=marriage.portrait_revealed(me,p.member_id,p.reveal_policy);
 return jsonb_build_object('id',p.id,'path',case when revealed then p.clear_path else p.path end,
  'blur',case when revealed then 0 else p.blur end,'revealed',revealed);
end $$;
create function public.marriage_portrait_view(photo_id uuid) returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_view($1)$$;

create function marriage.portrait_prepare_v2(blur_level int,reveal_policy text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();result jsonb;p marriage.member_portraits;begin
 if reveal_policy is null or reveal_policy not in('never','matched','serious','family') then raise exception 'اختاري وقت إظهار الصورة.' using errcode='22023';end if;
 if reveal_policy<>'never' and blur_level=0 then raise exception 'أضيفي تمويهًا قبل اختيار الإظهار التلقائي.' using errcode='22023';end if;
 result:=marriage.portrait_prepare(blur_level);
 update marriage.member_portraits set reveal_policy=$2,clear_path=case when $2<>'never' then me::text||'/'||id::text||'-clear.jpg' end
  where id=(result->>'id')::uuid returning * into p;
 return result||jsonb_build_object('revealPolicy',p.reveal_policy,'hasClear',p.clear_path is not null)||
  case when p.clear_path is not null then jsonb_build_object('clearPath',p.clear_path) else '{}'::jsonb end;
end $$;
create function public.marriage_portrait_prepare_v2(blur_level int,reveal_policy text) returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_prepare_v2($1,$2)$$;

create function marriage.portrait_notify(subject uuid) returns void language plpgsql set search_path='' as $$
declare recipient uuid;begin
 for recipient in select subject union select case when r.requester_id=subject then r.recipient_id else r.requester_id end from marriage.member_requests r
  where r.status='accepted' and subject in(r.requester_id,r.recipient_id)
  union select case when i.member_a=subject then i.member_b else i.member_a end from marriage.introductions i where i.closed_at is null and subject in(i.member_a,i.member_b)
 loop perform realtime.send('{}','changed','marriage:member:'||recipient::text,true);end loop;
end $$;
alter function marriage.portrait_commit(uuid) rename to portrait_commit_before_reveal;
create function marriage.portrait_commit(photo_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.member_portraits;result jsonb;begin
 perform 1 from marriage.members where id=me for update;
 select * into p from marriage.member_portraits where id=photo_id and member_id=me;
 if p.clear_path is not null and not exists(select 1 from storage.objects where bucket_id='nisfayn-profile-portraits' and name=p.clear_path
  and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 3145728) then raise exception 'لم يكتمل رفع النسخة الواضحة.';end if;
 result:=marriage.portrait_commit_before_reveal(photo_id);perform marriage.portrait_notify(me);return result;
end $$;
create function marriage.portrait_policy(photo_id uuid,reveal_policy text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.member_portraits;begin
 perform 1 from marriage.members where id=me and not suspended for update;
 if not found then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 if (marriage.signup_consents_json(me)->'photo') is distinct from 'true'::jsonb then raise exception 'وافق على استخدام صورة الملف.' using errcode='42501';end if;
 if reveal_policy is null or reveal_policy not in('never','matched','serious','family') then raise exception 'اختاري وقت إظهار الصورة.' using errcode='22023';end if;
 select * into p from marriage.member_portraits where id=photo_id and member_id=me and ready for update;
 if p.id is null then raise exception 'تغيّرت الصورة. حدّثي الملف.' using errcode='40001';end if;
 if reveal_policy<>'never' and p.blur=0 then raise exception 'أضيفي تمويهًا قبل اختيار الإظهار التلقائي.' using errcode='22023';end if;
 if reveal_policy<>'never' and p.clear_path is null then raise exception 'اختاري الصورة مجددًا لإضافة النسخة الواضحة.' using errcode='22023';end if;
 if reveal_policy='never' and p.clear_path is not null then insert into marriage.portrait_cleanup(path) values(p.clear_path) on conflict do nothing;end if;
 update marriage.member_portraits set reveal_policy=$2,clear_path=case when $2='never' then null else clear_path end where id=p.id;
 perform marriage.portrait_notify(me);return marriage.portrait_json(me);
end $$;
create function public.marriage_portrait_policy(photo_id uuid,reveal_policy text) returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_policy($1,$2)$$;
alter function marriage.portrait_remove() rename to portrait_remove_before_reveal;
create function marriage.portrait_remove() returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin perform marriage.portrait_remove_before_reveal();perform marriage.portrait_notify(me);return true;end $$;

-- A guessed clear-object path is never sufficient. Reads re-evaluate the
-- active pair and its mutually confirmed stage at the Storage RLS boundary.
create or replace function marriage.portrait_storage(object_name text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.member_portraits;begin
 select * into p from marriage.member_portraits where path=object_name or clear_path=object_name;
 if p.id is null then return false;end if;
 if writing then return p.member_id=me and not p.ready and p.created_at>now()-interval '15 minutes'
  and exists(select 1 from marriage.members where id=me and not suspended)
  and (marriage.signup_consents_json(me)->'photo')='true'::jsonb;end if;
 if p.member_id=me then return true;end if;
 return p.ready and marriage.gallery_access(p.member_id) and
  (object_name=p.path or marriage.portrait_revealed(me,p.member_id,p.reveal_policy));
end $$;
create or replace function marriage.queue_portrait_cleanup() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into marriage.portrait_cleanup(path) values(old.path) on conflict do nothing;
 if old.clear_path is not null then insert into marriage.portrait_cleanup(path) values(old.clear_path) on conflict do nothing;end if;
 return old;
end $$;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_portrait_reveal;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_before_portrait_reveal($1,$2)||jsonb_build_object('portrait',marriage.portrait_public($1,$2))
$$;

-- Test sessions have the same policy, evaluated against the server-owned room.
create function nisfayn_test.portrait_revealed(viewer text,subject text,policy text,room jsonb) returns boolean language sql stable set search_path='' as $$
 select viewer<>subject and policy in('matched','serious','family') and room->'matched'='true'::jsonb
  and (select count(*) from marriage.admin_test_members where actor in(viewer,subject) and not paused and not suspended and review_status='approved' and access_until>now())=2
  and (policy='matched' or coalesce((room->>'stage')::int,0)>=case when policy='serious' then 1 else 2 end)
$$;
create function nisfayn_test.portrait_json(viewer text,subject text,room jsonb,resolve_path boolean default false) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',id,'path',case when $4 and v.revealed then clear_path else path end,
  'blur',case when $4 and v.revealed then 0 else blur end)||
  case when $1=$2 then jsonb_build_object('revealPolicy',reveal_policy,'hasClear',clear_path is not null)
  else jsonb_build_object('revealed',v.revealed) end
 from nisfayn_test.member_portraits p cross join lateral(select nisfayn_test.portrait_revealed($1,$2,p.reveal_policy,$3) revealed) v where actor=$2 and ready
$$;
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_portrait_reveal;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;target text;d jsonb;result jsonb;p nisfayn_test.member_portraits;policy text;entry record;photo jsonb;
begin
 if action in('portrait_info','portrait_prepare','portrait_commit','portrait_policy') then
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
  if action='portrait_info' then
   target:=coalesce(payload->>'subject',who);
   if payload?'id' then select actor into target from nisfayn_test.member_portraits where id=(payload->>'id')::uuid and ready;end if;
   if target is null then return null;end if;
   if target not in('reham','abdulrahman') or target<>who and d->'matched' is distinct from 'true'::jsonb then raise exception 'الصورة غير متاحة.' using errcode='42501';end if;
   if target<>who then
    perform 1 from marriage.admin_test_members where actor=target and not paused and not suspended and review_status='approved' and access_until>now() for share;
    if not found then raise exception 'الطرف الآخر غير متاح حاليًا.' using errcode='42501';end if;
   end if;
   return nisfayn_test.portrait_json(who,target,d,true);
  elsif action='portrait_prepare' then
   policy:=coalesce(payload->>'revealPolicy','never');
   if policy not in('never','matched','serious','family') then raise exception 'اختاري وقت إظهار الصورة.' using errcode='22023';end if;
   result:=nisfayn_test.rpc_before_portrait_reveal(action,session_token,payload);
   if policy<>'never' and (result->>'blur')::int=0 then raise exception 'أضيفي تمويهًا قبل اختيار الإظهار التلقائي.' using errcode='22023';end if;
   update nisfayn_test.member_portraits set reveal_policy=policy,clear_path=case when policy<>'never' then 'test/'||who||'/'||id::text||'-clear.jpg' end
    where id=(result->>'id')::uuid and actor=who returning * into p;
   return result||jsonb_build_object('revealPolicy',p.reveal_policy,'hasClear',p.clear_path is not null)||
    case when p.clear_path is not null then jsonb_build_object('clearPath',p.clear_path) else '{}'::jsonb end;
  elsif action='portrait_commit' then
   select * into p from nisfayn_test.member_portraits where id=(payload->>'id')::uuid and actor=who;
   if p.clear_path is not null and not exists(select 1 from storage.objects where bucket_id='nisfayn-profile-portraits' and name=p.clear_path
    and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 3145728) then raise exception 'لم يكتمل رفع النسخة الواضحة.';end if;
   result:=nisfayn_test.rpc_before_portrait_reveal(action,session_token,payload);
  else
   policy:=payload->>'revealPolicy';
   if policy is null or policy not in('never','matched','serious','family') then raise exception 'اختاري وقت إظهار الصورة.' using errcode='22023';end if;
   if (nisfayn_test.signup_consents_json(who)->'photo') is distinct from 'true'::jsonb then raise exception 'وافق على استخدام صورة الملف.' using errcode='42501';end if;
   select * into p from nisfayn_test.member_portraits where id=(payload->>'id')::uuid and actor=who and ready for update;
   if p.id is null then raise exception 'تغيّرت الصورة. حدّثي الملف.' using errcode='40001';end if;
   if policy<>'never' and p.blur=0 then raise exception 'أضيفي تمويهًا قبل اختيار الإظهار التلقائي.' using errcode='22023';end if;
   if policy<>'never' and p.clear_path is null then raise exception 'اختاري الصورة مجددًا لإضافة النسخة الواضحة.' using errcode='22023';end if;
   if policy='never' and p.clear_path is not null then insert into marriage.portrait_cleanup(path) values(p.clear_path) on conflict do nothing;end if;
   update nisfayn_test.member_portraits set reveal_policy=policy,clear_path=case when policy='never' then null else clear_path end where id=p.id;
   update marriage.admin_test_members set revision=revision+1 where actor=who;
   result:=nisfayn_test.rpc_before_portrait_reveal('state',session_token,'{}');
  end if;
 else result:=nisfayn_test.rpc_before_portrait_reveal(action,session_token,payload);end if;
 if jsonb_typeof(result->'profiles')='object' then
  who:=result->>'actor';
  for entry in select key,value from jsonb_each(result->'profiles') loop
   photo:=null;
   if entry.key=who or result->'matched'='true'::jsonb and exists(select 1 from marriage.admin_test_members where actor=entry.key and not paused and not suspended and review_status='approved' and access_until>now()) then
    photo:=nisfayn_test.portrait_json(who,entry.key,result,false);
   end if;
   result:=jsonb_set(result,array['profiles',entry.key,'portrait'],coalesce(photo,'null'::jsonb));
  end loop;
 end if;
 return result;
end $$;

revoke all on function marriage.portrait_revealed(uuid,uuid,text),marriage.portrait_public(uuid,uuid),marriage.portrait_prepare_v2(int,text),
 marriage.portrait_view(uuid),marriage.portrait_policy(uuid,text),marriage.portrait_notify(uuid),marriage.portrait_commit_before_reveal(uuid),
 marriage.portrait_commit(uuid),marriage.portrait_remove_before_reveal(),marriage.portrait_remove(),marriage.member_card_before_portrait_reveal(uuid,uuid),
 marriage.member_card(uuid,uuid),nisfayn_test.portrait_revealed(text,text,text,jsonb),nisfayn_test.portrait_json(text,text,jsonb,boolean),
 nisfayn_test.rpc_before_portrait_reveal(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb),public.marriage_portrait_view(uuid),
 public.marriage_portrait_prepare_v2(int,text),public.marriage_portrait_policy(uuid,text) from public,anon,authenticated,service_role;
grant execute on function marriage.portrait_view(uuid),marriage.portrait_prepare_v2(int,text),marriage.portrait_policy(uuid,text),
 marriage.portrait_commit(uuid),marriage.portrait_remove(),public.marriage_portrait_view(uuid),public.marriage_portrait_prepare_v2(int,text),public.marriage_portrait_policy(uuid,text) to authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
