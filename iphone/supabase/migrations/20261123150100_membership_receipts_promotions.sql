-- Apple identifiers are stored only after server verification of the transaction.
alter table marriage.store_transactions add column promotion_identifier text;
-- One unread receipt per entitlement source. Newer decisions supersede obsolete ones.
create table marriage.membership_receipts (
 member_id uuid not null references marriage.members(id) on delete cascade,
 source text not null check (source in ('staff','scheduled','manual','apple')),
 id uuid not null unique default gen_random_uuid(),
 tier text not null check (tier in ('premium','seriousness')),
 kind text not null check (kind in ('grant','extend','end','apple')),
 transaction_id text,
 starts_at timestamptz not null, ends_at timestamptz not null, changed_at timestamptz not null default now(),
 primary key(member_id,source)
);
alter table marriage.membership_receipts enable row level security;
revoke all on marriage.membership_receipts from public,anon,authenticated,service_role;

create function marriage.record_membership_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; origin text:=tg_argv[0]; plan text:='premium'; action text:='grant'; apple_tx text; starts timestamptz:=now(); ends timestamptz;
begin
 if origin='apple' then
  apple_tx:=new.transaction_id;
  select member_id into target from marriage.subscription_owners where original_id=new.original_id;
  if new.revoked or new.expires_at<=now() then
   delete from marriage.membership_receipts where member_id=target and source='apple' and transaction_id=apple_tx;
   return null;
  end if;
  if tg_op='UPDATE' then return null; end if;
  if exists(select 1 from marriage.store_transactions t where t.original_id=new.original_id and t.transaction_id<>new.transaction_id and
   (t.signed_at>new.signed_at or (t.product_id=new.product_id and not t.revoked and t.expires_at>=now()-interval '1 day'))) then return null;end if;
  plan:=case when new.product_id like '%.seriousness%' then 'seriousness' else 'premium' end;
  action:='apple'; ends:=new.expires_at;
 elsif origin='manual' then
  target:=new.id;ends:=new.manual_access_until;
  if ends is not distinct from old.manual_access_until or exists(select 1 from marriage.testing_signup_trials where member_id=target and expires_at=ends) then return null;end if;
  if ends is null or ends<=now() then action:='end';ends:=now();
  elsif old.manual_access_until>now() and ends>old.manual_access_until then action:='extend';end if;
 elsif tg_op='DELETE' then
  target:=old.member_id;plan:=old.tier;action:='end';ends:=now();
  if origin='scheduled' then starts:=old.starts_at;end if;
  if not exists(select 1 from marriage.members where id=target) then return null;end if;
 else
  target:=new.member_id;plan:=new.tier;ends:=new.expires_at;
  if origin='scheduled' then starts:=new.starts_at;end if;
  if tg_op='UPDATE' then
   if old.tier=new.tier and old.expires_at=new.expires_at then return null;end if;
   if old.tier=new.tier and old.expires_at>now() and ends>old.expires_at then action:='extend';end if;
  end if;
 end if;
 insert into marriage.membership_receipts(member_id,source,tier,kind,starts_at,ends_at,transaction_id) values(target,origin,plan,action,starts,ends,apple_tx)
 on conflict(member_id,source) do update set id=excluded.id,tier=excluded.tier,kind=excluded.kind,starts_at=excluded.starts_at,
   ends_at=excluded.ends_at,transaction_id=excluded.transaction_id,changed_at=now();
 return null;
end $$;
revoke all on function marriage.record_membership_receipt() from public,anon,authenticated,service_role;
create trigger membership_receipt after insert or update or delete on marriage.admin_membership_grants
 for each row execute function marriage.record_membership_receipt('staff');
create trigger membership_receipt after insert or update or delete on marriage.scheduled_grants
 for each row execute function marriage.record_membership_receipt('scheduled');
create trigger membership_receipt after update of manual_access_until on marriage.members
 for each row execute function marriage.record_membership_receipt('manual');
create trigger membership_receipt after insert or update on marriage.store_transactions
 for each row execute function marriage.record_membership_receipt('apple');

alter function marriage.member_state(uuid) rename to member_state_before_membership_receipts;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare base jsonb:=marriage.member_state_before_membership_receipts(target); gift_until timestamptz; plan text:=base#>>'{membership,tier}';
begin
 if base#>>'{membership,status}'='granted' or (base#>>'{membership,status}'='paid' and plan='seriousness'
   and coalesce(marriage.apple_product_access_until(target,true)>now(),false)=false) then
  select max(finish) into gift_until from (
   select expires_at as finish from marriage.admin_membership_grants where member_id=target and tier=plan
   union all select expires_at from marriage.scheduled_grants where member_id=target and tier=plan and starts_at<=now()
   union all select manual_access_until from marriage.members where id=target and plan='premium'
  ) gifts where finish>now();
 end if;
 return base || jsonb_build_object('currentGiftUntil',gift_until,'membershipNotice',(
  select jsonb_build_object('id',id,'source',source,'tier',tier,'kind',kind,'startsAt',starts_at,'endsAt',r.ends_at,
   'promotion',t.promotion_identifier is not null,'appleTrial',coalesce(t.free_trial,false))
  from marriage.membership_receipts r left join marriage.store_transactions t using(transaction_id) where r.member_id=target and (ends_at>now() or (kind='end' and changed_at>now()-interval '30 days'))
  order by changed_at desc,id limit 1));
