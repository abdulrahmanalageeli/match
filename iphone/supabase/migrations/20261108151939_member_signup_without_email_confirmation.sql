-- Ordinary member registration can use password login without a delivered email.
-- Do not change project-wide confirmation or infer ownership from email_confirmed_at
-- on these accounts. Staff trust is checked against the live server-owned marker.
create table marriage.member_signup_windows (
  scope_key text not null,
  window_start timestamptz not null,
  attempts integer not null default 1 check(attempts>0),
  primary key(scope_key,window_start)
);
alter table marriage.member_signup_windows enable row level security;
revoke all on marriage.member_signup_windows from public,anon,authenticated,service_role;

create function marriage.member_signup_email_reserved(email_address text) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from marriage.staff_invitations where email=lower(btrim(email_address)))
    or exists(select 1 from marriage.staff_accounts s join auth.users u on u.id=s.user_id where lower(u.email)=lower(btrim(email_address)));
$$;

create function marriage.member_signup_prepare(email_address text,email_hash text,network_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bucket timestamptz:=date_trunc('hour',now()); scope text; n integer; allowed boolean:=true;
begin
  if email_address is null or length(email_address) not between 3 and 254 or email_address<>lower(btrim(email_address))
    or email_hash is null or email_hash!~'^[a-f0-9]{64}$' or network_hash is null or network_hash!~'^[a-f0-9]{64}$'
    then raise exception 'Invalid signup request' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('member-signup',0));
  delete from marriage.member_signup_windows where window_start<now()-interval '2 days';
  foreach scope in array array['global','email:'||email_hash,'network:'||network_hash] loop
    insert into marriage.member_signup_windows(scope_key,window_start) values(scope,bucket)
      on conflict on constraint member_signup_windows_pkey do update set attempts=marriage.member_signup_windows.attempts+1 returning attempts into n;
    if n>(case when scope='global' then 100 when scope like 'email:%' then 3 else 10 end) then allowed:=false;end if;
  end loop;
  return jsonb_build_object('allowed',allowed,'available',not marriage.member_signup_email_reserved(email_address));
end $$;
create function public.marriage_member_signup_prepare(email_address text,email_hash text,network_hash text) returns jsonb
language sql security invoker set search_path='' as $$select marriage.member_signup_prepare($1,$2,$3)$$;

-- Defense in depth if a staff reservation is created between the check and Auth
-- creation. Self-claimed accounts also cannot change into a reserved address.
create function marriage.guard_member_signup_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.raw_app_meta_data->>'signupKind'='member_self_claimed_email'
      or new.raw_app_meta_data->>'emailOwnershipVerified'='false')
    and marriage.member_signup_email_reserved(new.email) then
    raise exception 'Account unavailable' using errcode='42501';
  end if;
  return new;
end $$;
create trigger guard_member_signup_email before insert or update of email,raw_app_meta_data on auth.users
for each row execute function marriage.guard_member_signup_email();

create or replace function marriage.staff_identity() returns uuid
language plpgsql set search_path='' as $$
declare me uuid:=auth.uid(); session_id uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  perform 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=session_id and s.user_id=me and (s.not_after is null or s.not_after>now())
      and coalesce(u.raw_app_meta_data->>'signupKind','')<>'member_self_claimed_email'
      and coalesce(u.raw_app_meta_data->>'emailOwnershipVerified','')<>'false'
      and ((nullif(u.email,'') is not null and u.email_confirmed_at is not null)
        or (nullif(u.phone,'') is not null and u.phone_confirmed_at is not null))
    for share of s;
  if not found then raise exception 'يلزم تسجيل الدخول بحساب مؤكد.' using errcode='42501';end if;
  return me;
end $$;

revoke all on function marriage.member_signup_email_reserved(text),marriage.member_signup_prepare(text,text,text),
  marriage.guard_member_signup_email(),public.marriage_member_signup_prepare(text,text,text) from public,anon,authenticated,service_role;
grant execute on function marriage.member_signup_prepare(text,text,text),public.marriage_member_signup_prepare(text,text,text) to service_role;
