-- New document collection stays closed until an approved verification method exists.
-- Preserve existing history, review, evidence access, withdrawal and cleanup.
create or replace function marriage.manual_verification_command(command text,input jsonb,test_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner text;uid uuid;staff marriage.staff_accounts;r marriage.manual_verification_requests;e marriage.manual_verification_evidence;
 claim_kind text;cid uuid;snapshot jsonb;fingerprint_value text;rid uuid;eid uuid;filename text;ext text;
begin
 if command in ('prepare','upload','submit') then
  raise exception 'إرسال مستندات التوثيق متوقف مؤقتًا إلى حين اعتماد طريقة تحقق مناسبة.'
   using errcode='42501',detail='verification_submission_restricted';
 end if;
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

-- Defense in depth for direct/legacy Storage calls, including service-role writes.
create function marriage.reject_verification_document_write() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.bucket_id='nisfayn-verification-evidence'
  or (tg_op='UPDATE' and old.bucket_id='nisfayn-verification-evidence') then
  raise exception 'إرسال مستندات التوثيق متوقف مؤقتًا إلى حين اعتماد طريقة تحقق مناسبة.'
   using errcode='42501',detail='verification_submission_restricted';
 end if;
 return new;
end $$;
revoke all on function marriage.reject_verification_document_write() from public,anon,authenticated,service_role;
create trigger restrict_verification_document_write
 before insert or update of bucket_id,name,metadata on storage.objects
 for each row execute function marriage.reject_verification_document_write();
create policy restrict_verification_document_insert on storage.objects as restrictive
 for insert to anon,authenticated with check(bucket_id<>'nisfayn-verification-evidence');
create policy restrict_verification_document_update on storage.objects as restrictive
 for update to anon,authenticated
 using(bucket_id<>'nisfayn-verification-evidence') with check(bucket_id<>'nisfayn-verification-evidence');