end $$;
revoke all on function marriage.member_state(uuid) from public,anon,authenticated;
create function public.wudayn_ack_membership_notice(notice_id uuid) returns void
 language sql security definer set search_path='' as $$
 delete from marriage.membership_receipts where member_id=marriage.require_member() and id=notice_id
$$;
revoke all on function public.wudayn_ack_membership_notice(uuid) from public,anon,authenticated,service_role;
grant execute on function public.wudayn_ack_membership_notice(uuid) to authenticated;

alter function public.marriage_apply_apple_event(uuid,jsonb,boolean,jsonb) rename to marriage_apple_event_before_promotions;
revoke all on function public.marriage_apple_event_before_promotions(uuid,jsonb,boolean,jsonb) from public,anon,authenticated,service_role;
create function public.marriage_apply_apple_event(actor uuid,receipt jsonb,notification boolean,lifecycle jsonb)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result:=public.marriage_apple_event_before_promotions(actor,receipt,notification,lifecycle);
 if result is not null and receipt->>'offerType'='2' and length(receipt->>'offerIdentifier') between 1 and 128 then
  update marriage.store_transactions set promotion_identifier=receipt->>'offerIdentifier'
   where transaction_id=receipt->>'transactionId' and original_id=receipt->>'originalTransactionId'
    and environment=receipt->>'environment' and promotion_identifier is null;
  if exists(select 1 from marriage.membership_receipts where id=(result#>>'{membershipNotice,id}')::uuid and transaction_id=receipt->>'transactionId') then
   result:=jsonb_set(result,'{membershipNotice,promotion}','true');
  end if;
 end if;
 return result;
end $$;
revoke all on function public.marriage_apply_apple_event(uuid,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.marriage_apply_apple_event(uuid,jsonb,boolean,jsonb) to service_role;

-- Apple supplies the price, duration and payment mode. An owner selects the App Store Connect offer ID.
create table marriage.membership_promotions (
 product text primary key, audit_id uuid not null default gen_random_uuid(), offer_id text, ends_at timestamptz,
 revision integer not null default 0, check((offer_id is null)=(ends_at is null))
);
alter table marriage.membership_promotions enable row level security;
revoke all on marriage.membership_promotions from public,anon,authenticated,service_role;
insert into marriage.membership_promotions(product) select 'com.blindmatch.marriage.monthly.'||suffix
 from unnest(array['men','women','seriousness','seriousness.women']) suffix;

create function public.wudayn_admin_promotion(product_id text,expected_revision integer default null,offer_identifier text default null,ends timestamptz default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner']); p marriage.membership_promotions;
begin
 select * into strict p from marriage.membership_promotions where product=product_id for update;
 if expected_revision is not null then
  if expected_revision<>p.revision then raise exception 'تغيّر العرض. حدّث بياناته أولًا.' using errcode='40001';end if;
  if (offer_identifier is null)<>(ends is null) or (offer_identifier is not null and
   (offer_identifier !~ '^[A-Za-z0-9._-]{1,64}$' or ends<=now())) then raise exception 'راجع معرّف العرض وتاريخ الانتهاء.' using errcode='22023';end if;
  update marriage.membership_promotions set revision=revision+1, offer_id=offer_identifier,ends_at=ends where product=product_id returning * into p;
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,result)
  values(staff.user_id,staff.display_name,staff.role,'membership_promotion','publication',p.audit_id,'تحديث عرض عودة المشتركين',
    jsonb_build_object('product',p.product,'offer',p.offer_id,'ends',p.ends_at));
 end if;
 return jsonb_build_object('offer',p.offer_id,'ends',p.ends_at,'revision',p.revision);
end $$;

create function public.wudayn_eligible_promotion(actor uuid,product_id text,store_environment text) returns text
 language sql stable security definer set search_path='' as $$
 select p.offer_id from marriage.membership_promotions p
 join marriage.members m on m.id=actor join marriage.profiles profile on profile.member_id=m.id
 where p.product=product_id and p.ends_at>now() and store_environment in ('Production','Sandbox')
 and m.review_status='approved' and not m.paused and not m.suspended and not m.profile_review_pending and not m.is_dummy
 and not marriage.is_paid(actor)
 and (profile.gender='woman')=(product_id like '%.women')
 and exists(select 1 from marriage.subscription_owners o join marriage.store_transactions t using(original_id)
  where o.member_id=actor and t.environment=store_environment and not t.revoked and t.expires_at<=now())
 and not exists(select 1 from marriage.subscription_owners o join marriage.store_transactions t using(original_id)
  where o.member_id=actor and t.environment=store_environment and t.product_id=p.product and t.promotion_identifier=p.offer_id)
$$;
revoke all on function public.wudayn_admin_promotion(text,integer,text,timestamptz),public.wudayn_eligible_promotion(uuid,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.wudayn_admin_promotion(text,integer,text,timestamptz) to authenticated;
grant execute on function public.wudayn_eligible_promotion(uuid,text,text) to service_role;
