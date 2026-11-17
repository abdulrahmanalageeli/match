-- Temporary testing for one verified owner account; never changes Apple receipts.
create table marriage.membership_test_overrides (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 tier text not null check(tier in('free','premium','seriousness')),
 expires_at timestamptz not null
);
alter table marriage.membership_test_overrides enable row level security;
revoke all on marriage.membership_test_overrides from public,anon,authenticated;
create function marriage.can_test_membership(target uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from auth.users where id=target
 and lower(email)='timgoldenz1999@yahoo.com' and email_confirmed_at is not null)
$$;
create function marriage.test_membership_tier(target uuid) returns text
language sql stable set search_path='' as $$
 select tier from marriage.membership_test_overrides
 where member_id=target and expires_at>now() and marriage.can_test_membership(target)
$$;
alter function marriage.is_paid(uuid) rename to is_paid_before_owner_testing;
create function marriage.is_paid(target uuid) returns boolean
language sql stable set search_path='' as $$
 select case when marriage.test_membership_tier(target) is not null
 then marriage.test_membership_tier(target)<>'free' else marriage.is_paid_before_owner_testing(target) end
$$;
alter function marriage.is_serious(uuid) rename to is_serious_before_owner_testing;
create function marriage.is_serious(target uuid) returns boolean
language sql stable set search_path='' as $$
 select case when marriage.test_membership_tier(target) is not null
 then marriage.test_membership_tier(target)='seriousness' else marriage.is_serious_before_owner_testing(target) end
$$;
alter function marriage.member_state(uuid) rename to member_state_before_owner_testing;
create function marriage.member_state(target uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_owner_testing(target);begin
 if marriage.can_test_membership(target) then
 result:=result||jsonb_build_object('membershipTesting',jsonb_build_object(
 'selected',coalesce(marriage.test_membership_tier(target),'actual')));
 end if;
 return result;
end $$;
create function public.marriage_test_membership(selected_tier text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 if not marriage.can_test_membership(me) or not exists(select 1 from marriage.members
 where id=me and review_status='approved' and not suspended) then
 raise exception 'هذا التحكم متاح لحساب الاختبار فقط.' using errcode='42501';end if;
 if selected_tier is null or selected_tier not in('actual','free','premium','seriousness') then
 raise exception 'خيار العضوية غير صالح.' using errcode='22023';end if;
 if selected_tier='actual' then delete from marriage.membership_test_overrides where member_id=me;
 else insert into marriage.membership_test_overrides values(me,selected_tier,now()+interval '24 hours')
 on conflict(member_id) do update set tier=excluded.tier,expires_at=excluded.expires_at;end if;
 return marriage.member_state(me);
end $$;
revoke all on function marriage.can_test_membership(uuid),marriage.test_membership_tier(uuid),
 marriage.is_paid(uuid),marriage.is_paid_before_owner_testing(uuid),marriage.is_serious(uuid),
 marriage.is_serious_before_owner_testing(uuid),marriage.member_state(uuid),marriage.member_state_before_owner_testing(uuid)
 from public,anon,authenticated;
revoke all on function public.marriage_test_membership(text) from public,anon;
grant execute on function public.marriage_test_membership(text) to authenticated;
