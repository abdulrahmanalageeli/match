-- Existing access keeps its original end date. Enabling a new pilot is explicit.
update marriage.testing_signup_config set enabled=false;
alter table marriage.testing_signup_config add column identity_salt uuid not null default gen_random_uuid();
create table marriage.trial_claims (phone_key bytea primary key);
alter table marriage.trial_claims enable row level security;
revoke all on marriage.trial_claims from public,anon,authenticated,service_role;

create function marriage.trial_phone_key(target uuid) returns bytea
language sql stable set search_path='' as $$
 select sha256(convert_to(c.identity_salt::text || ':' || nullif(regexp_replace(coalesce(v.phone,
   case when u.phone_confirmed_at is not null then u.phone end),'[^0-9]','','g'),''),'UTF8'))
 from auth.users u cross join marriage.testing_signup_config c
 left join marriage.signup_phone_verifications v on v.user_id=u.id where u.id=target
$$;
insert into marriage.trial_claims
 select distinct k from marriage.testing_signup_trials t cross join lateral marriage.trial_phone_key(t.member_id) k
 where k is not null on conflict do nothing;

alter table marriage.subscription_owners
 add column renewal_status integer check(renewal_status between 1 and 5),
 add column status_transaction text,
 add column status_at timestamptz,
 add column grace_until timestamptz,
 add column auto_renew boolean,
 add column billing_retry boolean,
 add column check_after timestamptz not null default now();
create index subscription_recheck on marriage.subscription_owners(check_after);
alter table marriage.store_transactions add column purchased_at timestamptz;

create function marriage.apple_product_access_until(target uuid,serious_only boolean) returns timestamptz
language sql stable set search_path='' as $$
 select max(case when o.status_transaction=t.transaction_id and o.renewal_status in (2,3,5)
   then null
   when o.status_transaction=t.transaction_id and o.renewal_status=4 then greatest(t.expires_at,o.grace_until)
   else t.expires_at end)
 from marriage.subscription_owners o join marriage.store_transactions t using(original_id)
 left join marriage.store_transactions snapshot on snapshot.transaction_id=o.status_transaction
 where o.member_id=target and (not serious_only or t.product_id in ('com.blindmatch.marriage.monthly.seriousness','com.blindmatch.marriage.monthly.seriousness.women')) and not t.revoked and (o.status_transaction is null or
   o.status_transaction=t.transaction_id or t.purchased_at>snapshot.purchased_at or coalesce(t.purchased_at,t.signed_at)>o.status_at)
$$;
create function marriage.apple_access_until(target uuid) returns timestamptz
language sql stable set search_path='' as $$select marriage.apple_product_access_until(target,false)$$;
-- Keep the manual, staff-grant and authorized test-tier layers around StoreKit.
create or replace function marriage.is_paid_before_admin_access(target uuid) returns boolean
language sql stable set search_path='' as $$select coalesce(marriage.apple_access_until(target)>now(),false)$$;
create or replace function marriage.is_serious_before_admin_grants(target uuid) returns boolean
language sql stable set search_path='' as $$select coalesce(marriage.apple_product_access_until(target,true)>now(),false)$$;
revoke all on function marriage.apple_product_access_until(uuid,boolean) from public,anon,authenticated;

-- Legacy curated introductions embed private details in the account response.
do $$ declare def text:=pg_get_functiondef('marriage.member_state_base(uuid)'::regprocedure);
 needle text:='paid:=coalesce(expiry>now(),false);';
begin
 if strpos(def,needle)=0 then raise exception 'Unexpected introduction entitlement check'; end if;
 execute replace(def,needle,'paid:=marriage.is_paid(target);');
end $$;

alter function marriage.compatible(uuid,uuid) rename to compatible_before_live_directory;
create function marriage.compatible(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from marriage.members where id in (a,b) and is_dummy)
   and marriage.compatible_before_live_directory(a,b)
$$;
revoke all on function marriage.compatible(uuid,uuid) from public,anon,authenticated;

