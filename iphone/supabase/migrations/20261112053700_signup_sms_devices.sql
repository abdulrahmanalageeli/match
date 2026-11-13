create table marriage.registration_devices(
 user_id uuid not null references auth.users(id) on delete cascade, device_hash text not null check(device_hash~'^[a-f0-9]{64}$'),
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),primary key(user_id,device_hash)
);
create index registration_devices_hash on marriage.registration_devices(device_hash);
create table marriage.signup_phone_verifications(
 user_id uuid primary key references auth.users(id) on delete cascade,phone text not null,verified_at timestamptz not null,provider text not null default 'authentica',consent_version text not null default 'signup-sms-device-v1'
);
create table marriage.signup_sms_challenges(
 proof_hash text primary key check(proof_hash~'^[a-f0-9]{64}$'),email text not null,phone text not null,device_hash text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes',
 status text not null default 'sending' check(status in('sending','sent','verified','used','revoked')),
 tries int not null default 0,lease uuid,lease_until timestamptz,verified_at timestamptz
);
create index signup_sms_phone_time on marriage.signup_sms_challenges(phone,created_at);
create table marriage.signup_sms_settings(id boolean primary key default true check(id),required boolean not null default false);
insert into marriage.signup_sms_settings values(true,false);
alter table marriage.registration_devices enable row level security;
alter table marriage.signup_phone_verifications enable row level security;
alter table marriage.signup_sms_challenges enable row level security;
alter table marriage.signup_sms_settings enable row level security;
revoke all on marriage.registration_devices,marriage.signup_phone_verifications,marriage.signup_sms_challenges,marriage.signup_sms_settings from public,anon,authenticated,service_role;

