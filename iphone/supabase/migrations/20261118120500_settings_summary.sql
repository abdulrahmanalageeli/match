-- Billing display fields are populated only by the existing verified Apple event writer.
alter table marriage.store_transactions add column free_trial boolean;
alter table marriage.subscription_owners
  add column renewal_milliunits bigint check (renewal_milliunits >= 0),
  add column renewal_currency text,
  add column renewal_date timestamptz;

create or replace function public.marriage_apply_apple_event(actor uuid,receipt jsonb,notification boolean,lifecycle jsonb)
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
 if receipt->>'offerDiscountType' is not null then
   update marriage.store_transactions set free_trial=(receipt->>'offerDiscountType'='FREE_TRIAL')
     where transaction_id=tx and original_id=orig;
 end if;
 if lifecycle is not null then
   if not notification or observed is null or (lifecycle->>'status') is null or
      lifecycle->>'originalTransactionId' is distinct from orig then raise exception 'Invalid renewal snapshot'; end if;
   update marriage.subscription_owners set status_transaction=tx,status_at=observed,renewal_status=(lifecycle->>'status')::int,
     renewal_milliunits=(lifecycle->>'renewalPrice')::bigint, renewal_currency=lifecycle->>'currency',
     renewal_date=to_timestamp((lifecycle->>'renewalDate')::numeric/1000),
     grace_until=to_timestamp((lifecycle->>'gracePeriodExpiresDate')::numeric/1000),
     auto_renew=(lifecycle->>'autoRenewStatus')::int=1,billing_retry=(lifecycle->>'isInBillingRetryPeriod')::boolean
     where original_id=orig and (status_at is null or observed>status_at)
       and not exists(select 1 from marriage.store_transactions prior
         where prior.transaction_id=status_transaction and prior.purchased_at>to_timestamp((receipt->>'purchaseDate')::numeric/1000));
 end if;
 select member_id into owner_id from marriage.subscription_owners where original_id=orig;
 return marriage.member_state(owner_id);
end $$;

-- A snapshot has no viewer and therefore no pair-fit row. Keep the public card in that case.
create or replace function marriage.member_card_before_basics(viewer uuid,subject uuid)
returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_base(viewer,subject) || marriage.profile_details_json(subject) ||
   jsonb_build_object('fit',f.fit,
     'familyPreference',case when exists(select 1 from marriage.profile_details where member_id=subject)
       then (select family_preference from marriage.preferences where member_id=subject) end)
 from (select pair.fit from marriage.pair_fit(viewer,subject) pair where viewer is not null
       union all select null where viewer is null) f
$$;

-- Previously saved JSON null snapshots contain no approved details to recover.
create function marriage.approved_review_card(m marriage.members) returns jsonb
language plpgsql stable set search_path='' as $$
declare card jsonb:=m.approved_profile_snapshot->'card';
begin
 if jsonb_typeof(card) is distinct from 'object' then return null; end if;
 card:=marriage.public_sensitive_fields(card,marriage.sensitive_publication_allowed(m.id));
 if marriage.beena_shared_story(marriage.beena_json(m.id)) is null then card:=card-'beenaStory'; end if;
 return card||jsonb_build_object('portrait',null,'reasons','[]'::jsonb);
end $$;
revoke all on function marriage.approved_review_card(marriage.members) from public,anon,authenticated;

