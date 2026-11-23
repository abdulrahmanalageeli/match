-- An invitation never authorizes a charge. Only the purchaser receives its separate StoreKit token after acceptance.
create table marriage.gift_invitations (
 id uuid primary key default gen_random_uuid(), payer uuid references marriage.members on delete set null,
 recipient uuid references marriage.members on delete set null, request_id uuid not null, recipient_hint text not null,
 tier text not null check(tier in ('premium','seriousness')), created_at timestamptz not null default now(),
 accepted_at timestamptz, declined_at timestamptz, checkout_token uuid unique, lease_until timestamptz,
 unique(payer,request_id), check(payer<>recipient)
);
create index gift_invitations_recipient on marriage.gift_invitations(recipient,created_at desc);
create index gift_invitations_payer on marriage.gift_invitations(payer,created_at desc);
create table marriage.gift_purchases (
 environment text not null check(environment in ('Sandbox','Production')), transaction_id text not null,
 invitation uuid not null references marriage.gift_invitations, recipient uuid references marriage.members on delete set null,
 tier text not null check(tier in ('premium','seriousness')), bought_at timestamptz not null,
 starts_at timestamptz, ends_at timestamptz, revoked boolean not null default false, decision_at bigint,
 primary key(environment,transaction_id),check((starts_at is null)=(ends_at is null)),check(ends_at>starts_at)
);
create index gift_purchases_invitation on marriage.gift_purchases(invitation);
create index gift_purchases_access on marriage.gift_purchases(recipient,ends_at) where not revoked;
alter table marriage.gift_invitations enable row level security;
alter table marriage.gift_purchases enable row level security;
revoke all on marriage.gift_invitations,marriage.gift_purchases from public,anon,authenticated,service_role;
alter table marriage.membership_receipts drop constraint membership_receipts_source_check,
 add check(source in ('staff','scheduled','manual','apple','member'));

create function marriage.gift_product(plan text) returns text language sql immutable strict set search_path='' as $$
 select 'com.blindmatch.marriage.gift.'||plan||'.30d'
$$;
create function marriage.gift_member(member uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.launch_admitted(member) and exists(select from marriage.members m where m.id=member and
  m.review_status='approved' and not m.paused and not m.suspended and not m.profile_review_pending and not m.is_dummy)
$$;
create function marriage.gift_allowed(buyer uuid,receiver uuid) returns boolean language sql stable set search_path='' as $$
 select buyer<>receiver and marriage.gift_member(buyer) and marriage.gift_member(receiver)
 and not exists(select from marriage.conduct_cases c where c.member_id=buyer and c.decision is distinct from 'lifted'
  and ((c.kind='restriction' and c.ends_at>now()) or (c.kind='pledge' and c.acknowledged_at is null)))
 and not exists(select from marriage.blocks where (member_id,blocked_id) in ((buyer,receiver),(receiver,buyer)))
$$;
create function public.wudayn_prepare_gift(request_id uuid,selected_tier text,recipient_member uuid default null,recipient_phone text default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); receiver uuid; mobile text; hint text; i marriage.gift_invitations;
begin
 if not marriage.gift_member(me) then raise exception 'الإهداء غير متاح حاليًا.' using errcode='42501';end if;
 if request_id is null or selected_tier is null or selected_tier not in ('premium','seriousness') or num_nonnulls(recipient_member,recipient_phone)<>1
 then raise exception 'راجع بيانات الهدية.' using errcode='22023';end if;
 perform 1 from marriage.members where id=me for update;
 delete from marriage.gift_invitations where payer=me and checkout_token is null and created_at<now()-interval '30 days';
 select * into i from marriage.gift_invitations g where payer=me and g.request_id=$1;
 if found then return jsonb_build_object('orderToken',i.id,'productId',marriage.gift_product(i.tier));end if;
 if (select count(*) from marriage.gift_invitations where payer=me and created_at>now()-interval '24 hours')>=5
 then raise exception 'وصلت إلى حد دعوات الإهداء اليوم.' using errcode='P0001';end if;
 if recipient_phone is not null then
  mobile:=regexp_replace(translate(recipient_phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[[:space:]()-]','','g');
  if mobile ~ '^05[0-9]{8}$' then mobile:='+966'||substr(mobile,2);
  elsif mobile ~ '^(00966|966|[+]966)5[0-9]{8}$' then mobile:='+'||right(mobile,12);
  else raise exception 'أدخل رقم جوال سعوديًا صحيحًا.' using errcode='22023';end if;
  hint:=right(mobile,4);
  select member_id into receiver from marriage.phone_claims where phone_tag=marriage.phone_claim_tag(mobile)
   and not held and (auth_bound or signup_bound);
 else
  hint:=upper(right(recipient_member::text,4));
  if marriage.profile_visible(recipient_member) then receiver:=recipient_member;end if;
 end if;
 -- Always use the same result for a valid address, including unknown numbers, blocks and recent duplicate requests.
 if marriage.gift_allowed(me,receiver) is not true or exists(select from marriage.gift_invitations where
   payer=me and recipient=receiver and created_at>now()-interval '7 days' and accepted_at is null)
 then receiver:=null;end if;
 insert into marriage.gift_invitations(payer,recipient,request_id,tier,recipient_hint) values(me,receiver,$1,selected_tier,'•••• '||hint) returning * into i;
 return jsonb_build_object('orderToken',i.id,'productId',marriage.gift_product(i.tier));
end $$;
create function public.wudayn_received_gifts() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'tier',i.tier,'days',30,'senderName',p.display_name)
 order by i.created_at desc),'[]') from marriage.gift_invitations i join marriage.profiles p on p.member_id=i.payer
 where i.recipient=marriage.require_member() and i.declined_at is null and i.accepted_at is null and i.created_at>now()-interval '7 days'
 and marriage.gift_allowed(i.payer,i.recipient)