create function marriage.checkout_available(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.relationship_member_allowed(target) and (
   exists(select 1 from marriage.members peer where peer.id<>target and not peer.is_dummy
     and marriage.relationship_open(target,peer.id))
   or exists(select 1 from marriage.members peer where peer.id<>target and not peer.is_dummy and not peer.paused and marriage.relationship_member_allowed(peer.id) and marriage.is_paid(peer.id)
     and marriage.compatible(target,peer.id) and marriage.new_pair_requirements(target,peer.id)
     and marriage.active_connections(target)<greatest(2,marriage.connection_limit(target)) and marriage.active_connections(peer.id)<marriage.connection_limit(peer.id)
     and not exists(select 1 from marriage.discovery_choices d where d.hidden and
       ((d.member_id=target and d.subject_id=peer.id) or (d.member_id=peer.id and d.subject_id=target)))
     and ((not exists(select 1 from marriage.introductions i where i.member_a=least(target,peer.id) and i.member_b=greatest(target,peer.id))
       and not exists(select 1 from marriage.member_requests r where r.status in ('pending','accepted') and target in(r.requester_id,r.recipient_id)
         and peer.id in(r.requester_id,r.recipient_id))
       and (select count(*) from marriage.member_requests r where r.requester_id=target and r.status in ('pending','accepted'))<5)
       or exists(select 1 from marriage.member_requests r
       where r.status='pending' and r.created_at>now()-interval '7 days' and target in(r.requester_id,r.recipient_id) and peer.id in(r.requester_id,r.recipient_id))
       or exists(select 1 from marriage.introductions i where i.member_a=least(target,peer.id)
         and i.member_b=greatest(target,peer.id) and i.closed_at is null))))
$$;

alter function marriage.member_state(uuid) rename to member_state_before_billing_lifecycle;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_billing_lifecycle(target);
 m marriage.members; trial_end timestamptz; apple_end timestamptz:=marriage.apple_access_until(target);
 kind text; verified_key bytea; eligible boolean;
begin
 select * into m from marriage.members where id=target;
 select expires_at into trial_end from marriage.testing_signup_trials where member_id=target;
 kind:=case when marriage.test_membership_tier(target)='free' then 'free'
   when apple_end>now() then 'paid'
   when m.manual_access_until>now() then case when m.manual_access_until=trial_end then 'trial' else 'granted' end
   when marriage.is_paid(target) then 'granted'
   when trial_end is not null or m.manual_access_until is not null or exists(select 1 from marriage.subscription_owners where member_id=target)
   then 'expired' else 'free' end;
 verified_key:=marriage.trial_phone_key(target);
 eligible:=kind='free' and m.review_status='approved' and not m.suspended and not m.is_dummy and not m.profile_review_pending
   and verified_key is not null and (select enabled from marriage.testing_signup_config where id)
   and exists(select 1 from marriage.profiles where member_id=target)
   and exists(select 1 from marriage.consents where member_id=target)
   and not exists(select 1 from marriage.trial_claims c where c.phone_key=verified_key);
 return result || jsonb_build_object('membership',(result->'membership') || jsonb_build_object(
   'status',kind,'active',coalesce(marriage.is_paid(target),false),'expiresAt',greatest(apple_end,m.manual_access_until,(select expires_at from marriage.admin_membership_grants where member_id=target and expires_at>now())),
   'canStart',case when kind in ('free','expired','trial') then marriage.checkout_available(target) else false end),
   'testingTrial',(result->'testingTrial') || jsonb_build_object('eligible',coalesce(eligible,false)));
end $$;

create or replace function public.marriage_accept_testing_trial(offer_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); state jsonb; expiry timestamptz;
begin
 perform 1 from marriage.members where id=me for update;
 if offer_version is distinct from 'testing-7d-12999-v1' then raise exception 'عرض غير صالح.' using errcode='22023'; end if;
 state:=marriage.member_state(me);
 if exists(select 1 from marriage.testing_signup_trials where member_id=me) then return state; end if;
 if not (select enabled from marriage.testing_signup_config where id) then
   raise exception 'اشترك عبر صفحة العضوية للاستفادة من عروض التجربة المتاحة في Apple.' using errcode='42501';
 end if;
 if not (state#>>'{testingTrial,eligible}')::boolean then raise exception 'التجربة غير متاحة لهذا الحساب.' using errcode='42501'; end if;
 insert into marriage.trial_claims values(marriage.trial_phone_key(me)) on conflict do nothing;
 if not found then raise exception 'سبق استخدام التجربة.' using errcode='42501'; end if;
 insert into marriage.testing_signup_trials(member_id,offer_version) values(me,offer_version) returning expires_at into expiry;
 update marriage.members set manual_access_until=expiry where id=me;
 return marriage.member_state(me);
end $$;
revoke all on function marriage.trial_phone_key(uuid),marriage.apple_access_until(uuid),marriage.checkout_available(uuid),
 marriage.member_state(uuid) from public,anon,authenticated;

-- One transaction covers owner binding, transaction replay and the signed lifecycle snapshot.
-- A member with previously approved profile edits in review still owns their Apple purchase.
do $$ declare def text:=pg_get_functiondef('marriage.record_receipt_before_launch(uuid,jsonb,boolean)'::regprocedure);
 needle text:='target.review_status<>''approved'' or target.suspended';
begin
 if strpos(def,needle)=0 then raise exception 'Unexpected receipt account check'; end if;
 execute replace(def,needle,'not marriage.relationship_member_allowed(target.id)');
end $$;
create function public.marriage_apply_apple_event(actor uuid,receipt jsonb,notification boolean,lifecycle jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state jsonb; orig text:=receipt->>'originalTransactionId'; tx text:=receipt->>'transactionId';
 observed timestamptz:=to_timestamp((lifecycle->>'observedAt')::numeric/1000); owner_id uuid;
begin
 if notification and receipt->>'appAccountToken' is null then
   select m.app_account_token into owner_id from marriage.subscription_owners o join marriage.members m on m.id=o.member_id
   where o.original_id=orig and exists(select 1 from marriage.store_transactions t where t.original_id=orig and t.environment=receipt->>'environment');
   if owner_id is null then return null; end if;
   receipt:=receipt||jsonb_build_object('appAccountToken',owner_id);
 end if;
 state:=marriage.record_receipt(actor,receipt,notification);
 if state is null then return null; end if;
 update marriage.store_transactions set purchased_at=to_timestamp((receipt->>'purchaseDate')::numeric/1000)
 where transaction_id=tx and purchased_at is null and receipt->>'purchaseDate' is not null;
 if lifecycle is not null then
   if not notification or observed is null or (lifecycle->>'status') is null or
      lifecycle->>'originalTransactionId' is distinct from orig then raise exception 'Invalid renewal snapshot'; end if;
   update marriage.subscription_owners set status_transaction=tx,status_at=observed,renewal_status=(lifecycle->>'status')::int,
     grace_until=to_timestamp((lifecycle->>'gracePeriodExpiresDate')::numeric/1000),
     auto_renew=(lifecycle->>'autoRenewStatus')::int=1,billing_retry=(lifecycle->>'isInBillingRetryPeriod')::boolean
     where original_id=orig and (status_at is null or observed>status_at)
       and not exists(select 1 from marriage.store_transactions prior
         where prior.transaction_id=status_transaction and prior.purchased_at>to_timestamp((receipt->>'purchaseDate')::numeric/1000));
 end if;
 select member_id into owner_id from marriage.subscription_owners where original_id=orig;
 return marriage.member_state(owner_id);
end $$;

create function public.marriage_claim_apple_checks(store_environment text) returns setof text
language sql security definer set search_path='' as $$
 with due as (select o.original_id from marriage.subscription_owners o where o.check_after<=now()
   and exists(select 1 from marriage.store_transactions t where t.original_id=o.original_id and t.environment=store_environment)
   order by o.check_after,o.original_id limit 8 for update skip locked)
 update marriage.subscription_owners o set check_after=now()+interval '15 minutes' from due
 where o.original_id=due.original_id returning o.original_id
$$;
create function public.marriage_finish_apple_check(original text) returns void language sql security definer set search_path='' as $$
 update marriage.subscription_owners set check_after=now()+interval '6 hours' where original_id=original
$$;
revoke all on function public.marriage_apply_apple_event(uuid,jsonb,boolean,jsonb),public.marriage_claim_apple_checks(text),
 public.marriage_finish_apple_check(text) from public,anon,authenticated;
grant execute on function public.marriage_apply_apple_event(uuid,jsonb,boolean,jsonb),public.marriage_claim_apple_checks(text),
 public.marriage_finish_apple_check(text) to service_role;

create extension if not exists pg_cron;
select cron.schedule('wudayn-apple-reconcile','*/5 * * * *',$job$
 select net.http_post(url:=u.decrypted_secret,body:='{}'::jsonb,
   headers:=jsonb_build_object('Content-Type','application/json','x-reconcile-secret',s.decrypted_secret),
   timeout_milliseconds:=55000)
 from vault.decrypted_secrets u cross join vault.decrypted_secrets s
 where u.name='wudayn_apple_reconcile_url' and s.name='wudayn_apple_reconcile_secret'
$job$);
