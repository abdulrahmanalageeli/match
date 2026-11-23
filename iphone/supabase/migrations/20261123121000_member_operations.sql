-- Operational cases extend the member's existing private support tickets.
alter table marriage.support_requests
  add column assigned_staff uuid references marriage.staff_accounts(user_id) on delete set null,
  add column filter_requested_at timestamptz, add column filter_result jsonb,
  add column deletion_requested_at timestamptz,
  add column deletion_approved_at timestamptz;
create table marriage.support_case_notes (
  id bigint generated always as identity primary key,
  ticket uuid not null references marriage.support_requests(id) on delete cascade,
  actor uuid references marriage.staff_accounts(user_id) on delete set null,
  kind text not null, note text not null check(length(note) between 3 and 500),
  created_at timestamptz not null default now()
);
create index support_notes_ticket on marriage.support_case_notes(ticket,id desc);
alter table marriage.support_case_notes enable row level security;
revoke all on marriage.support_case_notes from public,anon,authenticated,service_role;

-- Future grants augment entitlements only after the advertised start.
create table marriage.scheduled_grants (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  tier text not null check(tier in ('premium','seriousness')),
  starts_at timestamptz not null, expires_at timestamptz not null check(expires_at>starts_at)
);
alter table marriage.scheduled_grants enable row level security;
revoke all on marriage.scheduled_grants from public,anon,authenticated,service_role;
create or replace function marriage.is_paid_before_owner_testing(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.is_paid_before_admin_grants(target)
 or exists(select 1 from marriage.admin_membership_grants where member_id=target and expires_at>now())
 or exists(select 1 from marriage.scheduled_grants where member_id=target and starts_at<=now() and expires_at>now())
$$;
create or replace function marriage.is_serious_before_owner_testing(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.is_serious_before_admin_grants(target)
 or exists(select 1 from marriage.admin_membership_grants where member_id=target and tier='seriousness' and expires_at>now())
 or exists(select 1 from marriage.scheduled_grants where member_id=target and tier='seriousness' and starts_at<=now() and expires_at>now())
$$;

alter function marriage.member_state(uuid) rename to member_state_before_scheduled_support;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_scheduled_support(target); finish timestamptz;
begin
 select expires_at into finish from marriage.scheduled_grants where member_id=target and starts_at<=now() and expires_at>now();
 if finish is not null and result#>'{membership,active}'='true'::jsonb then
   result:=jsonb_set(result,'{membership,expiresAt}',to_jsonb(greatest(finish,(result#>>'{membership,expiresAt}')::timestamptz)));
 end if;
 return result;
end $$;
revoke all on function marriage.member_state_before_scheduled_support(uuid),marriage.member_state(uuid) from public,anon,authenticated,service_role;

-- Give the member control of an owner-assisted deletion on their own ticket.
create function marriage.confirm_case_deletion(ticket uuid,approve boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.staff_identity();begin
 update marriage.support_requests set deletion_approved_at=case when approve then now() end,
 revision=revision+1,updated_at=now()
 where id=ticket and owner_id=me and status<>'resolved' and deletion_requested_at>now()-interval '48 hours';
 if not found then raise exception 'طلب الحذف غير متاح.';end if;return true;
end $$;
create function public.marriage_confirm_case_deletion(ticket uuid,approve boolean) returns boolean language sql security invoker set search_path='' as $$select marriage.confirm_case_deletion($1,$2)$$;
create or replace function marriage.support_summary(t marriage.support_requests) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',t.id,'category',t.category,'subject',t.subject,'body',t.body,'status',t.status,'response',t.response,'revision',t.revision,'createdAt',t.created_at,'updatedAt',t.updated_at,
  'deletionRequested',coalesce(t.deletion_requested_at>now()-interval '48 hours',false) and t.status<>'resolved',
  'deletionApproved',coalesce(t.deletion_approved_at>=t.deletion_requested_at and t.deletion_approved_at>now()-interval '48 hours',false))
$$;
revoke all on function marriage.confirm_case_deletion(uuid,boolean),public.marriage_confirm_case_deletion(uuid,boolean) from public,anon;
grant execute on function marriage.confirm_case_deletion(uuid,boolean),public.marriage_confirm_case_deletion(uuid,boolean) to authenticated;

create function marriage.ops_inspect(command text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner']); target uuid; peer uuid;
 query_text text:=btrim(input->>'query');result jsonb; usr auth.users; account marriage.members;
begin
 if command='lookup' then
  if query_text~'^[+٠-٩۰-۹0-9 ()-]+$' then
   query_text:=regexp_replace(translate(query_text,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[ ()-]','','g');
   if query_text~'^05[0-9]{8}$' then query_text:='+966'||substring(query_text from 2);end if;
  end if;
  if length(coalesce(query_text,'')) not between 2 and 254 then raise exception 'أدخل اسمًا أو معرّفًا أو وسيلة اتصال كاملة.';end if;
  return coalesce((select jsonb_agg(to_jsonb(s)) from (
    select u.id,coalesce(p.display_name,'تسجيل غير مكتمل') as label,m.review_status as status
    from auth.users u left join marriage.members m on m.id=u.id left join marriage.profiles p on p.member_id=u.id
    where not exists(select 1 from marriage.staff_accounts a where a.user_id=u.id)
      and not exists(select 1 from marriage.family_accounts f where f.user_id=u.id and m.id is null)
      and (u.id::text=query_text or lower(p.display_name)=lower(query_text)
       or (u.email_confirmed_at is not null and lower(u.email)=lower(query_text))
       or (query_text~'^\+?[1-9][0-9]{6,14}$' and
         ((u.phone_confirmed_at is not null and ltrim(u.phone,'+')=ltrim(query_text,'+'))
         or exists(select 1 from marriage.signup_phone_verifications v where v.user_id=u.id and ltrim(v.phone,'+')=ltrim(query_text,'+')))))
    order by u.created_at desc,u.id limit 30)s),'[]');
 end if;
 if command='staff' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'name',display_name,'role',role,'active',active) order by display_name) from marriage.staff_accounts),'[]');
 end if;
 target:=(input->>'member')::uuid;
 select * into usr from auth.users where id=target and not exists(select 1 from marriage.staff_accounts a where a.user_id=target);
 if not found then raise exception 'الحساب غير متاح.';end if;
 select * into account from marriage.members where id=target;
 if command='pair' then
  peer:=(input->>'peer')::uuid;
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
    values(staff.user_id,staff.display_name,staff.role,'pair_diagnostic','member',target,'مراجعة حالة التواصل بين حسابين');
  select jsonb_build_object('status',r.status,'agreement',coalesce(a.data->>'status','none'),'firstSigned',a.data->>'womanSignedAt','secondSigned',a.data->>'manSignedAt',
   'canChat',coalesce(r.status='accepted' and marriage.relationship_eligible(target,peer) and marriage.agreement_allows_communication(r.id),false),
   'occupiesSlot',r.status='accepted','updated',r.updated_at) into result
   from marriage.member_requests r left join marriage.conversation_agreements a on a.request_id=r.id
   where least(r.requester_id,r.recipient_id)=least(target,peer) and greatest(r.requester_id,r.recipient_id)=greatest(target,peer);
  return coalesce(result,'null'::jsonb);
 end if;
 if command='visibility' then
  if account.id is null or account.review_status<>'approved' or account.suspended or account.paused then return jsonb_build_object('eligible',0,'available',0);end if;
  return (select jsonb_build_object('available',count(*),'eligible',count(*) filter(where marriage.compatible(target,p.member_id)
    and marriage.new_pair_requirements(target,p.member_id)))
    from marriage.profiles p join marriage.profiles mine on mine.member_id=target and p.gender<>mine.gender
    join marriage.members m on m.id=p.member_id and m.review_status='approved' and not(m.suspended or m.paused or m.is_dummy)
    where not marriage.permanent_boundary(target,p.member_id) and marriage.relationship_member_allowed(p.member_id)
    and not exists(select 1 from marriage.discovery_choices c where c.member_id=target and c.subject_id=p.member_id and c.hidden));
 end if;
 if command<>'member' then raise exception 'طلب غير متاح.';end if;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
 values(staff.user_id,staff.display_name,staff.role,'operations_view','member',target,'عرض ملخص المتابعة والتشخيص');
 return jsonb_build_object('id',target,'signup',usr.created_at,'lastSignIn',usr.last_sign_in_at,
 'name',(select display_name from marriage.profiles where member_id=target),
 'providers',(select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id=target),
 'emailVerified',usr.email_confirmed_at is not null,'phoneVerified',usr.phone_confirmed_at is not null or exists(select 1 from marriage.signup_phone_verifications where user_id=target),
 'questionPrompts',(select coalesce(jsonb_agg(q.label order by q.position),'[]') from marriage.questions q join marriage.member_answers a on a.question_code=q.code where a.member_id=target),
 'personalityKeys',(select coalesce(jsonb_agg(a.question_code),'[]') from marriage.personality_answers a where a.member_id=target),
 'stage',account.review_status,'paused',account.paused,'suspended',account.suspended,'hasProfile',exists(select 1 from marriage.profiles where member_id=target),
 'city',(select c.label from marriage.profiles p join marriage.cities c on p.city_id=c.id where p.member_id=target),
 'draft',(select jsonb_build_object('step',document->>'step','updated',updated_at) from marriage.onboarding_drafts where member_id=target and expires_at>now()),
 'tier',case when account.id is not null then marriage.membership_tier(target) end,
 'grant',(select jsonb_build_object('tier',tier,'end',expires_at) from marriage.admin_membership_grants where member_id=target and expires_at>now()),
 'scheduled',(select jsonb_build_object('tier',tier,'start',starts_at,'end',expires_at) from marriage.scheduled_grants where member_id=target and expires_at>now()),
 'expectedEnd',greatest((select expires_at from marriage.admin_membership_grants where member_id=target and expires_at>now()),(select expires_at from marriage.scheduled_grants where member_id=target and expires_at>now()),marriage.apple_access_until(target),account.manual_access_until),
 'appleEnd',marriage.apple_access_until(target),'lastAppleCheck',(select max(last_support_checked_at) from marriage.subscription_owners where member_id=target),
 'connections',marriage.active_connections(target),'slotLimit',marriage.connection_limit(target),'outgoing',(select count(*) from marriage.member_requests where requester_id=target and status in ('pending','accepted')),'pending',(select count(*) from marriage.member_requests where requester_id=target and status='pending'),
 'repeatReview',marriage.repeat_registration(target),'reports',(select count(*) from marriage.reports where reported_id=target and resolved_at is null),
 'sessions',(select count(*) from auth.sessions where user_id=target and (not_after is null or not_after>now())),
 'fieldDates',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select field_id as field,confirmed_at as at,source from marriage.profile_answer_provenance where member_id=target and superseded_at is null order by confirmed_at desc,field_id limit 100)x),
 'filterResult',(select filter_result from marriage.support_requests where owner_id=target and filter_result is not null order by (filter_result->>'at')::timestamptz desc limit 1),
 'lastConfirmation',(select max(confirmed_at) from marriage.profile_answer_provenance where member_id=target and superseded_at is null),
 'portrait',(select jsonb_build_object('id',id,'policy',reveal_policy,'updated',created_at) from marriage.member_portraits where member_id=target and ready),
 'pushEnabled',coalesce((select enabled from marriage.push_preferences where member_id=target),false),
 'push',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select kind,created_at as at,case when outcome='sent' then 'accepted' else coalesce(outcome,'queued') end as outcome,attempts from marriage.push_outbox where member_id=target order by created_at desc limit 8)x),
 'tickets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select s.id,s.subject,s.status,s.revision,s.response,s.deletion_requested_at as requested,s.deletion_approved_at as approved,a.display_name as assignee from marriage.support_requests s left join marriage.staff_accounts a on a.user_id=s.assigned_staff where s.owner_id=target order by s.updated_at desc limit 30)x),
 'checks',(select coalesce(jsonb_agg(jsonb_build_object('ticket',c.ticket_id,'kind',c.check_kind,'ok',coalesce(marriage.ops_check(target,c.ticket_id,c.check_kind,c.expected,c.changed_at),false))),'[]') from marriage.support_checks c join marriage.support_requests t on t.id=c.ticket_id where t.owner_id=target and t.status<>'resolved'),
 'safetyHistory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select distinct r.id,r.reported_id as member,r.created_at as at,(r.resolved_at is not null) as closed from marriage.reports r where r.reported_id=target or exists(
 select 1 from marriage.members m where m.id=r.reported_id and m.suspended and (
 exists(select 1 from marriage.registration_devices a join marriage.registration_devices b on a.device_hash=b.device_hash where a.user_id=target and b.user_id=m.id)
 or exists(select 1 from marriage.signup_phone_verifications a join marriage.signup_phone_verifications b on a.phone=b.phone where a.user_id=target and b.user_id=m.id)))
 order by at desc limit 12)x),
 'privatePhotos',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'grants',(select count(*) from marriage.photo_grants g where g.photo_id=p.id and g.expires_at>now()))),'[]') from marriage.photo_assets p where p.owner_id=target and p.state='active'),
 'photoHistory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select kind,recorded_at as at,expires_at as until from marriage.photo_grant_log where owner_id=target order by id desc limit 12)x),
 'audit',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select action,actor_name as actor,created_at as at from marriage.staff_audit where target_id=target and target_type='member' and action<>'operations_view' order by id desc limit 40)x),
 'history',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select n.ticket,n.kind,n.note,n.created_at as at,a.display_name as actor from marriage.support_case_notes n join marriage.support_requests s on s.id=n.ticket left join marriage.staff_accounts a on a.user_id=n.actor where s.owner_id=target order by n.id desc limit 30)x));
