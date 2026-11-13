-- Keep onboarding photos private until the application is saved. A receipt is
-- owned by the authenticated member and bound to the immutable Storage object.
create table marriage.portrait_stages (
 photo_id uuid primary key references marriage.member_portraits(id) on delete cascade,
 member_id uuid not null references marriage.members(id) on delete cascade,
 declared_gender text not null check(declared_gender in('man','woman')),
 status text not null default 'uploaded' check(status in('uploaded','ready','verified','moderation','approved','rejected')),
 object_id text, created_at timestamptz not null default now(), submitted_at timestamptz,
 reviewed_at timestamptz, reviewed_by uuid, reason text
);
alter table marriage.portrait_stages enable row level security;
revoke all on marriage.portrait_stages from public,anon,authenticated,service_role;
create index portrait_stages_member on marriage.portrait_stages(member_id);

-- Preserve in-progress onboarding receipts while the remaining conversation is completed.
do $$declare definition text;begin
 definition:=pg_get_functiondef('marriage.portrait_prepare(integer)'::regprocedure);
 if strpos(definition,'and created_at<=now()-interval ''15 minutes''')=0 then raise exception 'Unexpected portrait prepare';end if;
 execute replace(definition,'and created_at<=now()-interval ''15 minutes''',
 'and created_at<=now()-interval ''15 minutes'' and (created_at<=now()-interval ''7 days'' or not exists(select 1 from marriage.portrait_stages s where s.photo_id=member_portraits.id))');
 definition:=pg_get_functiondef('marriage.portrait_cleanup_batch()'::regprocedure);
 execute replace(definition,'delete from marriage.member_portraits where not ready and created_at<now()-interval ''15 minutes'';',
 'delete from marriage.member_portraits where not ready and created_at<now()-interval ''15 minutes'' and (created_at<now()-interval ''7 days'' or not exists(select 1 from marriage.portrait_stages s where s.photo_id=member_portraits.id));');
end $$;

