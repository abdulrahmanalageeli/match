-- Private declarations and scoped verification receipts. No identity provider is
-- enabled by this migration; membership approval is never identity verification.
create table marriage.readiness_passports (
 owner_key text primary key,
 member_id uuid unique references marriage.members(id) on delete cascade,
 test_actor text unique references marriage.admin_test_members(actor) on delete cascade,
 consent_version text not null check(consent_version='readiness-v1'),
 consented_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 timeline text not null check(timeline in('within_6_months','6_to_12_months','over_12_months','exploring')),
 family text not null check(family in('discussed','ready_to_discuss','not_yet')),
 check((member_id is not null and test_actor is null and owner_key=member_id::text) or
       (member_id is null and test_actor is not null and owner_key='test:'||test_actor))
);
create table marriage.readiness_preparation (
 owner_key text not null references marriage.readiness_passports on delete cascade,
 topic text not null check(topic in('communication','budget','housing','responsibilities','course')),
 state text not null check(state in('not_started','in_progress','ready')),
 primary key(owner_key,topic)
);
create table marriage.readiness_grants (
 owner_key text not null references marriage.readiness_passports on delete cascade,
 connection_id text not null,
 request_id uuid references marriage.member_requests(id) on delete cascade,
 viewer_key text not null,
 sections text[] not null check(cardinality(sections) between 1 and 3 and sections<@array['timeline','preparation','verification']::text[]),
 granted_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 primary key(owner_key,connection_id), check(owner_key<>viewer_key),
 check((request_id is not null and connection_id=request_id::text and owner_key not like 'test:%' and viewer_key not like 'test:%') or
       (request_id is null and connection_id='tester-pair' and owner_key like 'test:%' and viewer_key like 'test:%')),
 check(expires_at>granted_at and expires_at<=granted_at+interval '30 days')
);
create index readiness_grants_viewer on marriage.readiness_grants(viewer_key,connection_id);
create index readiness_grants_request on marriage.readiness_grants(request_id) where request_id is not null;
create table marriage.readiness_issuers (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 2 and 120),
 allowed_kinds text[] not null check(cardinality(allowed_kinds) between 1 and 2 and allowed_kinds<@array['identity','preparation_course']::text[]),
 enabled boolean not null default false,
 approved_at timestamptz,
 legal_basis_reference text check(length(legal_basis_reference) between 1 and 200),
 check(not enabled or (approved_at is not null and legal_basis_reference is not null))
);
create table marriage.readiness_verification_requests (
 id uuid primary key default gen_random_uuid(),
 owner_key text not null references marriage.readiness_passports on delete cascade,
 issuer_id uuid not null references marriage.readiness_issuers,
 kind text not null check(kind in('identity','preparation_course')),
 passport_consent_at timestamptz not null,
 consented_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '24 hours'),
 fulfilled_at timestamptz,
 unique(owner_key,issuer_id,kind), check(owner_key not like 'test:%')
);
create table marriage.readiness_claims (
 id uuid primary key default gen_random_uuid(),
 owner_key text not null references marriage.readiness_passports on delete cascade,
 request_id uuid not null unique references marriage.readiness_verification_requests on delete cascade,
 issuer_id uuid not null references marriage.readiness_issuers,
 kind text not null check(kind in('identity','preparation_course')),
 evidence_ref text not null check(length(evidence_ref) between 8 and 200 and evidence_ref ~ '^[A-Za-z0-9:_-]+$'),
 verified_at timestamptz not null, expires_at timestamptz not null, revoked_at timestamptz,
 unique(issuer_id,evidence_ref), check(expires_at>verified_at and expires_at<=verified_at+interval '366 days'),
 check(owner_key not like 'test:%')
);
create index readiness_claims_owner on marriage.readiness_claims(owner_key);
create table marriage.readiness_events (
 id bigint generated always as identity primary key,
 owner_key text not null references marriage.readiness_passports on delete cascade,
 action text not null check(action in('save','share','revoke','verify_request','claim_recorded','claim_revoked')),
 created_at timestamptz not null default clock_timestamp()
);
create index readiness_events_owner on marriage.readiness_events(owner_key);
alter table marriage.readiness_passports enable row level security;
alter table marriage.readiness_preparation enable row level security;
alter table marriage.readiness_grants enable row level security;
alter table marriage.readiness_issuers enable row level security;
alter table marriage.readiness_verification_requests enable row level security;
alter table marriage.readiness_claims enable row level security;
alter table marriage.readiness_events enable row level security;
revoke all on marriage.readiness_passports,marriage.readiness_preparation,marriage.readiness_grants,
 marriage.readiness_issuers,marriage.readiness_verification_requests,marriage.readiness_claims,marriage.readiness_events
 from public,anon,authenticated,service_role;

