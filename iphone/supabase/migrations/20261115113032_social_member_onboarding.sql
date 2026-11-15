-- Gate only new social registrations. Existing member profiles and identities remain intact.
create table marriage.social_onboarding (
 user_id uuid primary key references auth.users(id) on delete cascade,
 completed_at timestamptz
);
alter table marriage.social_onboarding enable row level security;
revoke all on marriage.social_onboarding from public,anon,authenticated,service_role;

create function marriage.queue_social_onboarding() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.raw_app_meta_data->>'provider' in ('google','apple') then
  insert into marriage.social_onboarding(user_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function marriage.queue_social_onboarding() from public,anon,authenticated,service_role;
create trigger queue_social_onboarding after insert on auth.users for each row execute function marriage.queue_social_onboarding();
insert into marriage.social_onboarding(user_id)
 select u.id from auth.users u where u.raw_app_meta_data->>'provider' in ('google','apple')
 and not exists(select 1 from marriage.profiles p where p.member_id=u.id)
 and not exists(select 1 from marriage.signup_phone_verifications v where v.user_id=u.id)
 on conflict do nothing;

-- This narrow helper checks Auth before onboarding, without granting member access.
create function marriage.onboarding_user() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid();begin
 if not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=me and ((nullif(u.email,'') is not null and u.email_confirmed_at is not null)
   or (nullif(u.phone,'') is not null and u.phone_confirmed_at is not null))
  and s.id=(auth.jwt()->>'session_id')::uuid and (s.not_after is null or s.not_after>now())) then
  raise exception 'يلزم تسجيل الدخول بحساب مؤكد.' using errcode='42501';
 end if;
 return me;
end $$;
revoke all on function marriage.onboarding_user() from public,anon,authenticated,service_role;

create function marriage.social_onboarding_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.onboarding_user();begin
 return jsonb_build_object('required',exists(select 1 from marriage.social_onboarding where user_id=me and completed_at is null),
  'email',(select email from auth.users where id=me));
end $$;
create function public.marriage_social_onboarding_status() returns jsonb language sql security invoker set search_path='' as $$select marriage.social_onboarding_status()$$;

create function marriage.complete_social_onboarding(proof_hash text,device_hash text,consent jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.onboarding_user(); challenge marriage.signup_sms_challenges; done timestamptz; address text;begin
 select completed_at into done from marriage.social_onboarding where user_id=me for update;
 if not found then raise exception 'لا يحتاج الحساب إلى هذه الخطوة.' using errcode='42501';end if;
 if done is not null then return jsonb_build_object('required',false);end if;
 if consent->>'version' is distinct from '2026-11-07-privacy' or consent->'adult' is distinct from 'true'::jsonb
  or consent->'terms' is distinct from 'true'::jsonb or consent->'privacy' is distinct from 'true'::jsonb
  or consent->'sms' is distinct from 'true'::jsonb then raise exception 'أكمل الموافقات المطلوبة.' using errcode='42501';end if;
 if proof_hash is null or proof_hash!~'^[a-f0-9]{64}$' or device_hash is null or device_hash!~'^[a-f0-9]{64}$' then raise exception 'invalid';end if;
 select lower(btrim(email)) into address from auth.users where id=me;
 select * into challenge from marriage.signup_sms_challenges c where c.proof_hash=$1 for update;
 if challenge.proof_hash is null or challenge.status<>'verified' or challenge.expires_at<=now()
  or challenge.email is distinct from address or challenge.device_hash is distinct from $2 then
  raise exception 'أكمل تأكيد رقم الجوال لهذا الحساب والجهاز.' using errcode='42501';end if;
 update marriage.signup_sms_challenges c set status='used' where c.proof_hash=$1;
 insert into marriage.signup_phone_verifications(user_id,phone,verified_at) values(me,challenge.phone,challenge.verified_at)
  on conflict(user_id) do update set phone=excluded.phone,verified_at=excluded.verified_at;
 insert into marriage.registration_devices(user_id,device_hash) values(me,$2)
  on conflict on constraint registration_devices_pkey do update set last_seen_at=now();
 update auth.users set raw_app_meta_data=raw_app_meta_data||jsonb_build_object('phoneOwnershipVerified',true,
  'signupConsent',consent||jsonb_build_object('recordedAt',now())) where id=me;
 update marriage.social_onboarding set completed_at=now() where user_id=me;
 return jsonb_build_object('required',false);
end $$;
create function public.marriage_complete_social_onboarding(proof_hash text,device_hash text,consent jsonb) returns jsonb
language sql security invoker set search_path='' as $$select marriage.complete_social_onboarding($1,$2,$3)$$;
revoke all on function marriage.social_onboarding_status(),public.marriage_social_onboarding_status(),
 marriage.complete_social_onboarding(text,text,jsonb),public.marriage_complete_social_onboarding(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.social_onboarding_status(),public.marriage_social_onboarding_status(),
 marriage.complete_social_onboarding(text,text,jsonb),public.marriage_complete_social_onboarding(text,text,jsonb) to authenticated;

create or replace function marriage.require_member() returns uuid
language plpgsql stable set search_path='' as $$
declare uid uuid:=auth.uid();begin
 if not exists(select 1 from auth.users u join marriage.members m on m.id=u.id join auth.sessions s on s.user_id=u.id
  where u.id=uid and ((nullif(u.email,'') is not null and u.email_confirmed_at is not null)
   or (nullif(u.phone,'') is not null and u.phone_confirmed_at is not null))
  and s.id=(auth.jwt()->>'session_id')::uuid and (s.not_after is null or s.not_after>now())) then
  raise exception 'يلزم تسجيل الدخول بحساب مؤكد.' using errcode='42501';end if;
 if exists(select 1 from marriage.social_onboarding where user_id=uid and completed_at is null) then
  raise exception 'أكمل تأكيد الجوال والموافقات قبل استخدام الحساب.' using errcode='42501';end if;
 return uid;
end $$;