$$;
create function public.wudayn_accept_gift(gift_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 update marriage.gift_invitations set accepted_at=coalesce(accepted_at,now()) where id=gift_id and recipient=me and declined_at is null
 and created_at>now()-interval '7 days' and marriage.gift_allowed(payer,recipient);
 if not found then raise exception 'الدعوة غير متاحة.' using errcode='42501';end if;
end $$;
create function public.wudayn_decline_gift(gift_id uuid) returns void language sql security definer set search_path='' as $$
 update marriage.gift_invitations set declined_at=now() where id=gift_id and recipient=marriage.require_member() and accepted_at is null
$$;
create function marriage.sent_gifts(me uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'tier',tier,'productId',marriage.gift_product(tier),'status',status,
  'recipientHint',recipient_hint,'recipientName',case when visible then display_name end) order by created_at desc),'[]') from (
 select i.*,p.display_name,(i.accepted_at is not null and marriage.gift_allowed(payer,recipient)) visible,
 case when exists(select from marriage.gift_purchases where invitation=i.id and not revoked and starts_at is not null) then 'delivered'
 when exists(select from marriage.gift_purchases where invitation=i.id and not revoked) then 'processing'
 when exists(select from marriage.gift_purchases where invitation=i.id) then 'refunded'
 when accepted_at is not null and lease_until>now() then 'paymentPending'
 when accepted_at>now()-interval '7 days' and marriage.gift_allowed(payer,recipient) then 'ready' else 'waiting' end status
 from marriage.gift_invitations i left join marriage.profiles p on p.member_id=i.recipient where payer=me
 and (i.created_at>now()-interval '14 days' or exists(select from marriage.gift_purchases where invitation=i.id))
 order by i.created_at desc limit 50) recent
$$;
create function public.wudayn_gift_checkout(gift_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); i marriage.gift_invitations;
begin
 select * into i from marriage.gift_invitations where id=gift_id and payer=me for update;
 if i.accepted_at is null or i.accepted_at<=now()-interval '7 days' or marriage.gift_allowed(me,i.recipient) is not true
 or exists(select from marriage.gift_purchases where invitation=i.id)
 then raise exception 'الهدية غير متاحة للشراء.' using errcode='42501';end if;
 if i.lease_until>now() then raise exception 'توجد عملية شراء قيد المعالجة.' using errcode='P0001';end if;
 update marriage.gift_invitations set checkout_token=coalesce(checkout_token,gen_random_uuid()),lease_until=now()+interval '24 hours'
 where id=i.id returning * into i;
 return jsonb_build_object('orderToken',i.checkout_token,'productId',marriage.gift_product(i.tier));
end $$;
create function public.wudayn_release_gift_checkout(order_token uuid) returns void language sql security definer set search_path='' as $$
 update marriage.gift_invitations set lease_until=null where payer=marriage.require_member() and checkout_token=order_token
 and not exists(select from marriage.gift_purchases where invitation=id)
$$;

-- Resolve overlapping periods once per purchase under the recipient row lock.
create function marriage.allocate_member_gift(target uuid,plan text,out begins timestamptz,out ends timestamptz)
 language plpgsql stable set search_path='' as $$