-- Called only from authenticated/server-gated entrypoints. Unknown or closed
-- connections return no peer and never disclose whether a passport exists.
create function marriage.readiness_peer(owner_key text,connection_id text) returns text
language plpgsql stable set search_path='' as $$
declare r marriage.member_requests;who text;
begin
 if owner_key like 'test:%' then
  if connection_id<>'tester-pair' or not coalesce((select (data->>'matched')::boolean from nisfayn_test.room where id),false) then return null;end if;
  if (select count(*) from marriage.admin_test_members where not suspended and not paused and review_status='approved' and access_until>now())<>2 then return null;end if;
  return case owner_key when 'test:reham' then 'test:abdulrahman' when 'test:abdulrahman' then 'test:reham' else null end;
 end if;
 if connection_id is null or connection_id!~'^[0-9a-fA-F-]{36}$' then return null;end if;
 select * into r from marriage.member_requests where id=connection_id::uuid and status='accepted' and owner_key in(requester_id::text,recipient_id::text);
 if r.id is null then return null;end if;
 if exists(select 1 from marriage.blocks where (member_id=r.requester_id and blocked_id=r.recipient_id) or (member_id=r.recipient_id and blocked_id=r.requester_id)) then return null;end if;
 if (select count(*) from marriage.members where id in(r.requester_id,r.recipient_id) and not suspended and not paused and review_status='approved')<>2 then return null;end if;
 return case when owner_key=r.requester_id::text then r.recipient_id::text else r.requester_id::text end;
end $$;

create function marriage.readiness_claim_json(target text) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,
  'label',case c.kind when 'identity' then 'التحقق من الهوية' else 'حضور برنامج تأهيل للزواج' end,
  'issuer',i.name,'method','issuer_confirmation','verifiedAt',c.verified_at,'expiresAt',c.expires_at,
  'status',case when c.revoked_at is not null or not i.enabled then 'revoked' when c.expires_at<=now() then 'expired' else 'valid' end)
  order by c.verified_at desc),'[]'::jsonb)
 from marriage.readiness_claims c join marriage.readiness_issuers i on i.id=c.issuer_id where c.owner_key=target
$$;
create function marriage.readiness_owner(target text) returns jsonb language plpgsql stable set search_path='' as $$
declare p marriage.readiness_passports;result jsonb;
begin
 select * into p from marriage.readiness_passports where owner_key=target;
 result:=jsonb_build_object('consentedAt',p.consented_at,'updatedAt',p.updated_at,'claims',marriage.readiness_claim_json(target),
  'verificationAvailable',false,'grants',coalesce((select jsonb_agg(jsonb_build_object('connectionId',g.connection_id,'sections',g.sections,'expiresAt',g.expires_at) order by g.granted_at)
   from marriage.readiness_grants g where g.owner_key=target and g.expires_at>now() and marriage.readiness_peer(target,g.connection_id)=g.viewer_key),'[]'::jsonb));
 if p.owner_key is not null then result:=result||jsonb_build_object('timeline',p.timeline,'family',p.family,
  'preparation',(select jsonb_object_agg(topic,state) from marriage.readiness_preparation where owner_key=target));end if;
 return result;
end $$;

