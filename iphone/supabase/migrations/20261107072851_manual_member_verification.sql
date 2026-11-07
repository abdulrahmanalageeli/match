-- Manual review is a scoped, time-limited claim, independent of issuer receipts.
-- Documents never enter public buckets, member cards, audit results, or AI prompts.
create table marriage.manual_verification_requests (
 id uuid primary key default gen_random_uuid(),
 owner_key text not null,
 member_id uuid references marriage.members(id) on delete cascade,
 test_actor text check(test_actor in('reham','abdulrahman')),
 is_test boolean not null default false,
 kind text not null check(kind in('marital_status','identity','education','employment','preparation_course')),
 status text not null default 'draft' check(status in('draft','pending','changes_requested','approved','rejected','revoked','withdrawn','stale')),
 claim_snapshot jsonb not null,
 member_note text not null default '' check(length(member_note)<=500),
 consent_version text not null check(consent_version='manual-verification-v1'),
 consented_at timestamptz not null default now(),
 created_at timestamptz not null default now(),submitted_at timestamptz,
 reviewed_at timestamptz,reviewed_by uuid references marriage.staff_accounts(user_id) on delete set null,
 reason text,expires_at timestamptz,revision integer not null default 0,
 client_id uuid not null, fingerprint text not null,
 unique(owner_key,client_id),
 check((member_id is not null and test_actor is null and owner_key=member_id::text)
 or(member_id is null and test_actor is not null and owner_key='test:'||test_actor))
);
create index manual_verification_owner on marriage.manual_verification_requests(owner_key,kind,created_at desc);
create index manual_verification_queue on marriage.manual_verification_requests(status,created_at desc,id desc);
create unique index manual_verification_one_pending on marriage.manual_verification_requests(owner_key,kind) where status in('draft','pending');
create table marriage.manual_verification_evidence (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique references marriage.manual_verification_requests(id) on delete cascade,
 path text not null unique,file_name text not null check(length(file_name) between 1 and 120),
 mime_type text not null check(mime_type in('image/jpeg','image/png','application/pdf')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),
 delete_after timestamptz not null default now()+interval '1 day',deleted_at timestamptz
);
create index manual_verification_retention on marriage.manual_verification_evidence(delete_after) where deleted_at is null;
create table marriage.manual_verification_cleanup(path text primary key,created_at timestamptz not null default now());
create table marriage.manual_verification_events (
 id bigint generated always as identity primary key,request_id uuid not null,actor_key text not null,
 action text not null,created_at timestamptz not null default now()
);
create trigger manual_verification_events_immutable before update or delete on marriage.manual_verification_events
 for each row execute function marriage.immutable_staff_audit();
alter table marriage.manual_verification_requests enable row level security;
alter table marriage.manual_verification_evidence enable row level security;
alter table marriage.manual_verification_cleanup enable row level security;
alter table marriage.manual_verification_events enable row level security;
revoke all on marriage.manual_verification_requests,marriage.manual_verification_evidence,marriage.manual_verification_cleanup,marriage.manual_verification_events from public,anon,authenticated,service_role;
revoke all on sequence marriage.manual_verification_events_id_seq from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('nisfayn-verification-evidence','nisfayn-verification-evidence',false,5242880,array['image/jpeg','image/png','application/pdf']);
-- No storage.objects policies for this bucket. Only the checked Edge handler writes/streams it.

create function marriage.manual_verification_snapshot(owner text,claim_kind text,course text default '') returns jsonb
language plpgsql stable set search_path='' as $$
declare p jsonb;b jsonb;uid uuid;
begin
 if owner like 'test:%' then
  select data#>array['profiles',substring(owner from 6)] into p from nisfayn_test.room where id;
  b:=coalesce(p->'marriageBasics','{}');
 else
  uid:=owner::uuid;
  select jsonb_build_object('displayName',display_name,'age',age,'profession',profession,'education',(select education from marriage.profile_details where member_id=uid)) into p from marriage.profiles where member_id=uid;
  b:=marriage.basics_json(uid);
 end if;
 return case claim_kind
  when 'marital_status' then jsonb_build_object('maritalStatus',b->'maritalStatus','currentWives',b->'currentWives')
  when 'identity' then jsonb_build_object('displayName',p->'displayName','age',p->'age')
  when 'education' then jsonb_build_object('education',p->'education')
  when 'employment' then jsonb_build_object('profession',p->'profession')
  when 'preparation_course' then jsonb_build_object('course',btrim(course)) end;
