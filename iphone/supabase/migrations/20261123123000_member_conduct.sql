-- Member-facing decisions have their own text. Never reuse private staff notes or reporter identity.
create table marriage.conduct_cases (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references marriage.members(id) on delete cascade,
  kind text not null check (kind in ('warning','pledge','restriction','suspension')),
  origin text not null check (origin in ('staff','automated')),
  policy text not null check (policy in ('contact','safety','identity','privacy','other')),
  explanation text not null check (length(explanation) between 3 and 500),
  pledge text check (length(pledge) between 3 and 400),
  ends_at timestamptz,
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id) on delete set null,
  signal_ref uuid unique,
  detector text,
  report_id uuid references marriage.reports(id) on delete set null,
  acknowledged_at timestamptz,
  appealed_at timestamptz,
  appeal_note text check (length(appeal_note)<=800),
  needs_review boolean not null default false,
  decision text check (decision in ('upheld','lifted')),
  outcome text check (length(outcome) between 3 and 500),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  revision integer not null default 1,
  seen_revision integer not null default 0,
  check ((kind='pledge')=(pledge is not null)),
  check ((kind='restriction')=(ends_at is not null)),
  check (origin<>'automated' or (kind='restriction' and signal_ref is not null and detector is not null))
);
create index conduct_by_member on marriage.conduct_cases(member_id,issued_at desc,id desc);
create index conduct_reviews on marriage.conduct_cases(needs_review,issued_at desc,id desc);
alter table marriage.conduct_cases enable row level security;
revoke all on marriage.conduct_cases from public,anon,authenticated,service_role;

create function marriage.conduct_notice(c marriage.conduct_cases) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'kind',c.kind,'origin',c.origin,'policy',c.policy,
    'explanation',c.explanation,'pledge',c.pledge,'endsAt',c.ends_at,'issuedAt',c.issued_at,
    'acknowledgedAt',c.acknowledged_at,'appealedAt',c.appealed_at,'needsReview',c.needs_review,
    'decision',c.decision,'outcome',c.outcome,'reviewedAt',c.reviewed_at,
    'expired',coalesce(c.ends_at<=now(),false),'unread',c.seen_revision<c.revision,'revision',c.revision)
$$;
revoke all on function marriage.conduct_notice(marriage.conduct_cases) from public,anon,authenticated,service_role;

-- Apply the limit at the data write, including requests made by older app versions.
create function marriage.conduct_check_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='UPDATE' and old.status='pending' and old.requester_id=new.requester_id) or new.status<>'pending' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('conduct:'||new.requester_id,0));
  if exists(select 1 from marriage.conduct_cases c where c.member_id=new.requester_id
    and c.decision is distinct from 'lifted' and
    ((c.kind='restriction' and c.ends_at>now()) or (c.kind='pledge' and c.acknowledged_at is null))) then
    raise exception 'إرسال طلبات التعارف متوقف مؤقتًا. راجع إشعارات حسابك.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function marriage.conduct_check_request() from public,anon,authenticated,service_role;
create trigger conduct_check_request before insert or update of status,requester_id on marriage.member_requests
for each row execute function marriage.conduct_check_request();

create function marriage.member_conduct(command text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); c marriage.conduct_cases;
  note text:=trim(coalesce(input->>'note',''));
