-- Deliberately disabled until Apple's one-week offer and server signing are ready.
create table marriage.launch_offer_campaigns (
 gender text primary key check(gender in('man','woman')),
 enabled boolean not null default false,
 capacity integer not null default 50 check(capacity between 0 and 50)
);
insert into marriage.launch_offer_campaigns(gender) values('man'),('woman');
create table marriage.launch_offer_claims (
 member_id uuid unique references marriage.members(id) on delete set null,
 app_transaction_id text primary key,
 gender text not null references marriage.launch_offer_campaigns(gender),
 original_id text unique,
 claimed_at timestamptz not null default now()
);
alter table marriage.launch_offer_campaigns enable row level security;
alter table marriage.launch_offer_claims enable row level security;
revoke all on marriage.launch_offer_campaigns,marriage.launch_offer_claims from public,anon,authenticated;

-- Called only after authenticating the member and verifying Apple's app transaction.
-- A reservation is permanent and idempotent, including cancellations. Never recycle
-- it: an Apple purchase can finish later on another device or after Ask to Buy.
create function public.marriage_prepare_launch_offer(actor uuid,apple_transaction text,claim boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g text; campaign marriage.launch_offer_campaigns; existing marriage.launch_offer_claims;
 eligible boolean:=false; account_token uuid;begin
 select p.gender,m.app_account_token into g,account_token from marriage.members m join marriage.profiles p on p.member_id=m.id
 where m.id=actor and m.review_status='approved' and not m.suspended and not m.paused;
 if g is null or apple_transaction is null or apple_transaction!~'^[0-9]{1,80}$' then raise exception 'العضوية غير مؤهلة.' using errcode='42501';end if;
 select * into campaign from marriage.launch_offer_campaigns where gender=g for update;
 select * into existing from marriage.launch_offer_claims where app_transaction_id=apple_transaction or member_id=actor;
 if found and (existing.member_id is distinct from actor or existing.app_transaction_id<>apple_transaction or existing.gender<>g) then
  raise exception 'العرض مرتبط بحساب آخر.' using errcode='42501';end if;
 if campaign.enabled and not marriage.is_paid(actor) and not exists(select 1 from marriage.subscription_owners where member_id=actor) then
  eligible:=existing.app_transaction_id is not null or (select count(*) from marriage.launch_offer_claims where gender=g)<campaign.capacity;
  if eligible and claim and existing.app_transaction_id is null then
   insert into marriage.launch_offer_claims(member_id,app_transaction_id,gender) values(actor,apple_transaction,g);
  end if;
 end if;
 return jsonb_build_object('eligible',eligible,'productId','com.blindmatch.marriage.monthly.'||case when g='man' then 'men' else 'women' end,
  'accountToken',account_token,'reserved',claim and eligible);
end $$;
revoke all on function public.marriage_prepare_launch_offer(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.marriage_prepare_launch_offer(uuid,text,boolean) to service_role;

-- Do not trust client flags to grant the free week. Only a verified Apple trial
-- transaction belonging to one reserved member can activate launch Premium.
alter function marriage.record_receipt(uuid,jsonb,boolean) rename to record_receipt_before_launch;
create function marriage.record_receipt(actor uuid,receipt jsonb,notification boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; reservation marriage.launch_offer_claims; result jsonb;begin
 if receipt->>'offerType'='1'
  and receipt->>'productId' in('com.blindmatch.marriage.monthly.men','com.blindmatch.marriage.monthly.women')
  and receipt->>'revocationDate' is null and not coalesce((receipt->>'isUpgraded')::boolean,false)
  and to_timestamp((receipt->>'expiresDate')::numeric/1000)>now() then
  select id into target from marriage.members where app_account_token=(receipt->>'appAccountToken')::uuid;
  select * into reservation from marriage.launch_offer_claims where member_id=target for update;
  if reservation.app_transaction_id is null
   or (receipt->>'appTransactionId' is not null and receipt->>'appTransactionId'<>reservation.app_transaction_id)
   or (reservation.original_id is not null and reservation.original_id<>receipt->>'originalTransactionId') then
   raise exception 'التجربة المجانية غير مرتبطة بحجز إطلاق صالح. تواصل مع الدعم.' using errcode='42501';end if;
  result:=marriage.record_receipt_before_launch(actor,receipt,notification);
  update marriage.launch_offer_claims set original_id=receipt->>'originalTransactionId' where member_id=target;
  return result;
 end if;
 return marriage.record_receipt_before_launch(actor,receipt,notification);
end $$;
revoke all on function marriage.record_receipt_before_launch(uuid,jsonb,boolean),marriage.record_receipt(uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function marriage.record_receipt_before_launch(uuid,jsonb,boolean) from service_role;
grant execute on function marriage.record_receipt(uuid,jsonb,boolean) to service_role;