end $$;
create function marriage.manual_verification_status(r marriage.manual_verification_requests) returns text language sql stable set search_path='' as $$
 select case when r.status='approved' and r.expires_at<=now() then 'expired'
 when r.status in('approved','pending') and r.claim_snapshot is distinct from marriage.manual_verification_snapshot(r.owner_key,r.kind,r.claim_snapshot->>'course') then 'stale' else r.status end
$$;
create function marriage.manual_verification_claims(owner text) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'label',case r.kind
 when 'marital_status' then 'الحالة الاجتماعية: '||case r.claim_snapshot->>'maritalStatus' when 'never_married' then 'لم يسبق الزواج' when 'divorced' then 'مطلق/ة' when 'widowed' then 'أرمل/ة' when 'married' then 'متزوج — عدد الزوجات: '||coalesce(r.claim_snapshot->>'currentWives','غير محدد') else 'تمت المراجعة' end
 when 'identity' then 'مستند هوية تمت مراجعته' when 'education' then 'المؤهل: '||(r.claim_snapshot->>'education')
 when 'employment' then 'العمل: '||(r.claim_snapshot->>'profession') else 'دورة التأهيل: '||(r.claim_snapshot->>'course') end,'reviewedAt',r.reviewed_at,'expiresAt',r.expires_at,'isTest',r.is_test or r.test_actor is not null or exists(select 1 from marriage.members where id=r.member_id and is_dummy)) order by r.kind),'[]')
 from marriage.manual_verification_requests r where r.owner_key=owner and marriage.manual_verification_status(r)='approved'
 and r.expires_at>now() and r.reviewed_at is not null
 and (exists(select 1 from marriage.admin_test_members m where m.actor=r.test_actor and m.review_status='approved' and not m.suspended and not m.paused and m.access_until>now()) or exists(select 1 from marriage.members m where m.id=r.member_id and m.review_status='approved' and not m.suspended and not m.paused))
$$;
create function marriage.manual_verification_item(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'memberId',r.owner_key,'memberName',case when r.test_actor is not null then case r.test_actor when 'reham' then 'رهام' else 'عبدالرحمن' end else (select display_name from marriage.profiles where member_id=r.member_id) end,
 'isDummy',r.is_test or r.test_actor is not null or exists(select 1 from marriage.members where id=r.member_id and is_dummy),'isTest',r.is_test or r.test_actor is not null or exists(select 1 from marriage.members where id=r.member_id and is_dummy),'accountSource',case when r.test_actor is null then 'member' else 'pair_test' end,
 'kind',r.kind,'status',marriage.manual_verification_status(r),'claimSnapshot',r.claim_snapshot,'memberNote',r.member_note,
 'submittedAt',r.submitted_at,'createdAt',r.created_at,'reviewedAt',r.reviewed_at,'reviewedByName',s.display_name,'reason',r.reason,'expiresAt',r.expires_at,'revision',r.revision,
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'fileName',e.file_name,'mimeType',e.mime_type,'sizeBytes',e.size_bytes,'available',e.deleted_at is null and e.delete_after>now() and exists(select 1 from storage.objects o where o.bucket_id='nisfayn-verification-evidence' and o.name=e.path))) from marriage.manual_verification_evidence e where e.request_id=r.id),'[]'))
 from marriage.manual_verification_requests r left join marriage.staff_accounts s on s.user_id=r.reviewed_by where r.id=target