create function public.marriage_signup_sms(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p marriage.signup_sms_challenges;proof text:=payload->>'proofHash';device text:=payload->>'deviceHash';network text:=payload->>'networkHash';
 scope text;n int;lease_id uuid;begin
 if proof is null or proof!~'^[a-f0-9]{64}$' then raise exception 'invalid';end if;
 if action='start' then
  if device is null or device!~'^[a-f0-9]{64}$' or network is null or network!~'^[a-f0-9]{64}$'
   or payload->>'consentVersion' is distinct from 'signup-sms-device-v1'
   or coalesce(payload->>'phone','')!~'^\+9665[0-9]{8}$' or length(coalesce(payload->>'email','')) not between 3 and 254 then raise exception 'invalid';end if;
  perform pg_advisory_xact_lock(hashtextextended('signup-sms',0));
  delete from marriage.signup_sms_challenges where expires_at<now()-interval '1 day';
  if exists(select 1 from marriage.signup_sms_challenges where phone=payload->>'phone' and created_at>now()-interval '60 seconds')
   or (select count(*) from marriage.signup_sms_challenges where phone=payload->>'phone' and created_at>now()-interval '24 hours')>=5 then raise exception 'rate_limited';end if;
  foreach scope in array array['sms:global','sms:network:'||network,'sms:device:'||device] loop
   insert into marriage.member_signup_windows(scope_key,window_start) values(scope,date_trunc('hour',now()))
    on conflict on constraint member_signup_windows_pkey do update set attempts=marriage.member_signup_windows.attempts+1 returning attempts into n;
   if n>(case when scope='sms:global' then 100 when scope like 'sms:network:%' then 20 else 5 end) then raise exception 'rate_limited';end if;
  end loop;
  update marriage.signup_sms_challenges set status='revoked',lease=null where phone=payload->>'phone' and status in('sending','sent','verified');
  insert into marriage.signup_sms_challenges(proof_hash,email,phone,device_hash) values(proof,lower(btrim(payload->>'email')),payload->>'phone',device);
  return jsonb_build_object('duplicateDevice',exists(select 1 from marriage.registration_devices where device_hash=device));
 end if;
 select * into p from marriage.signup_sms_challenges where proof_hash=proof for update;
 if p.proof_hash is null or p.expires_at<=now() then raise exception 'expired';end if;
 if action='sent' then
  update marriage.signup_sms_challenges set status='sent' where proof_hash=proof and status='sending';
  if not found then raise exception 'expired';end if;return '{}'::jsonb;
 elsif action='claim' then
  if p.status<>'sent' or p.tries>=5 or p.lease_until>now() or p.device_hash is distinct from device then raise exception 'expired';end if;
  lease_id:=gen_random_uuid();
  update marriage.signup_sms_challenges set tries=tries+1,lease=lease_id,lease_until=now()+interval '20 seconds' where proof_hash=proof;
  return jsonb_build_object('phone',p.phone,'lease',lease_id);
 elsif action='finish' then
  if p.status<>'sent' or p.lease::text is distinct from payload->>'lease' or p.lease_until<=now() then raise exception 'expired';end if;
  update marriage.signup_sms_challenges set status=case when payload->'verified'='true'::jsonb then 'verified' else 'sent' end,
   verified_at=case when payload->'verified'='true'::jsonb then now() end,lease=null,lease_until=null where proof_hash=proof;
  return '{}'::jsonb;
 end if;
 raise exception 'invalid';
end $$;
revoke all on function public.marriage_signup_sms(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.marriage_signup_sms(text,jsonb) to service_role;

create function marriage.bind_signup_phone_device() returns trigger language plpgsql security definer set search_path='' as $$
declare p marriage.signup_sms_challenges;begin
 if new.raw_app_meta_data->>'signupKind' is distinct from 'member_self_claimed_email' then return new;end if;
 if not (select required from marriage.signup_sms_settings where id) and not(new.raw_app_meta_data?'signupPhoneProof') then return new;end if;
 select * into p from marriage.signup_sms_challenges where proof_hash=new.raw_app_meta_data->>'signupPhoneProof' for update;
 if p.proof_hash is null or p.status<>'verified' or p.expires_at<=now() or p.email<>lower(btrim(new.email))
  or p.device_hash is distinct from new.raw_app_meta_data->>'signupDeviceHash' then raise exception 'يلزم تأكيد رقم الجوال قبل إنشاء الحساب.' using errcode='42501';end if;
 update marriage.signup_sms_challenges set status='used' where proof_hash=p.proof_hash;
 insert into marriage.registration_devices(user_id,device_hash) values(new.id,p.device_hash);
 insert into marriage.signup_phone_verifications(user_id,phone,verified_at) values(new.id,p.phone,p.verified_at);
 -- AFTER INSERT: remove short-lived proof from session-visible app metadata.
 update auth.users set raw_app_meta_data=(new.raw_app_meta_data-array['signupPhoneProof','signupDeviceHash'])||jsonb_build_object('phoneOwnershipVerified',true) where id=new.id;
 return new;
end $$;
revoke all on function marriage.bind_signup_phone_device() from public,anon,authenticated,service_role;
create trigger bind_signup_phone_device after insert on auth.users for each row execute function marriage.bind_signup_phone_device();

create function marriage.register_device(device_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();dupe boolean;begin
 if $1 is null or $1!~'^[a-f0-9]{64}$' then raise exception 'invalid';end if;
 select exists(select 1 from marriage.registration_devices d where d.device_hash=$1 and d.user_id<>me) into dupe;
 insert into marriage.registration_devices(user_id,device_hash) values(me,$1) on conflict on constraint registration_devices_pkey do update set last_seen_at=now();
 return dupe;
end $$;
create function public.marriage_register_device(device_hash text) returns boolean language sql security invoker set search_path='' as $$select marriage.register_device($1)$$;
revoke all on function marriage.register_device(text),public.marriage_register_device(text) from public,anon,authenticated,service_role;
grant execute on function marriage.register_device(text),public.marriage_register_device(text) to authenticated;
