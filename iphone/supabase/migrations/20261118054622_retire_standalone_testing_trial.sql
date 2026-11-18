-- Retire complimentary signup access in favor of verified subscription offers.
update marriage.testing_signup_config set enabled=false where id;
-- Remove only access whose expiry still matches the original test grant.
-- Independently extended manual access and Apple transactions remain authoritative.
update marriage.members m set manual_access_until=null
from marriage.testing_signup_trials t
where m.id=t.member_id and m.manual_access_until=t.expires_at;
create or replace function public.marriage_accept_testing_trial(offer_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'اشترك عبر صفحة العضوية للاستفادة من عروض التجربة المتاحة في Apple.' using errcode='42501';
end $$;
revoke all on function public.marriage_accept_testing_trial(text) from public,anon;
grant execute on function public.marriage_accept_testing_trial(text) to authenticated;