create function marriage.portrait_stage_prepare(blur_level int,policy text,gender text,photo_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p jsonb;begin
 if photo_consent is distinct from true or gender not in('man','woman') or gender is null then raise exception 'وافق على استخدام صورتك أولًا.' using errcode='42501';end if;
 if gender='man' and (blur_level<>0 or policy<>'never') then raise exception 'اختر صورة واضحة لوجهك.';end if;
 perform 1 from marriage.members where id=me and not suspended for update;
 if not found then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 if (marriage.signup_consents_json(me)->'photo') is distinct from 'true'::jsonb then
  insert into marriage.signup_consent_events(member_id,version,purpose,granted) values(me,'2026-11-06-onboarding','profile_photo',true);
 end if;
 -- Selecting a replacement cancels the previous pending choice, never a published photo.
 delete from marriage.member_portraits p where p.member_id=me and not p.ready and exists(select 1 from marriage.portrait_stages s where s.photo_id=p.id);
 p:=marriage.portrait_prepare_v2(blur_level,policy);
 insert into marriage.portrait_stages(photo_id,member_id,declared_gender) values((p->>'id')::uuid,me,gender);
 return p;
end $$;

create function marriage.portrait_stage_action(photo uuid,action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();s marriage.portrait_stages;p marriage.member_portraits;obj text;begin
 perform 1 from marriage.members where id=me and not suspended for update;
 if not found then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 select * into s from marriage.portrait_stages where photo_id=photo and member_id=me and created_at>now()-interval '7 days' for update;
 select * into p from marriage.member_portraits where id=s.photo_id;
 if s.photo_id is null then raise exception 'انتهت صلاحية الصورة. اخترها مجددًا.';end if;
 if (marriage.signup_consents_json(me)->'photo') is distinct from 'true'::jsonb then raise exception 'وافق على استخدام الصورة أولًا.' using errcode='42501';end if;
 select id::text into obj from storage.objects where bucket_id='nisfayn-profile-portraits' and name=p.path and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 3145728;
 if obj is null or s.object_id is not null and s.object_id<>obj then raise exception 'لم يكتمل رفع الصورة. اخترها مجددًا.';end if;
 if p.clear_path is not null and not exists(select 1 from storage.objects where bucket_id='nisfayn-profile-portraits' and name=p.clear_path and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 3145728) then raise exception 'لم يكتمل رفع النسخة الخاصة.';end if;
 if action='uploaded' then
  update marriage.portrait_stages set object_id=obj,status=case when declared_gender='woman' then 'ready' else status end where photo_id=photo;
 elsif action='moderation' then
  if s.status not in('uploaded','rejected') or p.ready then raise exception 'الصورة ليست بحاجة إلى هذه الخطوة.';end if;
  update marriage.portrait_stages set object_id=obj,status='moderation',submitted_at=now(),reason=null where photo_id=photo;
  -- An existing approved account also waits for review of this replacement.
  update marriage.members set review_status='pending' where id=me and review_status='approved';
 elsif action='finalize' then
  if not exists(select 1 from marriage.profiles where member_id=me) then raise exception 'أكمل بيانات ملفك أولًا.';end if;
  if s.status='moderation' then return null;end if;
  if s.status not in('verified','ready','approved') then raise exception 'أكمل التحقق من الصورة أو أرسلها للمراجعة.';end if;
  update marriage.member_portraits set created_at=now() where id=photo and not ready;
  return marriage.portrait_commit(photo);
 elsif action<>'status' then raise exception 'invalid_action';end if;
 select * into s from marriage.portrait_stages where photo_id=photo;
 return jsonb_build_object('id',photo,'status',s.status,'requiresFace',s.declared_gender='man','portrait',jsonb_build_object('id',p.id,'path',p.path,'blur',p.blur,'revealPolicy',p.reveal_policy,'hasClear',p.clear_path is not null));
end $$;
create function public.marriage_portrait_stage_prepare(blur_level int,policy text,gender text,photo_consent boolean) returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_stage_prepare($1,$2,$3,$4)$$;
create function public.marriage_portrait_stage_action(photo uuid,action text) returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_stage_action($1,$2)$$;
revoke all on function marriage.portrait_stage_prepare(int,text,text,boolean),marriage.portrait_stage_action(uuid,text),public.marriage_portrait_stage_prepare(int,text,text,boolean),public.marriage_portrait_stage_action(uuid,text) from public,anon,authenticated,service_role;
grant execute on function marriage.portrait_stage_prepare(int,text,text,boolean),marriage.portrait_stage_action(uuid,text),public.marriage_portrait_stage_prepare(int,text,text,boolean),public.marriage_portrait_stage_action(uuid,text) to authenticated;

create function public.marriage_portrait_stage_resume() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();p marriage.member_portraits;begin
 select p0.* into p from marriage.member_portraits p0 join marriage.portrait_stages s on s.photo_id=p0.id
 where p0.member_id=me and not p0.ready and s.created_at>now()-interval '7 days' order by s.created_at desc limit 1;
 if p.id is null then return null;end if;
 return marriage.portrait_stage_action(p.id,'status')||jsonb_build_object('clearPath',p.clear_path);
end $$;
revoke all on function public.marriage_portrait_stage_resume() from public,anon,authenticated,service_role;
grant execute on function public.marriage_portrait_stage_resume() to authenticated;

-- The server comparison can now precede the application. Gender is checked again
-- against the persisted profile at publication, so a declaration cannot bypass it.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.marriage_photo_face_begin(uuid,uuid,text,text)'::regprocedure);
 definition:=replace(definition,$old$not exists(select 1 from marriage.profiles where member_id=member and gender='man')$old$,$new$not exists(select 1 from marriage.profiles where member_id=member and gender='man') and not exists(select 1 from marriage.portrait_stages where photo_id=photo and member_id=member and declared_gender='man')$new$);
 definition:=replace(definition,$old$and created_at>now()-interval '15 minutes';$old$,$new$and (created_at>now()-interval '15 minutes' or exists(select 1 from marriage.portrait_stages s where s.photo_id=photo and s.created_at>now()-interval '7 days')); $new$);
 execute definition;
end $$;
alter function public.marriage_photo_face_finish(uuid,uuid,text) rename to marriage_photo_face_finish_before_staging;
revoke all on function public.marriage_photo_face_finish_before_staging(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.marriage_photo_face_finish(attempt uuid,member uuid,image_hash text) returns boolean language plpgsql security definer set search_path='' as $$begin
 perform public.marriage_photo_face_finish_before_staging(attempt,member,image_hash);
 update marriage.portrait_stages s set status='verified',object_id=c.object_id
 from marriage.photo_face_checks c where c.id=attempt and c.member_id=member and c.kind='portrait' and s.photo_id=c.photo_id and s.member_id=member and s.status in('uploaded','rejected','moderation');
 return true;
end $$;
revoke all on function public.marriage_photo_face_finish(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.marriage_photo_face_finish(uuid,uuid,text) to service_role;

create or replace function marriage.enforce_photo_face_check() returns trigger language plpgsql security definer set search_path='' as $$
declare target_kind text:=case when tg_table_name='member_portraits' then 'portrait' else 'gallery' end;proof uuid;s marriage.portrait_stages;begin
 if not new.ready or (tg_op='UPDATE' and old.ready) then return new;end if;
 if target_kind='portrait' then
  select * into s from marriage.portrait_stages where photo_id=new.id;
  if s.photo_id is not null then
   if s.status not in('verified','ready','approved') or not exists(select 1 from storage.objects where id::text=s.object_id and name=new.path and bucket_id='nisfayn-profile-portraits') then raise exception 'الصورة بانتظار التحقق أو المراجعة.' using errcode='42501';end if;
   if s.status='approved' then return new;end if;
   if not exists(select 1 from marriage.profiles where member_id=new.member_id) then raise exception 'أكمل بيانات ملفك قبل نشر الصورة.' using errcode='42501';end if;
  end if;
 end if;
 if not exists(select 1 from marriage.profiles where member_id=new.member_id and gender='man') then return new;end if;
 select c.id into proof from marriage.photo_face_checks c join storage.objects o on o.id::text=c.object_id
 where c.member_id=new.member_id and c.photo_id=new.id and c.kind=target_kind and c.matched_at is not null and c.consumed_at is null
 and (c.created_at>now()-interval '15 minutes' or s.status='verified' and s.created_at>now()-interval '7 days')
 and o.name=new.path and o.bucket_id=case when target_kind='portrait' then 'nisfayn-profile-portraits' else 'nisfayn-profile-gallery' end
 order by c.created_at desc limit 1 for update of c;
 if proof is null then raise exception 'تحقق من مطابقة صورتك عبر الكاميرا قبل نشرها.' using errcode='42501';end if;
 update marriage.photo_face_checks set consumed_at=now() where id=proof;
 return new;
end $$;

create function marriage.has_onboarding_portrait(member uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from marriage.member_portraits p left join marriage.portrait_stages s on s.photo_id=p.id
 where p.member_id=$1 and (p.ready and (s.photo_id is null or s.status in('verified','approved')) or s.created_at>now()-interval '7 days' and s.status in('verified','moderation','approved')))
$$;
revoke all on function marriage.has_onboarding_portrait(uuid) from public,anon,authenticated,service_role;

create function marriage.guard_portrait_approval() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.review_status='approved' and old.review_status is distinct from 'approved' and exists(select 1 from marriage.portrait_stages s join marriage.member_portraits p on p.id=s.photo_id where s.member_id=new.id and not p.ready and s.status in('uploaded','moderation','rejected')) then
  raise exception 'راجع صورة الملف أولًا قبل اعتماد العضوية.' using errcode='42501';
 end if;return new;
end $$;
revoke all on function marriage.guard_portrait_approval() from public,anon,authenticated,service_role;
create trigger member_portrait_approval before update of review_status on marriage.members for each row execute function marriage.guard_portrait_approval();

create function public.marriage_admin_portrait_queue() returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform marriage.require_staff(array['owner','reviewer']);
 return coalesce((select jsonb_agg(row_to_json(q) order by q."submittedAt") from
 (select s.photo_id id,s.member_id "memberId",p.display_name "displayName",s.status,s.submitted_at "submittedAt" from marriage.portrait_stages s left join marriage.profiles p on p.member_id=s.member_id where s.status='moderation' order by s.submitted_at limit 100) q),'[]'::jsonb);
end $$;
create function public.marriage_admin_portrait_media(photo uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']);p marriage.member_portraits;begin
 select p0.* into p from marriage.member_portraits p0 join marriage.portrait_stages s on s.photo_id=p0.id where p0.id=photo and s.status='moderation';
 if p.id is null then raise exception 'الصورة غير متاحة للمراجعة.' using errcode='42501';end if;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason) values(staff.user_id,staff.display_name,staff.role,'portrait_viewed','member',p.member_id,'فتح صورة أرسلها العضو للمراجعة اليدوية');
 return jsonb_build_object('bucket','nisfayn-profile-portraits','path',p.path);
end $$;
create function public.marriage_admin_portrait_decide(photo uuid,approved boolean,review_reason text) returns boolean language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']);s marriage.portrait_stages;begin
 if length(btrim(review_reason)) not between 3 and 500 or approved is null then raise exception 'اكتب سببًا واضحًا للقرار.';end if;
 select * into s from marriage.portrait_stages where photo_id=photo and status='moderation' for update;
 if s.photo_id is null then raise exception 'تغيّر الطلب. حدّث القائمة.';end if;
 perform 1 from marriage.members where id=s.member_id for update;
 update marriage.portrait_stages set status=case when approved then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=staff.user_id,reason=btrim(review_reason) where photo_id=photo;
 if approved then
  delete from marriage.member_portraits where member_id=s.member_id and ready and id<>photo;
  update marriage.member_portraits set ready=true where id=photo;
 end if;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason) values(staff.user_id,staff.display_name,staff.role,case when approved then 'portrait_approved' else 'portrait_rejected' end,'member',s.member_id,btrim(review_reason));
 perform marriage.portrait_notify(s.member_id);
 return true;
end $$;
revoke all on function public.marriage_admin_portrait_queue(),public.marriage_admin_portrait_media(uuid),public.marriage_admin_portrait_decide(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.marriage_admin_portrait_queue(),public.marriage_admin_portrait_media(uuid),public.marriage_admin_portrait_decide(uuid,boolean,text) to authenticated;