$$;
create function marriage.manual_verification_state(owner text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('requests',coalesce((select jsonb_agg(marriage.manual_verification_item(x.id) order by x.created_at desc) from
 (select id,created_at from marriage.manual_verification_requests where owner_key=owner order by created_at desc limit 100)x),'[]'),
 'claims',marriage.manual_verification_claims(owner),'isTest',owner like 'test:%' or exists(select 1 from marriage.members where id::text=owner and is_dummy))
$$;
create function marriage.manual_verification_test_owner(token text) returns text language plpgsql stable set search_path='' as $$
declare actor_name text;
begin
 if token is null or token !~ '^[0-9a-f]{64}$' then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
 select s.actor into actor_name from nisfayn_test.sessions s join marriage.admin_test_members m on m.actor=s.actor
 where s.token_hash=sha256(token::bytea) and s.expires_at>now() and m.review_status='approved' and not m.suspended and not m.paused and m.access_until>now();
 if actor_name is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
 return 'test:'||actor_name;
end $$;
create function marriage.manual_verification_command(command text,input jsonb,test_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner text;uid uuid;staff marriage.staff_accounts;r marriage.manual_verification_requests;e marriage.manual_verification_evidence;
 claim_kind text;cid uuid;snapshot jsonb;fingerprint_value text;rid uuid;eid uuid;filename text;ext text;
begin
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>6000 then raise exception 'طلب غير صالح.' using errcode='22023';end if;
 if command='evidence' then
  select * into r from marriage.manual_verification_requests where id=(input->>'requestId')::uuid;
  if not found then raise exception 'المستند غير متاح.' using errcode='42501';end if;
  if coalesce(test_token,'')<>'' then owner:=marriage.manual_verification_test_owner(test_token);
   if owner<>r.owner_key then raise exception 'المستند غير متاح.' using errcode='42501';end if;
  elsif r.owner_key=auth.uid()::text then owner:=marriage.require_member()::text;
  else staff:=marriage.require_staff(array['owner','reviewer']);owner:='staff:'||staff.user_id::text;end if;
  select * into e from marriage.manual_verification_evidence where request_id=r.id and id=(input->>'evidenceId')::uuid;
  if not found or e.deleted_at is not null or e.delete_after<=now() or r.status in('withdrawn','draft') then raise exception 'المستند غير متاح.' using errcode='42501';end if;
  insert into marriage.manual_verification_events(request_id,actor_key,action) values(r.id,owner,'evidence_access');
  if staff.user_id is not null then
   insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
   values(staff.user_id,staff.display_name,staff.role,'verification_evidence_access','verification',r.id,'Authorized access to private verification evidence');
  end if;
  return jsonb_build_object('path',e.path,'mimeType',e.mime_type,'fileName',e.file_name,'sizeBytes',e.size_bytes);
 end if;
 if coalesce(test_token,'')<>'' then owner:=marriage.manual_verification_test_owner(test_token);
 else uid:=marriage.require_member();owner:=uid::text;end if;
 perform pg_advisory_xact_lock(hashtextextended('manual-verification:'||owner,0));
 if command='state' then return marriage.manual_verification_state(owner);end if;
 if command='prepare' then
  if uid is not null and exists(select 1 from marriage.members where id=uid and suspended) then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
  claim_kind:=input->>'kind';cid:=coalesce((input->>'clientId')::uuid,gen_random_uuid());filename:=btrim(input->>'fileName');
  if input->>'consentVersion' is distinct from 'manual-verification-v1' or input->'consent' is distinct from 'true'::jsonb
   or claim_kind is null or claim_kind not in('marital_status','identity','education','employment','preparation_course')
   or coalesce(input->>'mimeType','') not in('image/jpeg','image/png','application/pdf')
   or coalesce((input->>'sizeBytes')::numeric,0) not between 1 and 5242880 or (input->>'sizeBytes')::numeric<>trunc((input->>'sizeBytes')::numeric)
   or coalesce(length(filename),0) not between 1 and 120 or filename ~ '[[:cntrl:]/\\]'
   or length(coalesce(input->>'memberNote',''))>500 then raise exception 'وافق على المراجعة وأرفق JPEG أو PNG أو PDF حتى 5 ميغابايت.' using errcode='22023';end if;
  snapshot:=marriage.manual_verification_snapshot(owner,claim_kind,input->>'claimLabel');
  if (claim_kind='marital_status' and snapshot->>'maritalStatus' is null)
   or (claim_kind='identity' and (snapshot->>'displayName' is null or snapshot->>'age' is null))
   or (claim_kind='education' and length(btrim(coalesce(snapshot->>'education','')))=0)
   or (claim_kind='employment' and length(btrim(coalesce(snapshot->>'profession','')))=0)
   or (claim_kind='preparation_course' and length(coalesce(snapshot->>'course','')) not between 2 and 120) then raise exception 'أكمل البيانات المطلوبة في ملفك أولًا.' using errcode='22023';end if;
  fingerprint_value:=md5((input-'clientId')::text);
  select * into r from marriage.manual_verification_requests where owner_key=owner and client_id=cid;
  if found then
   if r.fingerprint<>fingerprint_value then raise exception 'معرّف طلب مستخدم.' using errcode='22023';end if;
   return jsonb_build_object('requestId',r.id,'evidenceId',(select id from marriage.manual_verification_evidence where request_id=r.id));
  end if;
  if exists(select 1 from marriage.manual_verification_requests where owner_key=owner and kind=claim_kind and status='pending') then raise exception 'يوجد طلب قيد المراجعة لهذا البند.' using errcode='22023';end if;
  if (select count(*) from marriage.manual_verification_requests where owner_key=owner and created_at>now()-interval '1 day')>=10 then raise exception 'حاول مجددًا غدًا.' using errcode='22023';end if;
  update marriage.manual_verification_evidence set delete_after=now() where request_id in(select id from marriage.manual_verification_requests where owner_key=owner and kind=claim_kind and status in('draft','changes_requested'));
  update marriage.manual_verification_requests set status='withdrawn',revision=revision+1 where owner_key=owner and kind=claim_kind and status in('draft','changes_requested');
  insert into marriage.manual_verification_requests(owner_key,member_id,test_actor,is_test,kind,claim_snapshot,member_note,consent_version,client_id,fingerprint)
   values(owner,uid,case when uid is null then substring(owner from 6) end,uid is null or exists(select 1 from marriage.members where id=uid and is_dummy),claim_kind,snapshot,coalesce(input->>'memberNote',''),'manual-verification-v1',cid,fingerprint_value) returning id into rid;
  ext:=case input->>'mimeType' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end;eid:=gen_random_uuid();
  insert into marriage.manual_verification_evidence(id,request_id,path,file_name,mime_type,size_bytes) values(eid,rid,rid::text||'/'||eid::text||'.'||ext,filename,input->>'mimeType',(input->>'sizeBytes')::integer);
  insert into marriage.manual_verification_events(request_id,actor_key,action) values(rid,owner,'consented');
  return jsonb_build_object('requestId',rid,'evidenceId',eid);
 end if;
 select * into r from marriage.manual_verification_requests where id=(input->>'requestId')::uuid and owner_key=owner for update;
 if not found then raise exception 'الطلب غير متاح.' using errcode='42501';end if;
 select * into e from marriage.manual_verification_evidence where request_id=r.id;
 if command='upload' then
  if r.status<>'draft' or e.delete_after<=now() or e.deleted_at is not null then raise exception 'أنشئ طلبًا جديدًا.' using errcode='22023';end if;
  return jsonb_build_object('path',e.path,'mimeType',e.mime_type,'sizeBytes',e.size_bytes);
 elsif command='submit' then
  if r.status='pending' then return marriage.manual_verification_state(owner);end if;
  if r.status<>'draft' or e.delete_after<=now() or e.deleted_at is not null
   or not exists(select 1 from storage.objects o where o.bucket_id='nisfayn-verification-evidence' and o.name=e.path and (o.metadata->>'size')::bigint=e.size_bytes)
   or r.claim_snapshot is distinct from marriage.manual_verification_snapshot(owner,r.kind,r.claim_snapshot->>'course') then raise exception 'ارفع المستند وتحقق من بيانات الملف أولًا.' using errcode='22023';end if;
  update marriage.manual_verification_requests set status='pending',submitted_at=now(),revision=revision+1 where id=r.id;
  -- Pending evidence has a bounded 90-day lifetime; review does not extend it indefinitely.
  update marriage.manual_verification_evidence set delete_after=now()+interval '90 days' where id=e.id;
  insert into marriage.manual_verification_events(request_id,actor_key,action) values(r.id,owner,'submitted');
 elsif command='withdraw' then
  if r.status<>'withdrawn' then
   update marriage.manual_verification_requests set status='withdrawn',revision=revision+1,expires_at=null where id=r.id;
   update marriage.manual_verification_evidence set delete_after=now() where id=e.id;
   insert into marriage.manual_verification_events(request_id,actor_key,action) values(r.id,owner,'withdrawn');
  end if;
 else raise exception 'إجراء غير متاح.' using errcode='22023';end if;
 return marriage.manual_verification_state(owner);
end $$;
create function public.marriage_manual_verification(action text,payload jsonb default '{}',test_token text default '') returns jsonb language sql security invoker set search_path='' as $$select marriage.manual_verification_command($1,$2,$3)$$;

create function marriage.admin_verifications(status_filter text,query text,before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']);needle text:=lower(btrim(coalesce(query,'')));stamp timestamptz;items jsonb;counts jsonb;next_cursor text;
begin
 if status_filter is null or status_filter not in('all','draft','pending','changes_requested','approved','rejected','revoked','withdrawn','expired','stale') or length(needle)>80 then raise exception 'تصفية غير صالحة.' using errcode='22023';end if;
 if before_id is not null then select created_at into stamp from marriage.manual_verification_requests where id=before_id;if not found then raise exception 'حدّث القائمة.' using errcode='22023';end if;end if;
 select '{"draft":0,"pending":0,"changes_requested":0,"approved":0,"rejected":0,"revoked":0,"withdrawn":0,"expired":0,"stale":0}'::jsonb||coalesce(jsonb_object_agg(status,n),'{}') into counts from(select marriage.manual_verification_status(r) status,count(*) n from marriage.manual_verification_requests r where r.status<>'draft' group by 1)x;
 select coalesce(jsonb_agg(x.item order by x.created_at desc,x.id desc),'[]') into items from(select r.id,r.created_at,marriage.manual_verification_item(r.id) item
 from marriage.manual_verification_requests r where r.status<>'draft' and (status_filter='all' or marriage.manual_verification_status(r)=status_filter)
 and(before_id is null or(r.created_at,r.id)<(stamp,before_id)) and(needle='' or position(needle in lower(marriage.manual_verification_item(r.id)->>'memberName'))>0)
 order by r.created_at desc,r.id desc limit 51)x;
 if jsonb_array_length(items)>50 then items:=items-50;next_cursor:=items->49->>'id';end if;
 return jsonb_build_object('items',items,'counts',counts,'nextCursor',next_cursor);
end $$;
create function public.marriage_admin_verifications(status_filter text default 'pending',query text default '',before_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select marriage.admin_verifications($1,$2,$3)$$;
alter table marriage.staff_audit drop constraint staff_audit_target_type_check;
alter table marriage.staff_audit add constraint staff_audit_target_type_check check(target_type in('member','report','staff','staff_invitation','family_link','verification'));
create function marriage.admin_verification_review(target uuid,decision text,expected_revision integer,note text,operation_id uuid,valid_days integer,confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']);r marriage.manual_verification_requests;prior marriage.staff_audit;fingerprint_value text;result jsonb;
begin
 if decision is null or decision not in('approve','reject','request_changes','revoke') or operation_id is null or expected_revision is null
 or length(btrim(coalesce(note,''))) not between 3 and 500 or confirmed is distinct from true then raise exception 'أكّد المراجعة وأدخل سبب القرار.' using errcode='22023';end if;
 fingerprint_value:=md5(jsonb_build_array(target,decision,expected_revision,btrim(note),valid_days,confirmed)::text);
 perform pg_advisory_xact_lock(hashtextextended(staff.user_id::text||operation_id::text,0));
 select * into prior from marriage.staff_audit where actor_id=staff.user_id and request_id=operation_id;
 if found then
  if prior.target_type<>'verification' or prior.request_fingerprint<>fingerprint_value then raise exception 'معرّف إجراء مستخدم.' using errcode='22023';end if;
  return marriage.manual_verification_item(target);
 end if;
 select * into r from marriage.manual_verification_requests where id=target for update;
 if not found then raise exception 'الطلب غير متاح.' using errcode='P0002';end if;
 if r.member_id=staff.user_id then raise exception 'لا يمكنك مراجعة طلبك الشخصي.' using errcode='42501';end if;
 if r.revision<>expected_revision then raise exception 'تغيّر الطلب. حدّث القائمة.' using errcode='40001';end if;
 if (decision='revoke' and r.status<>'approved') or(decision<>'revoke' and marriage.manual_verification_status(r)<>'pending') then raise exception 'الطلب لا يسمح بهذا القرار.' using errcode='22023';end if;
 if decision='approve' then
  if valid_days is null or valid_days not between 1 and (case r.kind when 'marital_status' then 90 else 365 end) then raise exception 'مدة التحقق غير صالحة.' using errcode='22023';end if;
  if not exists(select 1 from marriage.manual_verification_evidence e join storage.objects o on o.bucket_id='nisfayn-verification-evidence' and o.name=e.path where e.request_id=r.id and e.deleted_at is null and e.delete_after>now()) then raise exception 'المستند غير متاح للمراجعة.' using errcode='22023';end if;
  update marriage.manual_verification_requests set status='revoked',reason='استبدل بتحقق أحدث',revision=revision+1 where owner_key=r.owner_key and kind=r.kind and status='approved' and id<>r.id;
 end if;
 update marriage.manual_verification_requests set status=case decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'request_changes' then 'changes_requested' else 'revoked' end,
 reviewed_at=now(),reviewed_by=staff.user_id,reason=btrim(note),expires_at=case when decision='approve' then now()+make_interval(days=>valid_days) end,revision=revision+1 where id=target;
 update marriage.manual_verification_evidence set delete_after=least(delete_after,now()+interval '30 days') where request_id=target;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
 values(staff.user_id,staff.display_name,staff.role,'verification_'||decision,'verification',target,btrim(note),operation_id,fingerprint_value,jsonb_build_object('id',target,'action',decision,'isTest',r.is_test));
 return marriage.manual_verification_item(target);
end $$;
create function public.marriage_admin_verification_review(verification_id uuid,action text,expected_revision integer,reason text,request_id uuid,expires_in_days integer default 90,review_confirmed boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_verification_review($1,$2,$3,$4,$5,$6,$7)$$;

create function marriage.manual_verification_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
declare owner text;
begin
 if tg_table_schema='nisfayn_test' then
  update marriage.manual_verification_requests r set status='stale',reason='تغيّرت البيانات المرتبطة بالطلب',revision=revision+1
  where r.test_actor is not null and r.status in('approved','pending') and r.claim_snapshot is distinct from marriage.manual_verification_snapshot(r.owner_key,r.kind,r.claim_snapshot->>'course');
 else
  owner:=new.member_id::text;
  update marriage.manual_verification_requests r set status='stale',reason='تغيّرت البيانات المرتبطة بالطلب',revision=revision+1
  where r.owner_key=owner and r.status in('approved','pending') and r.claim_snapshot is distinct from marriage.manual_verification_snapshot(r.owner_key,r.kind,r.claim_snapshot->>'course');
 end if;
 update marriage.manual_verification_evidence e set delete_after=least(delete_after,now()+interval '30 days')
 where exists(select 1 from marriage.manual_verification_requests r where r.id=e.request_id and r.status='stale') and e.deleted_at is null;
 return new;
end $$;
-- An account that was ever marked dummy cannot turn its existing synthetic
-- evidence into genuine verification by clearing the account's dummy flag.
create function marriage.manual_verification_mark_test() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update marriage.manual_verification_requests set is_test=true where member_id=new.id and not is_test;
 return new;
end $$;
create trigger manual_verification_dummy_provenance after update of is_dummy on marriage.members for each row when(new.is_dummy) execute function marriage.manual_verification_mark_test();
create function marriage.manual_verification_audit_transition() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into marriage.manual_verification_events(request_id,actor_key,action) values(new.id,coalesce(auth.uid()::text,'system'),'status:'||old.status||'->'||new.status);
 return new;
end $$;
create trigger manual_verification_status_audit after update of status on marriage.manual_verification_requests for each row when(old.status is distinct from new.status) execute function marriage.manual_verification_audit_transition();
create trigger manual_verification_profile_changed after insert or update on marriage.profiles for each row execute function marriage.manual_verification_invalidate();
create trigger manual_verification_details_changed after insert or update on marriage.profile_details for each row execute function marriage.manual_verification_invalidate();
create trigger manual_verification_basics_changed after insert or update on marriage.member_basics for each row execute function marriage.manual_verification_invalidate();
create trigger manual_verification_test_profile_changed after update on nisfayn_test.room for each row when(old.data->'profiles' is distinct from new.data->'profiles') execute function marriage.manual_verification_invalidate();
create function marriage.manual_verification_enqueue_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into marriage.manual_verification_cleanup(path) values(old.path) on conflict do nothing;return old;end $$;
create trigger manual_verification_deleted_evidence before delete on marriage.manual_verification_evidence for each row execute function marriage.manual_verification_enqueue_delete();
create function marriage.manual_verification_cleanup_batch() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 insert into marriage.manual_verification_cleanup(path) select path from marriage.manual_verification_evidence where deleted_at is null and delete_after<=now() on conflict do nothing;
 return coalesce((select jsonb_agg(path) from(select path from marriage.manual_verification_cleanup order by created_at limit 100)x),'[]');
end $$;
create function marriage.manual_verification_cleanup_done(paths text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(array_length(paths,1),0)>100 then raise exception 'Invalid cleanup batch';end if;
 -- Confirm only objects actually absent from Storage; retries remain queued.
 update marriage.manual_verification_evidence e set deleted_at=now() where path=any(paths) and delete_after<=now()
 and not exists(select 1 from storage.objects o where o.bucket_id='nisfayn-verification-evidence' and o.name=e.path);
 delete from marriage.manual_verification_cleanup c where path=any(paths) and not exists(select 1 from storage.objects o where o.bucket_id='nisfayn-verification-evidence' and o.name=c.path);
end $$;
create function public.marriage_verification_cleanup_batch() returns jsonb language sql security invoker set search_path='' as $$select marriage.manual_verification_cleanup_batch()$$;
create function public.marriage_verification_cleanup_done(paths text[]) returns void language sql security invoker set search_path='' as $$select marriage.manual_verification_cleanup_done($1)$$;
create function marriage.test_manual_verification_badges(test_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner text:=marriage.manual_verification_test_owner(test_token);
begin return jsonb_build_object('reham',marriage.manual_verification_claims('test:reham'),'abdulrahman',marriage.manual_verification_claims('test:abdulrahman'));end $$;
create function public.marriage_test_manual_verification_badges(test_token text) returns jsonb language sql security invoker set search_path='' as $$select marriage.test_manual_verification_badges($1)$$;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_manual_verification;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_before_manual_verification($1,$2)||jsonb_build_object('manualVerifications',marriage.manual_verification_claims($2::text))
$$;

-- Helpers remain private. Public wrappers delegate to checked, private definers.
revoke all on function marriage.manual_verification_snapshot(text,text,text),marriage.manual_verification_status(marriage.manual_verification_requests),marriage.manual_verification_claims(text),marriage.manual_verification_item(uuid),marriage.manual_verification_state(text),marriage.manual_verification_test_owner(text),marriage.manual_verification_command(text,jsonb,text),marriage.admin_verifications(text,text,uuid),marriage.admin_verification_review(uuid,text,integer,text,uuid,integer,boolean),marriage.manual_verification_invalidate(),marriage.manual_verification_enqueue_delete(),marriage.manual_verification_cleanup_batch(),marriage.manual_verification_cleanup_done(text[]),marriage.test_manual_verification_badges(text),marriage.member_card(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function marriage.manual_verification_mark_test(),marriage.manual_verification_audit_transition() from public,anon,authenticated,service_role;
revoke all on function public.marriage_manual_verification(text,jsonb,text),public.marriage_admin_verifications(text,text,uuid),public.marriage_admin_verification_review(uuid,text,integer,text,uuid,integer,boolean),public.marriage_verification_cleanup_batch(),public.marriage_verification_cleanup_done(text[]),public.marriage_test_manual_verification_badges(text) from public,anon,authenticated,service_role;
grant usage on schema marriage to anon;
grant execute on function public.marriage_manual_verification(text,jsonb,text),marriage.manual_verification_command(text,jsonb,text) to anon,authenticated;
grant execute on function public.marriage_admin_verifications(text,text,uuid),marriage.admin_verifications(text,text,uuid),public.marriage_admin_verification_review(uuid,text,integer,text,uuid,integer,boolean),marriage.admin_verification_review(uuid,text,integer,text,uuid,integer,boolean) to authenticated;
grant execute on function public.marriage_verification_cleanup_batch(),public.marriage_verification_cleanup_done(text[]),marriage.manual_verification_cleanup_batch(),marriage.manual_verification_cleanup_done(text[]),public.marriage_test_manual_verification_badges(text),marriage.test_manual_verification_badges(text) to service_role;