create function marriage.readiness_command(me text,command text,input jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare peer text;cid text:=input->>'connectionId';p marriage.readiness_passports;g marriage.readiness_grants;
 sections text[];days integer;stamp timestamptz;issuer marriage.readiness_issuers;request uuid;
begin
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>4000 then raise exception 'بيانات الجواز غير صالحة.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('readiness:'||me,0));
 if command='view' then
  peer:=marriage.readiness_peer(me,cid);
  if peer is null then return '{"available":false,"sections":[]}'::jsonb;end if;
  select * into g from marriage.readiness_grants where owner_key=peer and viewer_key=me and connection_id=cid and expires_at>now();
  select * into p from marriage.readiness_passports where owner_key=peer;
  if g.owner_key is null or p.owner_key is null then return '{"available":false,"sections":[]}'::jsonb;end if;
  return jsonb_build_object('available',true,'sections',g.sections,'sharedUntil',g.expires_at,'updatedAt',p.updated_at)
   ||case when 'timeline'=any(g.sections) then jsonb_build_object('timeline',p.timeline,'family',p.family) else '{}'::jsonb end
   ||case when 'preparation'=any(g.sections) then jsonb_build_object('preparation',(select jsonb_object_agg(topic,state) from marriage.readiness_preparation where owner_key=peer)) else '{}'::jsonb end
   ||case when 'verification'=any(g.sections) then jsonb_build_object('claims',marriage.readiness_claim_json(peer)) else '{}'::jsonb end;
 elsif command='save' then
  if input->>'consentVersion' is distinct from 'readiness-v1' then raise exception 'وافِق على حفظ الجواز الخاص أولًا.' using errcode='22023';end if;
  if not coalesce(input->>'timeline' in('within_6_months','6_to_12_months','over_12_months','exploring'),false) or
     not coalesce(input->>'family' in('discussed','ready_to_discuss','not_yet'),false) or
     jsonb_typeof(input->'preparation') is distinct from 'object' then raise exception 'أكمل أقسام الجواز.' using errcode='22023';end if;
  if (select count(*) from jsonb_each_text(input->'preparation'))<>5 or exists(select 1 from jsonb_each_text(input->'preparation') where
   key not in('communication','budget','housing','responsibilities','course') or value is null or value not in('not_started','in_progress','ready')) then raise exception 'إجابات الاستعداد غير صالحة.' using errcode='22023';end if;
  insert into marriage.readiness_passports(owner_key,member_id,test_actor,consent_version,timeline,family)
   values(me,case when me not like 'test:%' then me::uuid end,case when me like 'test:%' then substring(me from 6) end,'readiness-v1',input->>'timeline',input->>'family')
   on conflict(owner_key) do update set timeline=excluded.timeline,family=excluded.family,updated_at=clock_timestamp();
  insert into marriage.readiness_preparation(owner_key,topic,state) select me,key,value from jsonb_each_text(input->'preparation')
   on conflict(owner_key,topic) do update set state=excluded.state;
 elsif command='share' then
  perform 1 from marriage.readiness_passports where owner_key=me;
  if not found then raise exception 'أنشئ الجواز ووافق على حفظه أولًا.' using errcode='22023';end if;
  -- Serialize grants with closing/ending the match so closure cannot race a share.
  if me like 'test:%' then perform 1 from nisfayn_test.room where id for share;
  elsif cid~'^[0-9a-fA-F-]{36}$' then perform 1 from marriage.member_requests where id=cid::uuid for share;end if;
  peer:=marriage.readiness_peer(me,cid);
  if peer is null then raise exception 'المشاركة متاحة مع تعارف مقبول فقط.' using errcode='42501';end if;
  if jsonb_typeof(input->'sections') is distinct from 'array' or not coalesce(input->>'days' in('7','30'),false) then raise exception 'اختر أقسام المشاركة ومدتها.' using errcode='22023';end if;
  select array_agg(distinct value) into sections from jsonb_array_elements_text(input->'sections');
  if sections is null or cardinality(sections) not between 1 and 3 or not(sections<@array['timeline','preparation','verification']::text[]) or array_position(sections,null) is not null then raise exception 'اختر أقسام المشاركة.' using errcode='22023';end if;
  days:=(input->>'days')::integer;stamp:=clock_timestamp();
  insert into marriage.readiness_grants(owner_key,connection_id,request_id,viewer_key,sections,granted_at,expires_at)
   values(me,cid,case when me not like 'test:%' then cid::uuid end,peer,sections,stamp,stamp+make_interval(days=>days))
   on conflict(owner_key,connection_id) do update set viewer_key=excluded.viewer_key,sections=excluded.sections,granted_at=excluded.granted_at,expires_at=excluded.expires_at;
 elsif command='revoke' then
  delete from marriage.readiness_grants where owner_key=me and connection_id=cid;
 elsif command='withdraw' then
  delete from marriage.readiness_passports where owner_key=me;
 elsif command='verify_request' then
  -- This is provider-specific consent, independent of passport storage/sharing.
  select * into p from marriage.readiness_passports where owner_key=me;
  if p.member_id is null or input->>'consentVersion' is distinct from 'readiness-verification-v1' then raise exception 'يلزم إذن خاص لجهة التحقق المحددة.' using errcode='42501';end if;
  select * into issuer from marriage.readiness_issuers where id=(input->>'issuerId')::uuid and enabled and input->>'kind'=any(allowed_kinds);
  if issuer.id is null then raise exception 'جهة التحقق غير متاحة حاليًا.' using errcode='42501';end if;
  -- Re-consent starts a new request; an old callback can never satisfy it.
  delete from marriage.readiness_verification_requests where owner_key=me and issuer_id=issuer.id and kind=input->>'kind';
  insert into marriage.readiness_verification_requests(owner_key,issuer_id,kind,passport_consent_at)
   values(me,issuer.id,input->>'kind',p.consented_at) returning id into request;
 else
  if command is distinct from 'get' then raise exception 'إجراء الجواز غير متاح.' using errcode='22023';end if;
 end if;
 if command in('save','share','revoke','verify_request') and exists(select 1 from marriage.readiness_passports where owner_key=me) then
  insert into marriage.readiness_events(owner_key,action) values(me,command);
  -- Only operational timestamps/action names; no answers or claim evidence in logs.
  delete from marriage.readiness_events where owner_key=me and created_at<now()-interval '90 days';
 end if;
 return marriage.readiness_owner(me)||case when request is not null then jsonb_build_object('verificationRequestId',request) else '{}'::jsonb end;
end $$;

create function marriage.passport(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if action not in('get','withdraw','revoke') and exists(select 1 from marriage.members where id=me and suspended) then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 return marriage.readiness_command(me::text,action,payload);
end $$;
create function public.marriage_passport(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select marriage.passport($1,$2)$$;

-- A trusted integration must first authenticate the issuer response and bind it
-- to the request. These RPCs are service-only; members/staff cannot self-verify.
create function marriage.record_readiness_claim(verification_request uuid,evidence_reference text,verified_at timestamptz,expires_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare r marriage.readiness_verification_requests;p marriage.readiness_passports;i marriage.readiness_issuers;c marriage.readiness_claims;result uuid;
begin
 select * into r from marriage.readiness_verification_requests where id=verification_request;
 if r.id is null then raise exception 'Verification request unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('readiness:'||r.owner_key,0));
 select * into r from marriage.readiness_verification_requests where id=verification_request for update;
 select * into p from marriage.readiness_passports where owner_key=r.owner_key;
 select * into i from marriage.readiness_issuers where id=r.issuer_id and enabled and r.kind=any(allowed_kinds);
 if r.id is null or p.member_id is null or r.passport_consent_at is distinct from p.consented_at or i.id is null then raise exception 'Verification consent unavailable' using errcode='42501';end if;
 select * into c from marriage.readiness_claims where request_id=r.id;
 if c.id is not null then
  if c.evidence_ref is distinct from evidence_reference or c.verified_at is distinct from verified_at or c.expires_at is distinct from expires_at then raise exception 'Conflicting verification receipt' using errcode='22023';end if;
  return c.id;
 end if;
 if r.expires_at<=now() or r.fulfilled_at is not null or verified_at is null or expires_at is null or
   verified_at<r.consented_at or verified_at>clock_timestamp()+interval '5 minutes' or expires_at<=now() or expires_at>verified_at+interval '366 days' then raise exception 'Verification receipt expired or invalid' using errcode='22023';end if;
 insert into marriage.readiness_claims(owner_key,request_id,issuer_id,kind,evidence_ref,verified_at,expires_at)
  values(r.owner_key,r.id,r.issuer_id,r.kind,evidence_reference,verified_at,expires_at) returning id into result;
 update marriage.readiness_verification_requests set fulfilled_at=clock_timestamp() where id=r.id;
 update marriage.readiness_passports set updated_at=clock_timestamp() where owner_key=r.owner_key;
 insert into marriage.readiness_events(owner_key,action) values(r.owner_key,'claim_recorded');return result;
end $$;
create function public.marriage_record_readiness_claim(verification_request uuid,evidence_reference text,verified_at timestamptz,expires_at timestamptz) returns uuid
language sql security invoker set search_path='' as $$select marriage.record_readiness_claim($1,$2,$3,$4)$$;
create function marriage.revoke_readiness_claim(claim_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare target text;
begin
 update marriage.readiness_claims set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=claim_id returning owner_key into target;
 if target is null then return false;end if;
 update marriage.readiness_passports set updated_at=clock_timestamp() where owner_key=target;
 insert into marriage.readiness_events(owner_key,action) values(target,'claim_revoked');return true;
end $$;
create function public.marriage_revoke_readiness_claim(claim_id uuid) returns boolean language sql security invoker set search_path='' as $$select marriage.revoke_readiness_claim($1)$$;

create function marriage.readiness_end_connection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'accepted' then delete from marriage.readiness_grants where request_id=new.id;end if;return new;
end $$;
create trigger readiness_end_connection after update of status on marriage.member_requests for each row execute function marriage.readiness_end_connection();
create function marriage.readiness_block_connection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from marriage.readiness_grants where (owner_key=new.member_id::text and viewer_key=new.blocked_id::text) or (viewer_key=new.member_id::text and owner_key=new.blocked_id::text);return new;
end $$;
create trigger readiness_block_connection after insert on marriage.blocks for each row execute function marriage.readiness_block_connection();
create function nisfayn_test.readiness_end_connection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not coalesce((new.data->>'matched')::boolean,false) then delete from marriage.readiness_grants where connection_id='tester-pair';end if;return new;
end $$;
create trigger readiness_end_connection after update on nisfayn_test.room for each row execute function nisfayn_test.readiness_end_connection();

alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_readiness;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;
begin
 if action<>'passport' then return nisfayn_test.rpc_before_readiness(action,session_token,payload);end if;
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
 if payload->>'action' not in('get','withdraw','revoke') then
  perform 1 from marriage.admin_test_members where actor=who and not suspended and not paused and review_status='approved' and access_until>now() for share;
  if not found then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 end if;
 return marriage.readiness_command('test:'||who,payload->>'action',payload-'action');
end $$;
alter function marriage.personal_data() rename to personal_data_before_readiness;
create function marriage.personal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin return marriage.personal_data_before_readiness()||jsonb_build_object('readinessPassport',marriage.readiness_owner(me::text));end $$;

-- Reuse the existing scheduled maintenance route; do not create another cron or
-- change its established response contract. Withdrawal/account deletion erase
-- everything immediately. Otherwise operational metadata is retained 90 days.
alter function marriage.operations_cleanup() rename to operations_cleanup_before_readiness;
create function marriage.operations_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=marriage.operations_cleanup_before_readiness();
 delete from marriage.readiness_grants where expires_at<=now();
 delete from marriage.readiness_events where created_at<now()-interval '90 days';
 delete from marriage.readiness_claims where coalesce(revoked_at,expires_at)<now()-interval '90 days';
 delete from marriage.readiness_verification_requests r where expires_at<=now()
  and not exists(select 1 from marriage.readiness_claims c where c.request_id=r.id);
 return result;
end $$;

revoke all on function marriage.readiness_peer(text,text),marriage.readiness_claim_json(text),marriage.readiness_owner(text),
 marriage.readiness_command(text,text,jsonb),marriage.passport(text,jsonb),public.marriage_passport(text,jsonb),
 marriage.record_readiness_claim(uuid,text,timestamptz,timestamptz),public.marriage_record_readiness_claim(uuid,text,timestamptz,timestamptz),
 marriage.revoke_readiness_claim(uuid),public.marriage_revoke_readiness_claim(uuid),
 marriage.readiness_end_connection(),marriage.readiness_block_connection(),nisfayn_test.readiness_end_connection(),
 nisfayn_test.rpc_before_readiness(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb),
 marriage.personal_data_before_readiness(),marriage.personal_data(),marriage.operations_cleanup_before_readiness(),marriage.operations_cleanup()
 from public,anon,authenticated,service_role;
grant execute on function marriage.passport(text,jsonb),public.marriage_passport(text,jsonb),marriage.personal_data() to authenticated;
grant execute on function marriage.record_readiness_claim(uuid,text,timestamptz,timestamptz),public.marriage_record_readiness_claim(uuid,text,timestamptz,timestamptz),
 marriage.revoke_readiness_claim(uuid),public.marriage_revoke_readiness_claim(uuid),public.nisfayn_test_rpc(text,text,jsonb) to service_role;
grant execute on function marriage.operations_cleanup() to service_role;