begin
  if command in ('read','ack','appeal') then
    select * into c from marriage.conduct_cases where id=(input->>'id')::uuid and member_id=me for update;
    if not found then raise exception 'الإشعار غير متاح.' using errcode='42501'; end if;
    if command='read' then
      update marriage.conduct_cases set seen_revision=greatest(seen_revision,least(revision,coalesce((input->>'revision')::int,0))) where id=c.id;
    elsif command='ack' then
      if c.kind not in ('warning','pledge') or c.decision='lifted' then raise exception 'هذا الإجراء غير متاح.' using errcode='22023'; end if;
      update marriage.conduct_cases set acknowledged_at=coalesce(acknowledged_at,now()),seen_revision=revision where id=c.id;
    elsif c.appealed_at is null then
      if c.decision='lifted' or length(note)>800 then raise exception 'تعذّر إرسال طلب المراجعة.' using errcode='22023'; end if;
      update marriage.conduct_cases set appealed_at=now(),appeal_note=nullif(note,''),needs_review=true,
        decision=null,outcome=null,reviewed_at=null,reviewed_by=null,revision=revision+1,seen_revision=revision+1 where id=c.id;
    end if;
  elsif command is distinct from 'list' then raise exception 'إجراء غير معروف.' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(marriage.conduct_notice(t) order by t.issued_at desc,t.id desc)
    from marriage.conduct_cases t where t.member_id=me
      and (t.issued_at>now()-interval '90 days' or t.needs_review or t.seen_revision<t.revision
        or (t.decision is distinct from 'lifted' and (t.kind='suspension' or (t.kind='pledge' and t.acknowledged_at is null))))),'[]');
