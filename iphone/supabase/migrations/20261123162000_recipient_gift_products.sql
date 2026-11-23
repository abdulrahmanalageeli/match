-- Before recipient-specific pricing, every issued checkout token authorized the base product.
-- Freeze those authorizations, including unfinished purchases and pending refund notifications.
alter table marriage.gift_invitations add column checkout_product text;
update marriage.gift_invitations set checkout_product=marriage.gift_product(tier) where checkout_token is not null;
alter table marriage.gift_invitations add constraint gift_checkout_product_bound
 check((checkout_token is null)=(checkout_product is null) and
   (checkout_product is null or checkout_product in (marriage.gift_product(tier),marriage.gift_product(tier)||'.women')));

create function marriage.recipient_gift_product(plan text,recipient_gender text) returns text
 language sql immutable strict set search_path='' as $$
 select case recipient_gender when 'man' then marriage.gift_product(plan)
  when 'woman' then marriage.gift_product(plan)||'.women' end
$$;
revoke all on function marriage.recipient_gift_product(text,text) from public,anon,authenticated,service_role;


create or replace function public.wudayn_prepare_gift(request_id uuid,selected_tier text,recipient_member uuid default null,recipient_phone text default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); receiver uuid; mobile text; hint text; i marriage.gift_invitations;
begin
 if not marriage.gift_member(me) then raise exception 'الإهداء غير متاح حاليًا.' using errcode='42501';end if;
 if request_id is null or selected_tier is null or selected_tier not in ('premium','seriousness') or num_nonnulls(recipient_member,recipient_phone)<>1
 then raise exception 'راجع بيانات الهدية.' using errcode='22023';end if;
 perform 1 from marriage.members where id=me for update;
 delete from marriage.gift_invitations where payer=me and checkout_token is null and created_at<now()-interval '30 days';
 select * into i from marriage.gift_invitations g where payer=me and g.request_id=$1;
 if found then return jsonb_build_object('orderToken',i.id,'productId',null);end if;
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
 return jsonb_build_object('orderToken',i.id,'productId',null);
end $$;

create or replace function marriage.sent_gifts(me uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'tier',tier,'productId',
  case when visible then coalesce(checkout_product,marriage.recipient_gift_product(tier,gender)) end,'status',status,
  'recipientHint',recipient_hint,'recipientName',case when visible then display_name end) order by created_at desc),'[]') from (
 select i.*,p.display_name,p.gender,(i.accepted_at is not null and marriage.gift_allowed(payer,recipient)) visible,
 case when exists(select from marriage.gift_purchases where invitation=i.id and not revoked and starts_at is not null) then 'delivered'
 when exists(select from marriage.gift_purchases where invitation=i.id and not revoked) then 'processing'
 when exists(select from marriage.gift_purchases where invitation=i.id) then 'refunded'
 when accepted_at is not null and lease_until>now() then 'paymentPending'
 when accepted_at>now()-interval '7 days' and marriage.gift_allowed(payer,recipient) then 'ready' else 'waiting' end status
 from marriage.gift_invitations i left join marriage.profiles p on p.member_id=i.recipient where payer=me
 and (i.created_at>now()-interval '14 days' or exists(select from marriage.gift_purchases where invitation=i.id))
 order by i.created_at desc limit 50) recent
$$;

create or replace function public.wudayn_gift_checkout(gift_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); i marriage.gift_invitations;
begin
 select * into i from marriage.gift_invitations where id=gift_id and payer=me for update;
 if i.accepted_at is null or i.accepted_at<=now()-interval '7 days' or marriage.gift_allowed(me,i.recipient) is not true
 or exists(select from marriage.gift_purchases where invitation=i.id)
 then raise exception 'الهدية غير متاحة للشراء.' using errcode='42501';end if;
 if i.lease_until>now() then raise exception 'توجد عملية شراء قيد المعالجة.' using errcode='P0001';end if;
 update marriage.gift_invitations g set checkout_token=coalesce(g.checkout_token,gen_random_uuid()),
  checkout_product=coalesce(g.checkout_product,marriage.recipient_gift_product(g.tier,p.gender)),lease_until=now()+interval '24 hours'
 from marriage.profiles p where g.id=i.id and p.member_id=g.recipient returning g.* into i;
 if not found then raise exception 'الهدية غير متاحة للشراء.' using errcode='42501';end if;
 return jsonb_build_object('orderToken',i.checkout_token,'productId',i.checkout_product);
end $$;

create or replace function public.wudayn_record_gift_receipt(actor uuid,receipt jsonb,event_type text,event_at bigint)
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
 if i.id is null or i.accepted_at is null or i.checkout_product is null or receipt->>'productId' is distinct from i.checkout_product
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

create or replace function public.wudayn_sent_gifts() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); held record;begin
 for held in select p.transaction_id,p.environment,p.bought_at,i.checkout_token,i.checkout_product from marriage.gift_invitations i
  join marriage.gift_purchases p on p.invitation=i.id where i.payer=me and p.starts_at is null and not p.revoked
  and marriage.gift_allowed(me,i.recipient) order by p.bought_at limit 10
 loop
  perform public.wudayn_record_gift_receipt(null,jsonb_build_object('bundleId','com.blindmatch.marriage','transactionId',held.transaction_id,
   'environment',held.environment,'type','Consumable','quantity',1,'purchaseDate',(extract(epoch from held.bought_at)*1000)::bigint,
   'productId',held.checkout_product,'appAccountToken',held.checkout_token),'RETRY_DELIVERY',(extract(epoch from now())*1000)::bigint);
 end loop;
 return marriage.sent_gifts(me);
end $$;