end $$;
create function marriage.ops_action(command text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner']);
 target uuid:=(input->>'member')::uuid; ticket uuid:=(input->>'ticket')::uuid; op uuid:=(input->>'id')::uuid;
 memo text:=btrim(input->>'reason'); row_ticket marriage.support_requests; prior marriage.staff_audit;
 fingerprint text:=md5(jsonb_build_array(command,input-'id')::text); usr auth.users; account marriage.members;
 result jsonb:='{}'; n integer; chosen text; start_at timestamptz; end_at timestamptz; original_end timestamptz; chapter text;
 check_type text; check_value jsonb:='{}'; photo uuid; current_grant marriage.admin_membership_grants; future marriage.scheduled_grants; email text; phone text;
begin
 if op is null or target is null or length(coalesce(memo,'')) not between 3 and 500 then raise exception 'أدخل سببًا واضحًا.';end if;
 perform pg_advisory_xact_lock(hashtextextended(staff.user_id::text||op::text,0));
 select * into prior from marriage.staff_audit a where a.actor_id=staff.user_id and a.request_id=op;
 if found then
  if prior.request_fingerprint is distinct from fingerprint then raise exception 'تعارض في مرجع الإجراء.';end if;
  if command not in('contact','recovery_address') then return prior.result;end if;
 end if;
 if command='revoke_staff' then
  perform 1 from marriage.staff_accounts where user_id=target and active and role<>'owner' for update;
  if not found or target=staff.user_id then raise exception 'لا يمكن سحب هذه الصلاحية.';end if;
  update marriage.staff_accounts set active=false where user_id=target;
  result:='{"revoked":true}';
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
  values(staff.user_id,staff.display_name,staff.role,'revoke_staff','staff',target,memo,op,fingerprint,result);return result;
 end if;
 select * into usr from auth.users where id=target for update;
 if not found or exists(select 1 from marriage.staff_accounts where user_id=target) then raise exception 'الحساب غير متاح.';end if;
 select * into account from marriage.members where id=target for update;
 if command='open_case' then
  if input->>'category' not in ('help','billing','access','safety') or length(coalesce(btrim(input->>'subject'),'')) not between 3 and 140 then raise exception 'اختر نوع الحالة وأدخل عنوانًا.';end if;
  insert into marriage.support_requests(owner_id,client_id,category,subject,body,assigned_staff)
    values(target,op,input->>'category',btrim(input->>'subject'),'فتح فريق وُدَين طلب متابعة لحسابك.',staff.user_id) returning id into ticket;
  result:=jsonb_build_object('ticket',ticket);
 else
  select * into row_ticket from marriage.support_requests s where s.id=ticket and s.owner_id=target and s.status<>'resolved' for update;
  if not found then raise exception 'اختر طلب متابعة مفتوحًا لهذا الحساب.';end if;
  if command in ('assign','note') then
   if command='assign' then
    if not exists(select 1 from marriage.staff_accounts a where a.user_id=coalesce(nullif(input->>'assignee','')::uuid,staff.user_id) and a.active and a.role in('owner','moderator')) then raise exception 'اختر موظفًا يملك صلاحية الدعم.';end if;
    update marriage.support_requests set assigned_staff=coalesce(nullif(input->>'assignee','')::uuid,staff.user_id),status='in_review',updated_at=now(),revision=revision+1 where id=ticket;
   end if;
  elsif command='reply' then
   perform marriage.support('admin_reply',jsonb_build_object('id',ticket,'revision',input->'revision','requestId',op,'status',input->>'status','response',input->>'response'));
  elsif command in ('contact','recovery_address') then
   email:=case when usr.email_confirmed_at is not null then usr.email end;
   select coalesce((select phone from marriage.signup_phone_verifications where user_id=target),
    case when usr.phone_confirmed_at is not null then usr.phone end) into phone;
   if command='recovery_address' and (email is null or not exists(select 1 from auth.identities i where i.user_id=target and i.provider='email')) then raise exception 'تتاح استعادة كلمة المرور للحسابات المسجلة ببريد مؤكد.';end if;
   if prior.id is not null then return jsonb_build_object('email',email,'phone',case when command='contact' then phone end);end if;
  elsif command='grant' then
   n:=(input->>'days')::int; chosen:=input->>'tier';
   if account.id is null or chosen is null or chosen not in('seriousness','premium') or n is null or n not between 1 and 365 then raise exception 'راجع مدة المنحة وفئتها.';end if;
   select * into current_grant from marriage.admin_membership_grants where member_id=target and expires_at>now() for update;
   select * into future from marriage.scheduled_grants where member_id=target and expires_at>now() for update;
   if nullif(input->>'expectedEnd','')::timestamptz is distinct from greatest(future.expires_at,current_grant.expires_at,marriage.apple_access_until(target),account.manual_access_until) then raise exception 'تغير الاستحقاق. حدّث بيانات الحساب قبل المتابعة.';end if;
   if input->>'mode'='after' then
    if future.member_id is not null and future.tier<>chosen then raise exception 'توجد منحة مجدولة من فئة أخرى.';end if;
    start_at:=coalesce(future.starts_at,greatest(now(),marriage.apple_access_until(target),account.manual_access_until,current_grant.expires_at));
    end_at:=greatest(future.expires_at,start_at)+make_interval(days=>n);
    insert into marriage.scheduled_grants values(target,chosen,start_at,end_at)
     on conflict(member_id) do update set tier=excluded.tier,starts_at=excluded.starts_at,expires_at=excluded.expires_at;
   elsif input->>'mode'='extend' then
    if future.member_id is not null then raise exception 'مدّد المنحة المجدولة من خيار بعد الاستحقاق.';end if;
    if current_grant.member_id is not null and current_grant.tier<>chosen then raise exception 'اختر فئة المنحة الحالية لتمديدها.';end if;
    start_at:=now();end_at:=greatest(current_grant.expires_at,now())+make_interval(days=>n);
    insert into marriage.admin_membership_grants values(target,chosen,end_at) on conflict(member_id) do update set tier=excluded.tier,expires_at=excluded.expires_at;
   else raise exception 'اختر طريقة منح العضوية.';end if;
   update marriage.members set admin_revision=admin_revision+1 where id=target;
   result:=jsonb_build_object('starts',start_at,'ends',end_at,'tier',marriage.membership_tier(target));
  elsif command='revoke_grant' then
   if coalesce(input->>'source','') not in ('current','scheduled') then raise exception 'اختر المنحة المطلوبة.';end if;
   if input->>'source'='scheduled' then delete from marriage.scheduled_grants where member_id=target and expires_at=(input->>'end')::timestamptz;
   else delete from marriage.admin_membership_grants where member_id=target and expires_at=(input->>'end')::timestamptz;end if;
   if not found then raise exception 'تغيرت المنحة. حدّث الحساب.';end if;
   update marriage.members set admin_revision=admin_revision+1 where id=target;
   result:=jsonb_build_object('tier',marriage.membership_tier(target));
  elsif command='apple_check' then
   update marriage.subscription_owners set check_after=least(check_after,now()) where member_id=target;
   if not found then raise exception 'لا توجد معاملة مرتبطة بهذا الحساب. اطلب من العضو استخدام استعادة المشتريات.';end if;
   result:='{"queued":true}';
  elsif command='request_filters' then
   if not exists(select 1 from marriage.profiles where member_id=target) then raise exception 'لم يُستكمل الملف بعد.';end if;
   update marriage.support_requests set filter_requested_at=now(),filter_result=null,updated_at=now(),revision=revision+1,
    status='in_review',response='افتح الاكتشاف بخيارات البحث المعتادة، ثم شارك عدد النتائج من هذا الطلب حتى نراجع مشكلة الظهور.' where id=ticket;
  elsif command='offer_export' then
   if account.id is null then raise exception 'لا تتوافر نسخة بيانات عضو لهذا الحساب.';end if;
   update marriage.support_requests set export_offered_at=now(),export_opened_at=null,updated_at=now(),revision=revision+1,
    status='in_review',response='يمكنك فتح نسخة بياناتك الخاصة من هذا الطلب.' where id=ticket;
  elsif command in('verify_phone','verify_identity') then
   if command='verify_identity' and length(coalesce(btrim(input->>'field'),'')) not between 2 and 120 then raise exception 'حدّد بيان الهوية المطلوب مراجعته.';end if;
   update marriage.support_requests set reverify_kind=case command when 'verify_phone' then 'phone' else 'identity' end,
    previous_phone_tag=marriage.phone_claim_tag(usr.phone),reverified_at=null,remedial_at=now(),remedial_step=case when command='verify_identity' then 'identity' end,
    remedial_field=case when command='verify_identity' then btrim(input->>'field') end,updated_at=now(),revision=revision+1,
    status='in_review',response='لحماية حسابك، سجّل الدخول مجددًا ثم أكمل التحقق من هذا الطلب.' where id=ticket;
  elsif command='request_edit' then
   chapter:=input->>'chapter';
   if chapter is null or chapter not in ('identity','story','details','avatar','criteria','compatibility','personality','preferences','readiness','review')
    or length(coalesce(btrim(input->>'field'),'')) not between 2 and 120 then raise exception 'حدّد القسم والحقل المطلوب من العضو مراجعته.';end if;
   if chapter='identity' then raise exception 'استخدم إجراء التحقق لتصحيح بيانات الهوية.';end if;
   update marriage.support_requests set reverify_kind=null,reverified_at=null,previous_phone_tag=null,remedial_step=chapter,remedial_field=btrim(input->>'field'),remedial_at=now(),updated_at=now(),revision=revision+1,status='in_review',
    response='يرجى مراجعة الحقل الموضّح في هذا الطلب وتأكيده من حسابك.' where id=ticket;
  elsif command='private_withdraw' then
   photo:=(input->>'photo')::uuid;
   if not exists(select 1 from marriage.photo_assets a where a.id=photo and a.owner_id=target) then raise exception 'الصورة غير متاحة.';end if;
   delete from marriage.photo_grants where photo_id=photo;
   get diagnostics n=row_count;result:=jsonb_build_object('withdrawn',n);
  elsif command='city' then
   update marriage.profiles p set city_id=c.id from marriage.cities c where p.member_id=target and c.label=btrim(input->>'value')
   and (select label from marriage.cities where id=p.city_id)=input->>'before';
   if not found then raise exception 'تحقق من المدينة وتأكد من حداثة الملف.';end if;
   update marriage.members set admin_revision=admin_revision+1 where id=target;
   perform marriage.portrait_notify(target);result:=jsonb_build_object('city',input->>'value');
  elsif command='resume' then
   chapter:=input->>'chapter';
   if chapter is null or chapter not in ('identity','story','details','avatar','criteria','compatibility','personality','preferences','readiness','review') then raise exception 'اختر قسمًا صالحًا.';end if;
   perform pg_advisory_xact_lock(hashtextextended('onboarding-draft:'||target::text,0));
   update marriage.onboarding_drafts set document=document||jsonb_build_object('step',chapter,'savedAt',floor(extract(epoch from clock_timestamp())*1000),'returnToReview',false), updated_at=now()
   where member_id=target and updated_at=(input->>'before')::timestamptz and expires_at>now();
   if not found then raise exception 'للمسودة نسخة أحدث، أو انتهت صلاحيتها.';end if;
   result:=jsonb_build_object('step',chapter);
  elsif command='pair_refresh' then
   if input->>'peer' is null or target=(input->>'peer')::uuid then raise exception 'اختر الطرف الآخر.';end if;
   perform 1 from marriage.member_requests r where r.status='accepted' and target in(r.requester_id,r.recipient_id) and (input->>'peer')::uuid in(r.requester_id,r.recipient_id)
    and marriage.relationship_eligible(target,(input->>'peer')::uuid) and marriage.agreement_allows_communication(r.id) for share;
   if not found then raise exception 'لم تكتمل شروط المحادثة أو انتهت صلاحيتها.';end if;
   perform realtime.send('{}','changed','marriage:member:'||target::text,true);
   perform realtime.send('{}','changed','marriage:member:'||(input->>'peer')::uuid::text,true);
   result:='{"available":true}';
  elsif command='refresh' then
   perform marriage.portrait_notify(target);
   result:='{"refreshRequested":true}';
  elsif command='revoke_sessions' then
   select jsonb_build_object('sessions',coalesce(jsonb_agg(id),'[]')) into check_value from auth.sessions where user_id=target;
   delete from auth.sessions where user_id=target;
   select count(*) into n from auth.sessions where user_id=target;
   result:=jsonb_build_object('sessions',n);
  elsif command='hide_photo' then
   photo:=(input->>'photo')::uuid;
   delete from marriage.member_portraits where id=photo and member_id=target and ready;
   if not found then raise exception 'تغيّرت الصورة أو أُزيلت.';end if;
   perform marriage.portrait_notify(target);result:=jsonb_build_object('removed',photo);
  elsif command='retry_push' then
   select jsonb_build_object('jobs',coalesce(jsonb_agg(id),'[]')) into check_value from marriage.push_outbox where member_id=target and outcome='failed' and finished_at is not null and expires_at>now();
   update marriage.push_outbox set finished_at=null,outcome=null,lease_id=null,lease_until=null,available_at=now(),attempts=0
   where member_id=target and outcome='failed' and finished_at is not null and expires_at>now();
   get diagnostics n=row_count;if n=0 then raise exception 'لا يوجد إرسال فاشل صالح لإعادة المحاولة.';end if;result:=jsonb_build_object('queued',n);
  elsif command='request_deletion' then
   update marriage.support_requests set deletion_requested_at=now(),deletion_approved_at=null,status='in_review',
    response='وصل طلب حذف الحساب. راجع أثر الحذف وأكّد قرارك من هذا الطلب.',revision=revision+1,updated_at=now() where id=ticket;
  elsif command='delete' then
   if input->>'confirm' is distinct from target::text or row_ticket.deletion_requested_at is null
    or row_ticket.deletion_approved_at is null or row_ticket.deletion_approved_at<row_ticket.deletion_requested_at
    or row_ticket.deletion_requested_at<=now()-interval '48 hours' then raise exception 'يتطلب الحذف تأكيدًا حديثًا من العضو.';end if;
   if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) m
    where m->>'method' in ('totp','mfa/totp') and to_timestamp((m->>'timestamp')::double precision)>now()-interval '5 minutes') then raise exception 'أعد التحقق بخطوتين خلال خمس دقائق من الحذف.';end if;
   delete from auth.sessions where user_id=target;
   delete from auth.users where id=target;
   result:=jsonb_build_object('deleted',not exists(select 1 from auth.users where id=target));
  else raise exception 'إجراء غير متاح.';end if;
 end if;
 check_type:=case when command in('grant','revoke_grant','city','resume','apple_check','private_withdraw','retry_push','revoke_sessions','hide_photo') then command
  when command in('verify_phone','verify_identity') then 'verification' when command='offer_export' then 'export' when command='request_filters' then 'visibility' when command in('refresh','request_edit','pair_refresh') then 'member_confirm' end;
 if check_type is not null then
  if command='grant' then check_value:=jsonb_build_object('tier',chosen,'end',end_at);
  elsif command='revoke_grant' then check_value:=jsonb_build_object('source',input->>'source');
  elsif command in('city','resume','private_withdraw','hide_photo') then check_value:=jsonb_build_object('value',input->>'value','chapter',chapter,'photo',photo);end if;
  if command in('grant','revoke_grant') then delete from marriage.support_checks where ticket_id=ticket and check_kind in('grant','revoke_grant');end if;
  insert into marriage.support_checks(ticket_id,check_kind,expected) values(ticket,check_type,check_value)
   on conflict(ticket_id,check_kind) do update set expected=excluded.expected,changed_at=now();
 end if;
 if command<>'delete' then insert into marriage.support_case_notes(ticket,actor,kind,note) values(ticket,staff.user_id,command,memo);end if;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
 values(staff.user_id,staff.display_name,staff.role,'ops_'||command,'member',target,memo,op,fingerprint,result);
 if command in('contact','recovery_address') then return jsonb_build_object('email',email,'phone',case when command='contact' then phone end);end if;
 return result;