create or replace function marriage.member_card_before_boundaries(viewer uuid,subject uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare m marriage.members; card jsonb;
begin
 select * into m from marriage.members where id=subject;
 if viewer<>subject and m.profile_review_pending and m.review_status='pending' then
   card:=marriage.approved_review_card(m);
   if card is not null then return card; end if;
 end if;
 if viewer<>subject and m.review_status<>'approved' then
   return jsonb_build_object('id',subject,'alias','عضو','age',0,'city','','occupation','','bio','',
     'interests','[]'::jsonb,'reasons','[]'::jsonb,'portrait',null);
 end if;
 return marriage.member_card_before_profile_lifecycle(viewer,subject);
end $$;

create function marriage.my_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); m marriage.members; card jsonb; shares jsonb; subscriptions jsonb;
begin
 select * into strict m from marriage.members where id=me;
 if m.profile_review_pending and m.review_status='pending' and not m.suspended then
   card:=marriage.approved_review_card(m);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('requestId',g.request_id,
   'name',coalesce(case when marriage.relationship_open(me,g.recipient_id) then marriage.closure_alias(g.recipient_id) end,'عضو'),'expiresAt',g.expires_at)
   order by g.expires_at), '[]'::jsonb) into shares
 from marriage.photo_assets p join marriage.photo_grants g on g.photo_id=p.id
 where p.owner_id=me and p.state='active' and g.expires_at>now();

 -- Select the latest period per subscription. An older renewal snapshot must never price a newer period.
 select coalesce(jsonb_agg(jsonb_build_object('freeTrial',t.free_trial,
   'endsAt',case when o.status_transaction=t.transaction_id and o.renewal_status=4 then greatest(t.expires_at,o.grace_until) else t.expires_at end,
   'autoRenew',case when o.status_transaction=t.transaction_id then o.auto_renew end,
   'billingRetry',case when o.status_transaction=t.transaction_id then o.billing_retry or o.renewal_status=4 end,
   'renewalDate',case when o.status_transaction=t.transaction_id and o.auto_renew and o.renewal_status=1 then o.renewal_date end,
   'milliunits',case when o.status_transaction=t.transaction_id and o.auto_renew and o.renewal_status=1 then o.renewal_milliunits end,
   'currency',case when o.status_transaction=t.transaction_id and o.auto_renew and o.renewal_status=1 then o.renewal_currency end)
   order by t.expires_at desc), '[]'::jsonb) into subscriptions
 from marriage.subscription_owners o
 cross join lateral (select s.* from marriage.store_transactions s where s.original_id=o.original_id
   order by coalesce(s.purchased_at,s.signed_at) desc,s.expires_at desc limit 1) t
 where o.member_id=me and not t.revoked
   and (o.status_transaction is distinct from t.transaction_id or o.renewal_status not in (2,3,5))
   and (t.expires_at>now() or (o.status_transaction=t.transaction_id and o.renewal_status=4 and o.grace_until>now()));

 return jsonb_build_object('approvedPreview',card,'shares',shares,'subscriptions',subscriptions,
   'visibility',case when m.suspended or m.is_dummy then 'unavailable' when m.paused then 'paused'
     when m.review_status='draft' then 'draft'
     when m.review_status<>'approved' or m.profile_review_pending then 'review'
     when not marriage.is_paid(me) then 'membership'
     when exists(select 1 from marriage.exclusive_members where member_id=me) then 'exclusive'
     else 'eligible' end);
end $$;

-- Withdrawing an existing grant is allowed even if the owner's membership has lapsed.
create function marriage.revoke_my_photo_share(request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); peer uuid;
begin
 delete from marriage.photo_grants g using marriage.photo_assets p where p.id=g.photo_id
   and p.owner_id=me and g.request_id=$1 returning g.recipient_id into peer;
 if found then perform marriage.photo_signal(me,peer); end if;
end $$;
create function public.marriage_my_settings() returns jsonb language sql stable security invoker set search_path=''
 as $$select marriage.my_settings()$$;
create function public.marriage_revoke_my_photo_share(request_id uuid) returns void language sql security invoker set search_path=''
 as $$select marriage.revoke_my_photo_share($1)$$;
revoke all on function marriage.my_settings(), marriage.revoke_my_photo_share(uuid),
 public.marriage_my_settings(), public.marriage_revoke_my_photo_share(uuid) from public,anon,authenticated;
grant execute on function marriage.my_settings(), marriage.revoke_my_photo_share(uuid),
 public.marriage_my_settings(), public.marriage_revoke_my_photo_share(uuid) to authenticated;