declare covered record; covered_until timestamptz:=now();begin
 begins:=now();ends:=begins+interval '30 days';
 for covered in
  select s,e from (
   select now() s, marriage.apple_product_access_until(target,plan='seriousness') e
   union all select now(),manual_access_until from marriage.members where id=target and plan='premium'
   union all select now(),expires_at from marriage.admin_membership_grants where member_id=target and (plan='premium' or tier=plan)
   union all select starts_at,expires_at from marriage.scheduled_grants where member_id=target and (plan='premium' or tier=plan)
   union all select starts_at,ends_at from marriage.gift_purchases where recipient=target and not revoked and (plan='premium' or tier=plan)
  ) periods where e>now() order by s,e
 loop
  if covered.s>=ends then exit;end if;
  if covered.e>covered_until then
   if covered.s<=begins then begins:=greatest(begins,covered.e);end if;
   ends:=ends+(covered.e-greatest(covered.s,covered_until));
   covered_until:=covered.e;
  end if;
 end loop;
end $$;
create function public.wudayn_record_gift_receipt(actor uuid,receipt jsonb,event_type text,event_at bigint)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare tx text:=receipt->>'transactionId'; env text:=receipt->>'environment'; token uuid:=(receipt->>'appAccountToken')::uuid;
 i marriage.gift_invitations; oldp marriage.gift_purchases; g marriage.gift_purchases; existed boolean;
 decision boolean; changed boolean; starts timestamptz; finish timestamptz; action text;
begin
 if env is null or env not in ('Production','Sandbox') or tx is null or tx !~ '^[0-9]{1,80}$' or receipt->>'type' is distinct from 'Consumable'
 or receipt->>'bundleId' is distinct from 'com.blindmatch.marriage' or (receipt->>'quantity')::integer is distinct from 1
 or coalesce((receipt->>'purchaseDate')::bigint,0)<=0 or coalesce(event_at,0)<=0 then
 raise exception 'Invalid Apple gift purchase' using errcode='22023';end if;
 if token is null then
  select inv.* into i from marriage.gift_purchases p join marriage.gift_invitations inv on inv.id=p.invitation
   where p.environment=env and p.transaction_id=tx for update of inv;
 else select * into i from marriage.gift_invitations where checkout_token=token for update;end if;
 if i.id is null or i.accepted_at is null or receipt->>'productId' is distinct from marriage.gift_product(i.tier)
 or (actor is not null and actor is distinct from i.payer) then raise exception 'Invalid gift order' using errcode='42501';end if;
 select * into oldp from marriage.gift_purchases where environment=env and transaction_id=tx for update;
 existed:=found;
 if existed and oldp.invitation<>i.id then raise exception 'Gift purchase already bound' using errcode='42501';end if;
 if event_type='REFUND_REVERSED' then decision:=false;
 elsif event_type='REFUND' or (receipt->>'revocationDate') is not null then decision:=true;end if;
 if not existed then
  insert into marriage.gift_purchases(environment,transaction_id,invitation,recipient,tier,bought_at,revoked,decision_at)
   values(env,tx,i.id,i.recipient,i.tier,to_timestamp((receipt->>'purchaseDate')::bigint/1000.0),coalesce(decision,false),
    case when decision is not null then event_at end) returning * into g;
 else
  g:=oldp;
  if decision is not null and (g.decision_at is null or event_at>g.decision_at) then
   update marriage.gift_purchases set revoked=decision,decision_at=event_at where environment=env and transaction_id=tx returning * into g;
  end if;
 end if;
 changed:=existed and oldp.revoked<>g.revoked;
 if g.recipient is not null then perform 1 from marriage.members where id=g.recipient for update;end if;
 if not g.revoked and g.starts_at is null and marriage.gift_allowed(i.payer,i.recipient) then
  select begins,ends into starts,finish from marriage.allocate_member_gift(g.recipient,g.tier);
  update marriage.gift_purchases set starts_at=starts,ends_at=finish where environment=env and transaction_id=tx returning * into g;
  action:=case when starts>now() then 'extend' else 'grant' end;
 elsif g.starts_at is not null and changed then
  starts:=g.starts_at;finish:=case when g.revoked then now() else g.ends_at end;action:=case when g.revoked then 'end' else 'grant' end;
 end if;
 if action is not null and g.recipient is not null then
  insert into marriage.membership_receipts(member_id,source,tier,kind,starts_at,ends_at)
   values(g.recipient,'member',g.tier,action,starts,finish)
   on conflict(member_id,source) do update set id=excluded.id,tier=excluded.tier,kind=excluded.kind,starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,changed_at=now();
 end if;
 if actor is null then return jsonb_build_object('recorded',true);end if;
 return marriage.member_state(actor);
end $$;

