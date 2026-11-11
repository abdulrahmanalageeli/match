create table marriage.testing_signup_config (id boolean primary key default true check(id),enabled boolean not null default false);
insert into marriage.testing_signup_config values(true,true);
create table marriage.testing_signup_trials (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 accepted_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 offer_version text not null check(offer_version='testing-7d-12999-v1')
);
alter table marriage.testing_signup_config enable row level security;
alter table marriage.testing_signup_trials enable row level security;
revoke all on marriage.testing_signup_config,marriage.testing_signup_trials from public,anon,authenticated;

alter function marriage.member_state(uuid) rename to member_state_before_testing_trial;
create function marriage.member_state(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_state_before_testing_trial(target)||jsonb_build_object('testingTrial',jsonb_build_object(
 'enabled',coalesce((select enabled from marriage.testing_signup_config where id),false),
 'expiresAt',(select expires_at from marriage.testing_signup_trials where member_id=target)))
$$;
revoke all on function marriage.member_state(uuid) from public,anon,authenticated;

create function public.marriage_accept_testing_trial(offer_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();m marriage.members;expiry timestamptz;
begin
 if offer_version is distinct from 'testing-7d-12999-v1' or not coalesce((select enabled from marriage.testing_signup_config where id),false) then
  raise exception 'عرض التجربة غير متاح.' using errcode='42501';end if;
 select * into m from marriage.members where id=me for update;
 if m.suspended or m.review_status='draft' or m.profile_review_pending or not exists(select 1 from marriage.profiles where member_id=me)
  or not exists(select 1 from marriage.consents where member_id=me) then
  raise exception 'أكمل التسجيل أولًا أو تواصل مع الدعم لمراجعة الحساب.' using errcode='42501';end if;
 select expires_at into expiry from marriage.testing_signup_trials where member_id=me;
 if expiry is not null then return marriage.member_state(me);end if;
 insert into marriage.testing_signup_trials(member_id,offer_version) values(me,offer_version) returning expires_at into expiry;
 -- Testing access is explicit and never creates a store transaction or charge.
 update marriage.members set review_status='approved',manual_access_until=greatest(manual_access_until,expiry),admin_revision=admin_revision+1 where id=me;
 return marriage.member_state(me);
end $$;
revoke all on function public.marriage_accept_testing_trial(text) from public,anon;
grant execute on function public.marriage_accept_testing_trial(text) to authenticated;
