-- Separate higher-tier Apple product; existing receipt ownership and trial gates remain in force.
alter table marriage.store_transactions add column product_id text;
-- Gender-specific StoreKit products; preserve existing transaction ownership and legacy receipts.
create or replace function marriage.record_receipt_before_launch(actor uuid,receipt jsonb,notification boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target marriage.members; orig text:=receipt->>'originalTransactionId'; tx text:=receipt->>'transactionId';
 expiry timestamptz:=to_timestamp((receipt->>'expiresDate')::numeric/1000);
 signed_time timestamptz:=to_timestamp((receipt->>'signedDate')::numeric/1000);
 is_revoked boolean:=(receipt->>'revocationDate' is not null or coalesce((receipt->>'isUpgraded')::boolean,false));
begin
 if receipt->>'bundleId' is distinct from 'com.blindmatch.marriage' or coalesce(receipt->>'productId','') not in ('com.blindmatch.marriage.monthly','com.blindmatch.marriage.monthly.men','com.blindmatch.marriage.monthly.women','com.blindmatch.marriage.monthly.seriousness','com.blindmatch.marriage.monthly.seriousness.women')
 or coalesce(receipt->>'environment','') not in ('Sandbox','Production') or nullif(orig,'') is null or nullif(tx,'') is null
 or expiry is null or signed_time is null then raise exception 'اشتراك Apple غير صالح.' using errcode='22023'; end if;
 select * into target from marriage.members where app_account_token=(receipt->>'appAccountToken')::uuid for update;
 if target.id is null and notification then return null; end if;
 if target.id is null or (not notification and (actor is distinct from target.id or target.review_status<>'approved' or target.suspended)) then
  raise exception 'تعذّر ربط الاشتراك بهذا الحساب.' using errcode='42501';
 end if;
 -- The verified receipt is bound to the stored profile, never a client gender flag.
 -- Keep legacy renewals/restores valid. Notifications must still record revocations
 -- after a profile change; they cannot create a cross-gender purchase entitlement.
 if receipt->>'productId' not in ('com.blindmatch.marriage.monthly','com.blindmatch.marriage.monthly.seriousness')
 and not is_revoked and expiry>now()
 and not exists(select 1 from marriage.profiles where member_id=target.id and
   (receipt->>'productId'=case gender when 'man' then 'com.blindmatch.marriage.monthly.men' when 'woman' then 'com.blindmatch.marriage.monthly.women' end
    or (gender='woman' and receipt->>'productId'='com.blindmatch.marriage.monthly.seriousness.women')))
 then raise exception 'الاشتراك لا يناسب نوع العضوية في ملفك.' using errcode='42501'; end if;
 insert into marriage.subscription_owners(original_id,member_id) values(orig,target.id) on conflict do nothing;
 if not exists(select 1 from marriage.subscription_owners where original_id=orig and member_id=target.id)
 or exists(select 1 from marriage.store_transactions where transaction_id=tx and
  (original_id<>orig or (product_id is not null and product_id<>receipt->>'productId'))) then
  raise exception 'الاشتراك مرتبط بحساب آخر.' using errcode='42501';
 end if;
 insert into marriage.store_transactions(transaction_id,original_id,expires_at,signed_at,revoked,environment,product_id)
 values(tx,orig,expiry,signed_time,is_revoked,receipt->>'environment',receipt->>'productId')
 on conflict(transaction_id) do update set expires_at=excluded.expires_at,signed_at=excluded.signed_at,revoked=excluded.revoked,product_id=excluded.product_id
 where marriage.store_transactions.original_id=excluded.original_id and
 (excluded.signed_at>marriage.store_transactions.signed_at or (excluded.signed_at=marriage.store_transactions.signed_at and excluded.revoked));
 return marriage.member_state(target.id);
end $$;