end $$;
create function public.marriage_member_conduct(command text default 'list',input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select marriage.member_conduct($1,$2) $$;
revoke all on function marriage.member_conduct(text,jsonb),public.marriage_member_conduct(text,jsonb) from public,anon,service_role;
grant execute on function marriage.member_conduct(text,jsonb),public.marriage_member_conduct(text,jsonb) to authenticated;

-- Only a trusted detector can submit a hold. An incident points to an existing reported member,
-- repeats preserve the original expiry, and a detector has no route to suspend an account.
create function public.marriage_record_conduct_signal(signal_id uuid,incident_id uuid,detector_version text,
  policy_code text,member_explanation text,hold_minutes integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare subject uuid; existing marriage.conduct_cases;
begin
  if signal_id is null or incident_id is null or detector_version is null or detector_version !~ '^[A-Za-z0-9_.:-]{1,80}$'
    or policy_code is null or policy_code not in ('contact','safety','identity','privacy')
    or length(trim(coalesce(member_explanation,''))) not between 3 and 500 or hold_minutes is null or hold_minutes not between 1 and 360 then
    raise exception 'بيانات الإشارة غير صالحة.' using errcode='22023';
  end if;
  select r.reported_id into subject from marriage.reports r where r.id=incident_id and r.resolved_at is null;
  if subject is null then raise exception 'الحالة غير متاحة.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('conduct:'||subject,0));
  select * into existing from marriage.conduct_cases where signal_ref=signal_id;
  if found then
    if existing.report_id<>incident_id or existing.detector<>detector_version or existing.policy<>policy_code then
      raise exception 'تعارض مع إشارة سابقة.' using errcode='22023'; end if;
    return existing.id;
  end if;
  -- A replay with a different delivery key cannot lengthen the hold for the same report.
  select * into existing from marriage.conduct_cases where report_id=incident_id and origin='automated';
  if found then return existing.id; end if;
  -- Multiple reports cannot restart an automated hold while human review is outstanding.
  select * into existing from marriage.conduct_cases where member_id=subject and origin='automated'
    and (needs_review or (ends_at>now() and decision is distinct from 'lifted')) order by issued_at desc limit 1;
  if found then return existing.id; end if;
  insert into marriage.conduct_cases(member_id,kind,origin,policy,explanation,ends_at,signal_ref,report_id,detector,needs_review)
  values(subject,'restriction','automated',policy_code,trim(member_explanation),now()+make_interval(mins=>hold_minutes),signal_id,incident_id,detector_version,true)
  returning id into subject;
  return subject;
end $$;
revoke all on function public.marriage_record_conduct_signal(uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.marriage_record_conduct_signal(uuid,uuid,text,text,text,integer) to service_role;

-- A real staff suspension must have a member-facing case. Restoration also updates the notice.
create function marriage.sync_conduct_suspension() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.target_type<>'member' or new.action not in ('suspend','restore') or
   not exists(select 1 from marriage.members where id=new.target_id) then return new; end if;
 if new.action='suspend' then
   if not exists(select 1 from marriage.conduct_cases where member_id=new.target_id and kind='suspension'
     and decision is distinct from 'lifted') then
     -- Rolling back the enclosing transaction also rolls back closed requests and the
     -- account flag. Older admin clients cannot bypass the notice/emergency workflow.
     raise exception 'استخدم شاشة الإجراءات لتوضيح السبب للعضو وتأكيد التنبيه أو الحماية العاجلة.' using errcode='22023';
   end if;
 else
   update marriage.conduct_cases set decision='lifted',needs_review=false,reviewed_at=now(),reviewed_by=new.actor_id,
     outcome='رفع الفريق إيقاف الحساب.',revision=revision+1
     where member_id=new.target_id and kind='suspension' and decision is distinct from 'lifted';
 end if;
 return new;
end $$;
revoke all on function marriage.sync_conduct_suspension() from public,anon,authenticated,service_role;
create trigger conduct_suspension_receipt after insert on marriage.staff_audit for each row execute function marriage.sync_conduct_suspension();
insert into marriage.conduct_cases(member_id,kind,origin,policy,explanation)
select id,'suspension','staff','safety','حسابك موقوف عن التعارف. تقدر تطلب مراجعة القرار من الفريق.' from marriage.members where suspended;

create function marriage.staff_conduct(command text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','moderator']);
  c marriage.conduct_cases; subject uuid; action_kind text:=input->>'kind';
  basis text:=input->>'policy'; note text:=trim(coalesce(input->>'explanation','')); commitment text:=trim(coalesce(input->>'pledge',''));
  hours integer; operation uuid; choice text:=input->>'decision'; cutoff timestamptz; cursor_id uuid;
begin
 if command='list' then
   if input ? 'before' then
     select issued_at,id into cutoff,cursor_id from marriage.conduct_cases where id=(input->>'before')::uuid;
     if not found then raise exception 'حدّث القائمة.' using errcode='22023'; end if;
   end if;
   return coalesce((select jsonb_agg(marriage.conduct_notice(t)||jsonb_build_object('memberId',t.member_id,
      'appealNote',t.appeal_note,'detector',t.detector,'reportId',t.report_id) order by t.issued_at desc,t.id desc)
     from (select x.* from marriage.conduct_cases x where (coalesce(input->>'filter','review')='all' or x.needs_review)
       and (cutoff is null or (x.issued_at,x.id)<(cutoff,cursor_id))
       and (staff.role='owner' or x.origin='automated' or x.issued_by=staff.user_id or x.needs_review or exists(
        select 1 from marriage.report_reviews rr join marriage.reports r on r.id=rr.report_id
        where r.reported_id=x.member_id and rr.assigned_to=staff.user_id))
       order by x.issued_at desc,x.id desc limit 40) t),'[]');
 elsif command='issue' then
   subject:=(input->>'memberId')::uuid; operation:=(input->>'requestId')::uuid;
   if subject is null or subject=staff.user_id or operation is null or action_kind is null or action_kind not in ('warning','pledge','restriction','suspension')
     or basis is null or basis not in ('contact','safety','identity','privacy','other') or length(note) not between 3 and 500 then
     raise exception 'تحقّق من العضو وسبب الإجراء.' using errcode='22023'; end if;
   if action_kind='pledge' and length(commitment) not between 3 and 400 then raise exception 'اكتب نص التعهّد.' using errcode='22023'; end if;
   if action_kind='restriction' then
     hours:=(input->>'hours')::integer;
     if hours is null or hours not between 1 and 168 then raise exception 'حدد مدة بين ساعة وأسبوع.' using errcode='22023'; end if;
   end if;
   perform 1 from marriage.members where id=subject for update;
   if not found then raise exception 'الحساب غير متاح.' using errcode='42501'; end if;
   perform pg_advisory_xact_lock(hashtextextended('conduct:'||subject,0));
   if staff.role<>'owner' and not exists(select 1 from marriage.reports r join marriage.report_reviews rr on rr.report_id=r.id
      where r.reported_id=subject and r.resolved_at is null and rr.assigned_to=staff.user_id) then
     raise exception 'يلزم إسناد بلاغ مفتوح عن هذا العضو إليك.' using errcode='42501'; end if;
   select * into c from marriage.conduct_cases where id=operation;
   if found then
     if c.member_id<>subject or c.kind<>action_kind or c.issued_by is distinct from staff.user_id or c.policy<>basis or c.explanation<>note
       or (action_kind='pledge' and c.pledge<>commitment) or (action_kind='restriction' and c.ends_at<>c.issued_at+make_interval(hours=>hours)) then
       raise exception 'تعارض مع إجراء سابق.' using errcode='22023'; end if;
     return jsonb_build_object('id',c.id);
   end if;
   if action_kind in ('restriction','suspension') and not (coalesce((input->>'urgent')::boolean,false) and basis in ('safety','privacy','identity'))
     and not exists(select 1 from marriage.conduct_cases where member_id=subject and policy=basis and kind in ('warning','pledge')
       and seen_revision>0 and decision is distinct from 'lifted') then
     raise exception 'أرسل تنبيهًا واضحًا أولًا، أو حدد حماية عاجلة لسبب سلامة محدد.' using errcode='22023'; end if;
   insert into marriage.conduct_cases(id,member_id,kind,origin,policy,explanation,pledge,ends_at,issued_by)
   values(operation,subject,action_kind,'staff',basis,note,case when action_kind='pledge' then commitment end,
    case when action_kind='restriction' then now()+make_interval(hours=>hours) end,staff.user_id);
   if action_kind='suspension' then
     perform marriage.admin_review(subject,'suspend',marriage.admin_review_revision(subject),'قرار فريق السلامة: '||basis,gen_random_uuid());
   end if;
 elsif command='review' then
   select * into c from marriage.conduct_cases where id=(input->>'id')::uuid for update;
   if not found or c.member_id=staff.user_id or (staff.role<>'owner' and c.issued_by is distinct from staff.user_id and not c.needs_review
    and c.origin<>'automated') then raise exception 'الحالة غير متاحة للمراجعة.' using errcode='42501'; end if;
   if choice is null or choice not in ('upheld','lifted') or length(note) not between 3 and 500 then raise exception 'أدخل نتيجة وسببًا واضحًا للعضو.' using errcode='22023'; end if;
   if c.revision is distinct from (input->>'revision')::integer or c.decision='lifted' then raise exception 'تغيّرت الحالة. حدّث القائمة.' using errcode='40001'; end if;
   update marriage.conduct_cases set decision=choice,outcome=note,reviewed_by=staff.user_id,reviewed_at=now(),
    needs_review=false,revision=revision+1 where id=c.id;
   if c.kind='suspension' and choice='lifted' and exists(select 1 from marriage.members where id=c.member_id and suspended) then
     perform marriage.admin_review(c.member_id,'restore',marriage.admin_review_revision(c.member_id),'رفع الإيقاف بعد المراجعة',gen_random_uuid());
   end if;
   operation:=c.id; subject:=c.member_id;
 else raise exception 'إجراء غير متاح.' using errcode='22023'; end if;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,result)
 values(staff.user_id,staff.display_name,staff.role,'conduct_'||command,'member',subject,
   case when command='issue' then 'إصدار إجراء: '||action_kind||' / '||basis else 'مراجعة الإجراء: '||choice end,jsonb_build_object('caseId',operation));
 return jsonb_build_object('id',operation);
end $$;
create function public.marriage_staff_conduct(command text,input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select marriage.staff_conduct($1,$2)$$;
revoke all on function marriage.staff_conduct(text,jsonb),public.marriage_staff_conduct(text,jsonb) from public,anon,service_role;
grant execute on function marriage.staff_conduct(text,jsonb),public.marriage_staff_conduct(text,jsonb) to authenticated;

-- Explicit, per-message opt-in. This queue only keeps categorical findings; the report
-- evidence continues to expire through the existing evidence cleanup.
create table marriage.conduct_screenings (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid unique not null references marriage.report_evidence(report_id) on delete cascade,
  consent_version text not null default 'reported-message-screen-v1',
  finding text not null check(finding in ('direct_disclosure_threat','direct_personal_threat')),
  category_agrees boolean not null,
  created_at timestamptz not null default now(),
  lease uuid unique,
  lease_until timestamptz,
  classified_at timestamptz,
  result text check(result in('review','hold')),
  case_id uuid references marriage.conduct_cases(id) on delete set null,
  detector text
);
alter table marriage.conduct_screenings enable row level security;
revoke all on marriage.conduct_screenings from public,anon,authenticated,service_role;

create function marriage.report_incident_with_screen(request_id uuid,message_id uuid,reason text,submission_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare incident uuid; words text; finding text; self_id uuid:=marriage.require_member();
begin
 if message_id is null then raise exception 'اختر رسالة للبلاغ.' using errcode='22023'; end if;
 incident:=marriage.report_incident($1,$2,$3,$4);
 -- Even a replay cannot switch the message, reporter, or text attached to an incident.
 select trim(regexp_replace(translate(e.excerpt,'أإآًٌٍَُِّْـ','ااا'),'[[:space:][:punct:]؟،؛]+',' ','g')) into words
 from marriage.report_evidence e join marriage.reports r on r.id=e.report_id
 where r.id=incident and r.member_id=self_id and r.resolved_at is null and e.message_id=$2
   and e.expires_at>now() and e.excerpt is not null;
 finding:=case when words in ('بنشر صورك','راح انشر صورك','سانشر صورك','بنشر محادثاتك') then 'direct_disclosure_threat'
   when words in ('راح اقتلك','سوف اقتلك','ساقتلك') then 'direct_personal_threat' end;
 if finding is not null then
   insert into marriage.conduct_screenings(incident_id,finding,category_agrees)
    values(incident,finding,case when finding='direct_disclosure_threat' then split_part(reason,E'\n',1) in ('انتهاك الخصوصية','تهديد فوري للسلامة')
      else split_part(reason,E'\n',1)='تهديد فوري للسلامة' end)
    on conflict(incident_id) do nothing;
 end if;
 return incident;
end $$;
create function public.marriage_report_incident_with_screen(request_id uuid,message_id uuid,reason text,submission_id uuid)
returns uuid language sql security invoker set search_path='' as $$ select marriage.report_incident_with_screen($1,$2,$3,$4) $$;
revoke all on function marriage.report_incident_with_screen(uuid,uuid,text,uuid),public.marriage_report_incident_with_screen(uuid,uuid,text,uuid) from public,anon,service_role;
grant execute on function marriage.report_incident_with_screen(uuid,uuid,text,uuid),public.marriage_report_incident_with_screen(uuid,uuid,text,uuid) to authenticated;

-- Local routing adds matching reports to the existing safety queue. A rule match alone
-- never restricts a member. Preserve its existing urgency paging and role checks.
do $migration$
declare def text:=pg_get_functiondef('marriage.admin_reports(text,uuid)'::regprocedure);
begin
 if position('c.reason like ''تهديد فوري%'' and c.resolved_at is null' in def)=0 then raise exception 'Unexpected safety queue definition'; end if;
 execute replace(def,'c.reason like ''تهديد فوري%'' and c.resolved_at is null',
  '(c.reason like ''تهديد فوري%'' or exists(select 1 from marriage.conduct_screenings sc where sc.incident_id=c.id)) and c.resolved_at is null');
end $migration$;

-- The approved classifier can retrieve only a lease and two categorical signals. Neither
-- account IDs nor report text leave the DB. Its answer cannot select a victim, policy,
-- member-visible wording, duration, or permanent sanction.
revoke all on function public.marriage_record_conduct_signal(uuid,uuid,text,text,text,integer) from service_role;
create function public.marriage_conduct_classifier(command text,ticket uuid,model_version text,decision text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row_data marriage.conduct_screenings; incident marriage.reports; created_case uuid; policy_code text;
begin
 if ticket is null or model_version is null or model_version !~ '^[A-Za-z0-9_.:-]{1,80}$' then
   raise exception 'Invalid classifier receipt' using errcode='22023'; end if;
 -- Serialize duplicate delivery of the same signed ticket, including concurrent fetches.
 perform pg_advisory_xact_lock(hashtextextended('classifier:'||ticket,0));
 if command='claim' then
   select * into row_data from marriage.conduct_screenings where lease=ticket for update;
   if found then
     if row_data.classified_at is not null or row_data.detector<>model_version or row_data.lease_until<=now() then return null; end if;
   else
     select s.* into row_data from marriage.conduct_screenings s
       join marriage.reports r on r.id=s.incident_id and r.resolved_at is null
       join marriage.report_evidence e on e.report_id=s.incident_id and e.expires_at>now()
       where s.classified_at is null and coalesce(s.lease_until<=now(),true)
       order by s.created_at,s.id limit 1 for update of s skip locked;
     if not found then return null; end if;
     update marriage.conduct_screenings set lease=ticket,lease_until=now()+interval '3 minutes',detector=model_version where id=row_data.id;
   end if;
   return jsonb_build_object('finding',row_data.finding,'reportedCategoryAgrees',row_data.category_agrees);
 elsif command='finish' then
   if decision is null or decision not in ('review','hold') then raise exception 'Invalid classifier result' using errcode='22023'; end if;
   select * into row_data from marriage.conduct_screenings where lease=ticket and detector=model_version for update;
   if not found then raise exception 'Unknown classifier ticket' using errcode='22023'; end if;
   if row_data.classified_at is not null then
     if row_data.result<>decision then raise exception 'Conflicting classifier receipt' using errcode='22023'; end if;
     return jsonb_build_object('recorded',true);
   end if;
   select r.* into incident from marriage.reports r join marriage.report_evidence e on e.report_id=r.id and e.expires_at>now()
    where r.id=row_data.incident_id and r.resolved_at is null for share of r,e;
   if not found or row_data.lease_until<=now() then raise exception 'Classifier ticket expired' using errcode='22023'; end if;
   if decision='hold' and row_data.category_agrees then
     policy_code:=case when row_data.finding='direct_disclosure_threat' then 'privacy' else 'safety' end;
     created_case:=public.marriage_record_conduct_signal(row_data.id,incident.id,model_version,policy_code,
       case when policy_code='privacy' then 'أشار فحص آلي لرسالة مُبلّغ عنها إلى تهديد بانتهاك الخصوصية. أوقفنا إرسال الطلبات الجديدة مؤقتًا وأحلنا الحالة للفريق.'
       else 'أشار فحص آلي لرسالة مُبلّغ عنها إلى تهديد للسلامة. أوقفنا إرسال الطلبات الجديدة مؤقتًا وأحلنا الحالة للفريق.' end,60);
   end if;
   update marriage.conduct_screenings s set classified_at=now(),result=decision,case_id=created_case where s.id=row_data.id;
   return jsonb_build_object('recorded',true);
 end if;
 raise exception 'Invalid classifier command' using errcode='22023';
end $$;
revoke all on function public.marriage_conduct_classifier(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.marriage_conduct_classifier(text,uuid,text,text) to service_role;