end $$;
create function public.marriage_ops_inspect(command text,input jsonb) returns jsonb language sql security invoker set search_path='' as $$select marriage.ops_inspect($1,$2)$$;
create function public.marriage_ops_action(command text,input jsonb) returns jsonb language sql security invoker set search_path='' as $$select marriage.ops_action($1,$2)$$;
revoke all on function marriage.ops_action(text,jsonb),marriage.ops_inspect(text,jsonb),public.marriage_ops_action(text,jsonb),public.marriage_ops_inspect(text,jsonb) from public,anon,service_role;
grant execute on function marriage.ops_action(text,jsonb),marriage.ops_inspect(text,jsonb),public.marriage_ops_action(text,jsonb),public.marriage_ops_inspect(text,jsonb) to authenticated;
-- Member-selected context shares only the adjacent text messages chosen in the report sheet.
alter table marriage.report_evidence add column context_messages jsonb not null default '[]'
  check(jsonb_typeof(context_messages)='array' and jsonb_array_length(context_messages)<=2);
create function marriage.report_incident_context(request_id uuid,message_id uuid,reason text,submission_id uuid,context_ids uuid[],allow_screen boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();report uuid; anchored marriage.thread_messages; snaps jsonb;
begin
 if message_id is null or context_ids is null or cardinality(context_ids) not between 1 and 2 then raise exception 'اختر رسالة أو رسالتين من سياق البلاغ.';end if;
 select * into anchored from marriage.thread_messages t where t.id=message_id and t.request_id=$1
 and exists(select 1 from marriage.member_requests r where r.id=$1 and me in(r.requester_id,r.recipient_id)) for share;
 if not found then raise exception 'الرسالة غير متاحة.';end if;
 if allow_screen then report:=public.marriage_report_incident_with_screen($1,$2,$3,$4);
 else report:=marriage.report_incident($1,$2,$3,$4);end if;
 if not exists(select 1 from marriage.report_evidence e where e.report_id=report and e.message_id=$2 and e.expires_at>now()) then raise exception 'مرفق البلاغ غير متاح.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'at',s.created_at,'fromReporter',s.sender_id=me,'body',s.body) order by s.created_at,s.id),'[]') into snaps
 from (
  (select * from marriage.thread_messages a where a.request_id=$1 and (a.created_at,a.id)<(anchored.created_at,anchored.id)
   order by a.created_at desc,a.id desc limit 1)
  union all (select * from marriage.thread_messages b where b.request_id=$1 and (b.created_at,b.id)>(anchored.created_at,anchored.id)
   order by b.created_at,b.id limit 1)
 ) s where s.id=any(context_ids) and s.deleted_at is null and not exists(select 1 from marriage.chat_media med where med.id=s.id);
 if jsonb_array_length(snaps)<>cardinality(context_ids) then raise exception 'تغيّرت رسالة السياق. راجع اختيارك.';end if;
 update marriage.report_evidence e set context_messages=snaps where e.report_id=report and (context_messages='[]' or context_messages=snaps);
 if not found then raise exception 'لا يمكن استبدال مرفق بلاغ سابق.';end if;
 return report;
end $$;
create function public.marriage_report_incident_context(request_id uuid,message_id uuid,reason text,submission_id uuid,context_ids uuid[],allow_screen boolean default false) returns uuid
language sql security invoker set search_path='' as $$select marriage.report_incident_context($1,$2,$3,$4,$5,$6)$$;
revoke all on function marriage.report_incident_context(uuid,uuid,text,uuid,uuid[],boolean),public.marriage_report_incident_context(uuid,uuid,text,uuid,uuid[],boolean) from public,anon,service_role;
grant execute on function marriage.report_incident_context(uuid,uuid,text,uuid,uuid[],boolean),public.marriage_report_incident_context(uuid,uuid,text,uuid,uuid[],boolean) to authenticated;
alter function marriage.report_excerpt(uuid) rename to report_excerpt_before_selected_context;
create function marriage.report_excerpt(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=marriage.report_excerpt_before_selected_context(target); additional text;begin
 if result is null then return null;end if;
 select string_agg(case when item->>'fromReporter'='true' then 'مقدّم البلاغ: ' else 'الطرف الآخر: ' end || (item->>'body'),E'\n' order by item->>'at',item->>'id') into additional
 from marriage.report_evidence e cross join lateral jsonb_array_elements(e.context_messages)item where e.report_id=target and e.expires_at>now();
 if additional is not null then result:=result||jsonb_build_object('body',coalesce(result->>'body','مرفق')||E'\n\nالسياق الذي أرفقه العضو\n'||additional);end if;
 return result;end $$;
revoke all on function marriage.report_excerpt_before_selected_context(uuid),marriage.report_excerpt(uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.report_excerpt(uuid) to authenticated;
alter table marriage.support_requests add column reverify_kind text check(reverify_kind in ('identity','phone')),
 add column reverified_at timestamptz, add column previous_phone_tag bytea;
-- Verification is linked to the original ticket. The member's data export
-- is generated inside their authenticated session, with only a receipt for staff.
alter table marriage.support_requests add column remedial_step text,add column remedial_field text,
 add column remedial_at timestamptz,add column export_offered_at timestamptz,add column export_opened_at timestamptz;
create table marriage.support_checks(
 ticket_id uuid references marriage.support_requests on delete cascade, check_kind text not null,
 expected jsonb not null, changed_at timestamptz not null default now(), primary key(ticket_id,check_kind)
);
alter table marriage.support_checks enable row level security;
revoke all on marriage.support_checks from public,anon,authenticated,service_role;
create table marriage.photo_grant_log(
 id bigint generated always as identity primary key,owner_id uuid not null references marriage.members(id) on delete cascade,
 photo_id uuid not null,kind text not null,expires_at timestamptz,recorded_at timestamptz not null default now()
);
create index photo_grant_log_owner on marriage.photo_grant_log(owner_id,id desc);
alter table marriage.photo_grant_log enable row level security;
revoke all on marriage.photo_grant_log from public,anon,authenticated,service_role;
create function marriage.log_support_photo_grant() returns trigger language plpgsql set search_path='' as $$
declare g marriage.photo_grants; target uuid;begin
 g:=case when tg_op='DELETE' then old else new end;
 select owner_id into target from marriage.photo_assets where id=g.photo_id;
 if target is not null then insert into marriage.photo_grant_log(owner_id,photo_id,kind,expires_at)
 values(target,g.photo_id,case tg_op when 'DELETE' then 'withdrawn' when 'UPDATE' then 'extended' else 'shared' end,g.expires_at);end if;
 return null;end $$;
create trigger ops_photo_grant after insert or update or delete on marriage.photo_grants for each row execute function marriage.log_support_photo_grant();
revoke all on function marriage.log_support_photo_grant() from public,anon,authenticated,service_role;
alter table marriage.subscription_owners add column last_support_checked_at timestamptz;
create or replace function public.marriage_finish_apple_check(original text) returns void language sql security definer set search_path='' as $$
 update marriage.subscription_owners set check_after=now()+interval '6 hours',last_support_checked_at=now() where original_id=original
$$;
create function marriage.ops_check(target uuid,ticket uuid,check_kind text,expected jsonb,changed timestamptz)
returns boolean language sql stable set search_path='' as $$
 select case check_kind
 when 'grant' then (exists(select 1 from marriage.admin_membership_grants where member_id=target and tier=expected->>'tier' and expires_at>=(expected->>'end')::timestamptz)
 or exists(select 1 from marriage.scheduled_grants where member_id=target and tier=expected->>'tier' and expires_at>=(expected->>'end')::timestamptz))
 when 'revoke_grant' then case expected->>'source' when 'scheduled' then not exists(select 1 from marriage.scheduled_grants where member_id=target and expires_at>now())
 else not exists(select 1 from marriage.admin_membership_grants where member_id=target and expires_at>now()) end
 when 'apple_check' then exists(select 1 from marriage.subscription_owners o where o.member_id=target and o.last_support_checked_at>=changed)
 when 'city' then exists(select 1 from marriage.profiles p join marriage.cities c on c.id=p.city_id where p.member_id=target and c.label=expected->>'value')
 when 'resume' then exists(select 1 from marriage.onboarding_drafts d where d.member_id=target and (d.document->>'step'=expected->>'chapter' or d.updated_at>changed))
 when 'revoke_sessions' then not exists(select 1 from auth.sessions where user_id=target and id=any(array(select jsonb_array_elements_text(expected->'sessions')::uuid)))
 when 'hide_photo' then not exists(select 1 from marriage.member_portraits where member_id=target and id=(expected->>'photo')::uuid and ready)
 when 'private_withdraw' then not exists(select 1 from marriage.photo_grants where photo_id=(expected->>'photo')::uuid and expires_at>now())
 when 'retry_push' then not exists(select 1 from marriage.push_outbox where id=any(array(select jsonb_array_elements_text(expected->'jobs')::uuid)) and (outcome is null or outcome<>'sent'))
 when 'verification' then exists(select 1 from marriage.support_requests t where t.id=ticket and t.owner_id=target and t.reverified_at>=changed)
 when 'visibility' then exists(select 1 from marriage.support_requests s where s.id=ticket and s.owner_id=target and (s.filter_result->>'at')::timestamptz>=changed)
 when 'export' then exists(select 1 from marriage.support_requests t where t.id=ticket and t.owner_id=target and t.export_opened_at>=changed)
 when 'member_confirm' then exists(select 1 from marriage.support_case_notes n where n.ticket=ticket and n.kind='member_confirmed' and n.created_at>=changed)
 else false end
$$;
revoke all on function marriage.ops_check(uuid,uuid,text,jsonb,timestamptz) from public,anon,authenticated,service_role;

alter function marriage.support(text,jsonb) rename to support_before_case_verification;
create function marriage.support(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t marriage.support_requests;me uuid;begin
 if action='admin_reply' and payload->>'status'='resolved' then
  perform marriage.require_staff(array['owner','moderator']);
  select * into t from marriage.support_requests s where s.id=(payload->>'id')::uuid for update;
  if exists(select 1 from marriage.support_checks c where c.ticket_id=t.id and not coalesce(marriage.ops_check(t.owner_id,t.id,c.check_kind,c.expected,c.changed_at),false)) then
   raise exception 'لم يتأكّد نجاح المعالجة بعد. اترك الطلب مفتوحًا.';end if;
 elsif action in('case_export','case_confirm','case_filters') then
  me:=marriage.staff_identity();
  select * into t from marriage.support_requests s where s.id=(payload->>'id')::uuid and s.owner_id=me and s.status<>'resolved' for update;
  if not found then raise exception 'طلب المتابعة غير متاح.';end if;
  if action='case_filters' then
   if t.filter_requested_at is null or t.filter_requested_at<now()-interval '7 days' or t.filter_result is not null then raise exception 'فحص الظهور غير متاح لهذا الطلب.';end if;
   update marriage.support_requests set filter_result=marriage.support_visibility_counts(payload->'options'),updated_at=now(),revision=revision+1 where id=t.id;
   return 'true'::jsonb;
  end if;
  if action='case_export' then
   if t.export_offered_at is null then raise exception 'لم تُجهّز نسخة لهذا الطلب.';end if;
   update marriage.support_requests set export_opened_at=now() where id=t.id;
   return marriage.personal_data();
  end if;
  if not exists(select 1 from marriage.support_checks c where c.ticket_id=t.id and c.check_kind='member_confirm') then raise exception 'لا يوجد إصلاح بانتظار تأكيدك.';end if;
  insert into marriage.support_case_notes(ticket,kind,note) values(t.id,'member_confirmed','أكّد العضو نجاح المعالجة من حسابه.');return 'true'::jsonb;
 end if;
 return marriage.support_before_case_verification(action,payload);
end $$;
revoke all on function marriage.support_before_case_verification(text,jsonb),marriage.support(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.support(text,jsonb) to authenticated;

create or replace function marriage.support_summary(t marriage.support_requests) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',t.id,'category',t.category,'subject',t.subject,'body',t.body,'status',t.status,'response',t.response,'revision',t.revision,
 'createdAt',t.created_at,'updatedAt',t.updated_at,'editStep',case when t.reverify_kind is null or t.reverified_at>=t.remedial_at then t.remedial_step end,'editField',t.remedial_field,
 'needsVerification',case when t.reverified_at is null and t.remedial_at>now()-interval '48 hours' then t.reverify_kind end,'exportOffered',t.export_offered_at is not null,
 'requestFilters',coalesce(t.filter_requested_at>now()-interval '7 days' and t.filter_result is null,false),
 'confirmRepair',exists(select 1 from marriage.support_checks c where c.ticket_id=t.id and c.check_kind='member_confirm' and not marriage.ops_check(t.owner_id,t.id,c.check_kind,c.expected,c.changed_at)),
 'deletionRequested',coalesce(t.deletion_requested_at>now()-interval '48 hours',false) and t.status<>'resolved',
 'deletionApproved',coalesce(t.deletion_approved_at>=t.deletion_requested_at and t.deletion_approved_at>now()-interval '48 hours',false))
$$;
create function marriage.scheduled_support_tier(target uuid) returns text language sql stable set search_path='' as $$
 select tier from marriage.scheduled_grants where member_id=target and starts_at<=now() and expires_at>now()
$$;
create or replace function marriage.launch_scheduled_tier(target uuid) returns text language sql stable set search_path='' as $$select marriage.scheduled_support_tier(target)$$;
revoke all on function marriage.scheduled_support_tier(uuid),marriage.launch_scheduled_tier(uuid) from public,anon,authenticated,service_role;
-- Sensitive corrections require a new sign-in after the staff request. A
-- replacement contact number must additionally pass the original SMS verifier.
create function marriage.ops_member_proof(ticket uuid,proof_hash text,device_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.staff_identity(); u auth.users; t marriage.support_requests; challenge marriage.signup_sms_challenges;
begin
 select * into t from marriage.support_requests s where s.id=ticket and s.owner_id=me and s.status<>'resolved' and s.reverify_kind is not null for update;
 if not found or t.remedial_at<now()-interval '48 hours' then raise exception 'انتهت صلاحية طلب التحقق.';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) method
   where method->>'method' in('password','oauth','otp','totp','mfa/totp','sso/saml','webauthn','passkey')
   and to_timestamp((method->>'timestamp')::double precision)>=t.remedial_at and to_timestamp((method->>'timestamp')::double precision)>now()-interval '15 minutes') then
   raise exception 'سجّل الخروج وادخل مجددًا بالطريقة المعتادة، ثم ارجع إلى هذا الطلب خلال ١٥ دقيقة.';end if;
 select * into u from auth.users where id=me for update;
 if t.reverify_kind='phone' then
  if u.phone_confirmed_at is not null and nullif(u.phone,'') is not null then
   -- GoTrue owns the phone login factor. Its verified phone_change OTP flow
   -- runs first; refresh the secondary contact binding only to that same number.
   if marriage.phone_claim_tag(u.phone) is not distinct from t.previous_phone_tag or nullif(to_jsonb(u)->>'phone_change','') is not null then return jsonb_build_object('authPhoneRequired',true);end if;
   insert into marriage.signup_phone_verifications(user_id,phone,verified_at) values(me,'+'||ltrim(u.phone,'+'),u.phone_confirmed_at)
    on conflict(user_id) do update set phone=excluded.phone,verified_at=excluded.verified_at;
  else
   if proof_hash is null or device_hash is null then return jsonb_build_object('smsRequired',true);end if;
   select * into challenge from marriage.signup_sms_challenges c where c.proof_hash=$2 for update;
   if not found or challenge.status<>'verified' or challenge.expires_at<=now() or challenge.verified_at<t.remedial_at or
    challenge.device_hash is distinct from $3 or lower(challenge.email) is distinct from lower(u.email) or u.email_confirmed_at is null then raise exception 'تحقق من الرقم الجديد بهذا الحساب والجهاز.';end if;
   update marriage.signup_sms_challenges c set status='used' where c.proof_hash=$2;
   insert into marriage.signup_phone_verifications(user_id,phone,verified_at) values(me,challenge.phone,challenge.verified_at)
    on conflict(user_id) do update set phone=excluded.phone,verified_at=excluded.verified_at;
  end if;
 end if;
 update marriage.support_requests set reverified_at=now(),updated_at=now(),revision=revision+1 where id=ticket;
 return jsonb_build_object('verified',true);
end $$;
create function public.marriage_ops_member_proof(ticket uuid,proof_hash text default null,device_hash text default null) returns jsonb
language sql security invoker set search_path='' as $$select marriage.ops_member_proof($1,$2,$3)$$;
revoke all on function marriage.ops_member_proof(uuid,text,text),public.marriage_ops_member_proof(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function marriage.ops_member_proof(uuid,text,text),public.marriage_ops_member_proof(uuid,text,text) to authenticated;

-- The count is calculated by the same eligibility, ranking and filter query as the member directory.
-- It runs under the requesting member's session and only through an open, member-authorized case.
do $migration$
declare body text; cut integer;
begin
 select replace(prosrc,chr(13),'') into body from pg_proc where oid='marriage.browse(jsonb)'::regprocedure;
 cut:=strpos(body,', page as (select * from eligible');
 if cut=0 or strpos(body,'luna_rank>=0')=0 then raise exception 'Unexpected directory query for support count';end if;
 body:=left(body,cut-1)||' select to_jsonb(count(*)) from eligible where luna_rank>=0); end';
 execute format('create function marriage.support_directory_count(options jsonb) returns jsonb language plpgsql security definer set search_path='''' as %L',body);
end $migration$;
create function marriage.support_visibility_counts(options jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; before_count jsonb; after_count jsonb;
begin
 if jsonb_typeof(options) is distinct from 'object' or octet_length(options::text)>8000 or options->>'mode' not in('all','recommended') then raise exception 'افتح الاكتشاف بخيارات البحث المطلوبة أولًا.';end if;
 options:=options-array['offset','subjectId','luna'];
 base:=jsonb_build_object('mode',options->>'mode','eligibleOnly',options->'eligibleOnly','includeIneligible',options->'includeIneligible');
 before_count:=marriage.support_directory_count(base);after_count:=marriage.support_directory_count(options);
 return jsonb_build_object('at',now(),'mode',options->>'mode','before',case when jsonb_typeof(before_count)='number' then before_count else '0'::jsonb end,'after',case when jsonb_typeof(after_count)='number' then after_count else '0'::jsonb end);
end $$;
revoke all on function marriage.support_directory_count(jsonb),marriage.support_visibility_counts(jsonb) from public,anon,authenticated,service_role;
