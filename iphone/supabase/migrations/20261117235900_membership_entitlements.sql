-- Higher-tier access comes only from verified, current StoreKit transactions.
create function marriage.is_serious(target uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.subscription_owners o
 join marriage.store_transactions t using(original_id)
 where o.member_id=target and not t.revoked and t.expires_at>now()
 and t.product_id in ('com.blindmatch.marriage.monthly.seriousness','com.blindmatch.marriage.monthly.seriousness.women'))
$$;
create function marriage.membership_tier(target uuid) returns text
language sql stable set search_path='' as $$
 select case when marriage.is_serious(target) then 'seriousness'
 when marriage.is_paid(target) then 'premium' else 'free' end
$$;
create or replace function marriage.connection_limit(target uuid) returns integer
language sql stable set search_path='' as $$
 select case marriage.membership_tier(target) when 'seriousness' then 3 when 'premium' then 2 else 1 end
$$;
create or replace function marriage.member_state(target uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_tier_capacity(target);begin
 return jsonb_set(result,'{membership}',(result->'membership') || jsonb_build_object(
 'connectionLimit',marriage.connection_limit(target),'tier',marriage.membership_tier(target)));
end
$$;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_seriousness;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb
language sql stable set search_path='' as $$
 select marriage.member_card_before_seriousness(viewer,subject) || jsonb_build_object('membershipTier',marriage.membership_tier(subject))
$$;
revoke all on function marriage.is_serious(uuid),marriage.membership_tier(uuid),marriage.member_card(uuid,uuid),marriage.member_card_before_seriousness(uuid,uuid) from public,anon,authenticated;