-- Recover an already-paid gift when both parties become eligible again. No new Apple charge is required.
create function public.wudayn_sent_gifts() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); held record;begin
 for held in select p.transaction_id,p.environment,p.bought_at,i.checkout_token,i.tier from marriage.gift_invitations i
  join marriage.gift_purchases p on p.invitation=i.id where i.payer=me and p.starts_at is null and not p.revoked
  and marriage.gift_allowed(me,i.recipient) order by p.bought_at limit 10
 loop
  perform public.wudayn_record_gift_receipt(null,jsonb_build_object('bundleId','com.blindmatch.marriage','transactionId',held.transaction_id,
   'environment',held.environment,'type','Consumable','quantity',1,'purchaseDate',(extract(epoch from held.bought_at)*1000)::bigint,
   'productId',marriage.gift_product(held.tier),'appAccountToken',held.checkout_token),'RETRY_DELIVERY',(extract(epoch from now())*1000)::bigint);
 end loop;
 return marriage.sent_gifts(me);
end $$;

alter function marriage.is_paid_before_owner_testing(uuid) rename to is_paid_before_member_gifts;
alter function marriage.is_serious_before_owner_testing(uuid) rename to is_serious_before_member_gifts;
create function marriage.is_paid_before_owner_testing(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.is_paid_before_member_gifts(target) or exists(select from marriage.gift_purchases where recipient=target and not revoked and starts_at<=now() and ends_at>now())
$$;
create function marriage.is_serious_before_owner_testing(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.is_serious_before_member_gifts(target) or exists(select from marriage.gift_purchases where recipient=target and not revoked and starts_at<=now() and ends_at>now() and tier='seriousness')
$$;
alter function marriage.member_state(uuid) rename to member_state_before_member_gifts;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare base jsonb:=marriage.member_state_before_member_gifts(target); active_until timestamptz;begin
 select max(ends_at) into active_until from marriage.gift_purchases where recipient=target and not revoked
 and starts_at<=now() and ends_at>now() and tier=base#>>'{membership,tier}';
 if active_until is not null then
  if base#>>'{membership,tier}'='seriousness' then
   base:=jsonb_set(base,'{membership,expiresAt}',to_jsonb(greatest(active_until,marriage.apple_product_access_until(target,true),
    (select expires_at from marriage.admin_membership_grants where member_id=target and tier='seriousness'),
    (select expires_at from marriage.scheduled_grants where member_id=target and tier='seriousness' and starts_at<=now()))));
  else base:=jsonb_set(base,'{membership,expiresAt}',to_jsonb(greatest(active_until,(base#>>'{membership,expiresAt}')::timestamptz)));end if;
  base:=jsonb_set(base,'{membership,currentMemberGiftUntil}',to_jsonb(active_until));
 end if;
 return base||jsonb_build_object('currentMemberGiftUntil',active_until,'giftInvitations',(
  select count(*) from marriage.gift_invitations where recipient=target and accepted_at is null and declined_at is null
  and created_at>now()-interval '7 days' and marriage.gift_allowed(payer,recipient)), 'giftsReady',(
  select count(*) from marriage.gift_invitations i where payer=target and accepted_at>now()-interval '7 days'
  and (lease_until is null or lease_until<=now()) and marriage.gift_allowed(payer,recipient)
  and not exists(select from marriage.gift_purchases where invitation=i.id)));
end $$;
revoke all on function marriage.gift_product(text),marriage.gift_member(uuid),marriage.gift_allowed(uuid,uuid),marriage.sent_gifts(uuid),marriage.allocate_member_gift(uuid,text),
 marriage.member_state(uuid),marriage.member_state_before_member_gifts(uuid),marriage.is_paid_before_owner_testing(uuid),marriage.is_serious_before_owner_testing(uuid)
 from public,anon,authenticated,service_role;
revoke all on function public.wudayn_prepare_gift(uuid,text,uuid,text),public.wudayn_received_gifts(),public.wudayn_sent_gifts(),
 public.wudayn_accept_gift(uuid),public.wudayn_decline_gift(uuid),public.wudayn_gift_checkout(uuid),public.wudayn_release_gift_checkout(uuid),
 public.wudayn_record_gift_receipt(uuid,jsonb,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.wudayn_prepare_gift(uuid,text,uuid,text),public.wudayn_received_gifts(),public.wudayn_sent_gifts(),
 public.wudayn_accept_gift(uuid),public.wudayn_decline_gift(uuid),public.wudayn_gift_checkout(uuid),public.wudayn_release_gift_checkout(uuid) to authenticated;
grant execute on function public.wudayn_record_gift_receipt(uuid,jsonb,text,bigint) to service_role;
