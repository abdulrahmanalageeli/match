-- Free: one connection; Premium: two; verified higher-tier subscription: three.
create or replace function marriage.connection_limit(target uuid) returns integer
language sql stable set search_path='' as $$
 select case when not marriage.is_paid(target) then 1 when exists (
  select 1 from (
   select distinct on (t.original_id) t.* from marriage.store_transactions t
   join marriage.subscription_owners o on o.original_id=t.original_id
   where o.member_id=target order by t.original_id,t.signed_at desc,t.revoked desc
  ) latest where not latest.revoked and latest.expires_at>now()
   and latest.product_id in ('com.blindmatch.marriage.monthly.seriousness','com.blindmatch.marriage.monthly.seriousness.women')
 ) then 3 else 2 end
$$;
alter function marriage.member_state(uuid) rename to member_state_before_tier_capacity;
create function marriage.member_state(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_set(marriage.member_state_before_tier_capacity(target),'{membership,connectionLimit}',to_jsonb(marriage.connection_limit(target)))
$$;
revoke all on function marriage.member_state_before_tier_capacity(uuid),marriage.member_state(uuid) from public,anon,authenticated;
