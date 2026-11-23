-- Private, bounded measurements. No transcript, message body or questionnaire answer is copied.
create table marriage.launch_measurement (
 id boolean primary key default true check(id), started_at timestamptz not null default now(),
 label_minimum integer check(label_minimum >= 5), label_regular numeric check(label_regular between 0 and 1)
);
insert into marriage.launch_measurement(id) values(true);
create table marriage.launch_events (
 member_id uuid not null references marriage.members on delete cascade,
 day date not null default ((now() at time zone 'Asia/Riyadh')::date),
 kind text not null, step text not null default '', first_at timestamptz not null default now(),
 last_at timestamptz not null default now(), platform text not null default 'unknown',build text not null default 'unknown', primary key(member_id,day,kind,step,platform,build)
);
create index launch_events_window on marriage.launch_events(day,kind);
create table marriage.launch_sms_daily(day date not null, state text not null, total bigint not null, primary key(day,state));
alter table marriage.launch_measurement enable row level security;
alter table marriage.launch_events enable row level security;
alter table marriage.launch_sms_daily enable row level security;
revoke all on marriage.launch_measurement, marriage.launch_events, marriage.launch_sms_daily from public,anon,authenticated,service_role;

create function marriage.launch_note(kind_value text, step_value text,platform_value text,build_value text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=marriage.require_member();
begin
 if kind_value is null or step_value is null or platform_value is null or platform_value not in ('web','ios','unknown') or build_value is null or build_value !~ '^[A-Za-z0-9_-]{1,32}$' then raise exception 'Invalid event' using errcode='22023';end if;
 if not (coalesce(kind_value,'') in ('reached','completed','resumed','error') and coalesce(step_value,'') in
    ('identity','eligibility','story','details','avatar','criteria','compatibility','personality','beena','preferences','readiness','review')
  or kind_value in ('fault','success') and step_value in ('compatibility','review','render_error','unhandled_error','unhandled_rejection')
  or kind_value='activity' and step_value in ('discovery','profile','luna')
  or kind_value in ('eligible','offer_seen','chose_free','checkout','left_offer') and step_value in ('trial','standard')) then
  raise exception 'Invalid event' using errcode='22023';
 end if;
 if not exists(select 1 from marriage.launch_events where member_id=actor and day=(now() at time zone 'Asia/Riyadh')::date and platform=platform_value and build=build_value)
    and (select count(distinct build) from marriage.launch_events where member_id=actor and day=(now() at time zone 'Asia/Riyadh')::date and platform=platform_value)>=4 then build_value:='other';end if;
 insert into marriage.launch_events(member_id,kind,step,platform,build) values(actor,kind_value,step_value,platform_value,build_value)
 on conflict(member_id,day,kind,step,platform,build) do update set last_at=now()
 where marriage.launch_events.last_at<now()-interval '1 minute';
end $$;
create function public.marriage_launch_note(kind_value text,step_value text,platform_value text default 'unknown',build_value text default 'unknown') returns void
 language sql security invoker set search_path='' as $$select marriage.launch_note($1,$2,$3,$4)$$;

-- SMS challenges may precede Auth. Count attempts in aggregate without storing recipient identifiers.
create function marriage.launch_sms_counter() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or old.status is distinct from new.status then
 insert into marriage.launch_sms_daily values ((now() at time zone 'Asia/Riyadh')::date,new.status,1)
 on conflict(day,state) do update set total=marriage.launch_sms_daily.total+1;
 end if;return new;
end $$;
create trigger launch_sms_counter after insert or update of status on marriage.signup_sms_challenges for each row execute function marriage.launch_sms_counter();

-- Persist who deliberately closed the connection and when an acceptance first occurred.
alter table marriage.member_requests add column analytics_accepted_at timestamptz,
 add column analytics_closed_by uuid;
update marriage.member_requests r set analytics_accepted_at=f.accepted_at from marriage.fit_observations f
 where f.request_id=r.id and f.accepted_at is not null;
create function marriage.launch_request_stamp() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='accepted' and old.status is distinct from new.status then new.analytics_accepted_at:=now();end if;
 if old.status='accepted' and new.status in ('closed','cancelled') and new.closure_outcome is distinct from 'expired'
  and auth.uid() in (new.requester_id,new.recipient_id) then new.analytics_closed_by:=auth.uid();end if;
 return new;
end $$;
create trigger zz_launch_request_stamp before update of status on marriage.member_requests for each row execute function marriage.launch_request_stamp();

-- Capture trial attribution from the verified receipt, never from the checkout button.
alter table marriage.store_transactions add column analytics_trial boolean;
alter function public.marriage_apply_apple_event(uuid,jsonb,boolean,jsonb) rename to marriage_apply_apple_event_before_analytics;
revoke all on function public.marriage_apply_apple_event_before_analytics(uuid,jsonb,boolean,jsonb) from public,anon,authenticated,service_role;
create function public.marriage_apply_apple_event(actor uuid,receipt jsonb,notification boolean,lifecycle jsonb)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result:=public.marriage_apply_apple_event_before_analytics(actor,receipt,notification,lifecycle);
 if result is not null then
 update marriage.store_transactions set analytics_trial=coalesce(receipt->>'offerType'='1',false)
 where transaction_id=receipt->>'transactionId' and environment=receipt->>'environment' and analytics_trial is null;
 end if;return result;
end $$;
revoke all on function public.marriage_apply_apple_event(uuid,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.marriage_apply_apple_event(uuid,jsonb,boolean,jsonb) to service_role;

-- A verified launch reservation identifies its original trial transaction (including historical receipts).
create view marriage.launch_receipts as
select o.member_id,t.transaction_id,t.original_id,t.product_id,t.expires_at,t.revoked,
 coalesce(t.purchased_at,t.signed_at) as purchased_at,t.signed_at,
 coalesce(t.analytics_trial,t.original_id=t.transaction_id and c.original_id is not null) as trial,
 o.billing_retry,o.auto_renew,o.grace_until,o.renewal_status,o.status_transaction,
 greatest(t.expires_at,case when o.status_transaction=t.transaction_id and o.renewal_status=4 then o.grace_until end) as effective_end
from marriage.subscription_owners o join marriage.store_transactions t using(original_id)
left join marriage.launch_offer_claims c on c.original_id=o.original_id
where t.environment='Production';

create function marriage.launch_scheduled_tier(target uuid) returns text language sql stable set search_path='' as $$select null::text$$;
revoke all on function marriage.launch_scheduled_tier(uuid) from public,anon,authenticated,service_role;
create view marriage.launch_members as
select m.id as member_id,p.display_name as name,
 case when coalesce(p.gender,d.document#>>'{answers,gender}') in ('woman','man') then coalesce(p.gender,d.document#>>'{answers,gender}') else 'unknown' end as gender,
 m.joined_at,m.review_status,m.suspended,m.paused,p.member_id is not null as has_profile,
 coalesce(v.verified_at,u.phone_confirmed_at) as phone_at, r.submitted_at, r.approved_at,
 case when m.review_status='approved' then 'approved' when m.review_status='pending' then 'pending'
  when e.step is not null or d.member_id is not null then 'onboarding'
  when coalesce(v.verified_at,u.phone_confirmed_at) is null then 'phone_pending' else 'created' end as stage,
 case when e.last_at>d.updated_at or d.updated_at is null then coalesce(e.step,d.document->>'step') else d.document->>'step' end as step,
 greatest(m.joined_at,e.last_at,d.updated_at,r.submitted_at,r.approved_at,v.verified_at) as stamp,
 case when m.suspended then 'suspended' when m.paused then 'paused' when m.review_status='approved' then 'visible' else 'unpublished' end as visibility,
 case when (g.tier='seriousness' or live.serious or scheduled.tier='seriousness') then 'seriousness' when g.tier='premium' or scheduled.tier='premium' or live.paid or m.manual_access_until>now() then 'premium' else 'free' end as tier,
 coalesce(live.paid,false) as store_access,coalesce(g.member_id is not null or scheduled.tier is not null or m.manual_access_until>now() and not exists(select 1 from marriage.testing_signup_trials pt where pt.member_id=m.id and pt.expires_at=m.manual_access_until),false) as granted,
 a.decision,case when a.review_resolved_at is null then a.review_reasons end as blockers,
 (select step from marriage.launch_events e where e.member_id=m.id and e.kind='completed' order by e.last_at desc limit 1) as last_completed
from marriage.members m join auth.users u on u.id=m.id
left join marriage.profiles p on p.member_id=m.id
left join marriage.onboarding_drafts d on d.member_id=m.id and d.expires_at>now()
left join marriage.signup_phone_verifications v on v.user_id=m.id
left join marriage.application_integrity_receipts a on a.member_id=m.id
left join marriage.admin_membership_grants g on g.member_id=m.id and g.expires_at>now()
cross join lateral(select marriage.launch_scheduled_tier(m.id) tier) scheduled
left join lateral(select l.step,l.last_at from marriage.launch_events l where l.member_id=m.id and l.kind in ('reached','resumed','completed') order by l.last_at desc limit 1)e on true
left join lateral(select min(recorded_at) filter(where action='submit') submitted_at,min(recorded_at) filter(where action='approve') approved_at from marriage.reviews where member_id=m.id)r on true
left join lateral(select bool_or(true) paid,bool_or(t.product_id like '%seriousness%') serious from marriage.launch_receipts t
 where t.member_id=m.id and not revoked and effective_end>now() and marriage.apple_access_until(m.id)>now()
 and (status_transaction is null or status_transaction=t.transaction_id or purchased_at>(select coalesce(s.purchased_at,s.signed_at) from marriage.store_transactions s where s.transaction_id=t.status_transaction)))live on true
where not m.is_dummy and not exists(select 1 from marriage.staff_accounts s where s.user_id=m.id)
 and not exists(select 1 from marriage.family_accounts f where f.user_id=m.id)
 and u.raw_app_meta_data->'guardian_account' is distinct from 'true'::jsonb
 and not exists(select 1 from marriage.membership_test_overrides o where o.member_id=m.id);
revoke all on marriage.launch_receipts,marriage.launch_members from public,anon,authenticated,service_role;

create function marriage.admin_launch_directory(search_value text,stage_value text,stalled_hours integer,before_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare q text:=trim(coalesce(search_value,''));begin
 perform marriage.require_staff(array['owner']);
 if length(q)>160 or stalled_hours not in(0,24,168) then raise exception 'Invalid filter' using errcode='22023';end if;
 return (select coalesce(jsonb_agg(to_jsonb(page) order by "memberId" desc),'[]') from
 (select m.member_id "memberId",m.name,m.gender,m.stage,m.step,m.last_completed "lastCompleted",m.stamp,m.visibility,m.tier,m.has_profile "hasProfile",m.blockers from marriage.launch_members m
 join auth.users u on u.id=m.member_id left join marriage.signup_phone_verifications v on v.user_id=m.member_id
 where (before_id is null or m.member_id<before_id) and (stage_value='all' or m.stage=stage_value
 or stage_value='issue_reviews' and m.review_status='pending' and m.stamp<now()-interval '24 hours'
 or stage_value='issue_purchase' and not m.store_access and exists(select 1 from marriage.launch_receipts t where t.member_id=m.member_id and not t.revoked and t.expires_at>now() and coalesce(t.renewal_status,1) not in(2,3,5))
 or stage_value in('issue_luna','issue_submission') and exists(select 1 from marriage.launch_events e where e.member_id=m.member_id and e.day=(now() at time zone 'Asia/Riyadh')::date and e.kind='fault' and e.step=case when stage_value='issue_luna' then 'compatibility' else 'review' end)
 or stage_value like 'incident:%' and exists(select 1 from marriage.launch_events e where e.member_id=m.member_id and e.kind='fault' and e.day>=(now() at time zone 'Asia/Riyadh')::date-6 and e.step=split_part(stage_value,':',2) and e.platform=split_part(stage_value,':',3) and e.build=split_part(stage_value,':',4)))
 and (stalled_hours=0 or m.stage in ('created','phone_pending','onboarding') and m.stamp<now()-make_interval(hours=>stalled_hours))
 and (q='' or m.member_id::text=q or position(lower(q) in lower(m.name))>0
 or lower(u.email)=lower(q) and u.email_confirmed_at is not null and u.raw_app_meta_data->>'emailOwnershipVerified' is distinct from 'false'
 or q=v.phone or q=u.phone and u.phone_confirmed_at is not null)
 order by m.member_id desc limit 50) page);
end $$;
create function public.marriage_admin_launch_directory(search_value text default '',stage_value text default 'all',stalled_hours integer default 0,before_id uuid default null) returns jsonb
 language sql security invoker set search_path='' as $$select marriage.admin_launch_directory($1,$2,$3,$4)$$;

create function marriage.admin_launch_analytics(date_from date,date_to date) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Riyadh')::date; t0 timestamptz:=date_from::timestamp at time zone 'Asia/Riyadh';
 t1 timestamptz:=(date_to+1)::timestamp at time zone 'Asia/Riyadh'; result jsonb;begin
 perform marriage.require_staff(array['owner']);
 if date_from is null or date_to is null or date_from>date_to or date_to>today or date_to-date_from>366 then
 raise exception 'اختر فترة صالحة لا تتجاوز سنة.' using errcode='22023';end if;
 with mem as materialized(select * from marriage.launch_members),
 events as materialized(select e.* from marriage.launch_events e join mem m using(member_id)
 where e.day between least(date_from,date_to-30) and date_to),
 activity as materialized(
 select member_id,day from events where kind='activity'
 union select requester_id,(created_at at time zone 'Asia/Riyadh')::date from marriage.member_requests where created_at>=least(t0,t1-interval '30 days') and created_at<t1
 union select sender_id,(created_at at time zone 'Asia/Riyadh')::date from marriage.thread_messages where created_at>=least(t0,t1-interval '30 days') and created_at<t1
 ),
 pairs as materialized(select r.* from marriage.member_requests r join mem a on a.member_id=r.requester_id join mem b on b.member_id=r.recipient_id),
 facts as (
 select member_id,'joined' k from mem where joined_at>=t0 and joined_at<t1
 union all select member_id,'phone_verified' from mem where phone_at>=t0 and phone_at<t1
 union all select member_id,'submitted' from mem where submitted_at>=t0 and submitted_at<t1
 union all select member_id,'approved' from mem where approved_at>=t0 and approved_at<t1
 union all select member_id,'stage_'||stage from mem
 union all select member_id,'tier_'||tier from mem where review_status='approved'
 union all select member_id,'grant' from mem where granted
 union all select m.member_id,'pilot_trial' from mem m join marriage.testing_signup_trials t using(member_id) where t.expires_at>now()
 union all select member_id,'store_access' from mem where store_access
 union all select member_id,'activity' from activity where day between date_from and date_to
 union all select member_id,'dau' from activity where day=date_to
 union all select member_id,'wau' from activity where day>=date_to-6
 union all select member_id,'mau' from activity where day>=date_to-29
 union all select member_id,kind||'_'||step from events where day>=date_from and kind<>'activity'
 union all select member_id,'error_'||step from events where day>=date_from and kind='fault'
 union all select member_id,'applicable_'||step from events where day>=date_from and kind in ('reached','resumed','completed')
 union all select member_id,'onboarding_active' from events where day>=date_from and kind in('reached','resumed','completed')
 union all select member_id,'completed_review' from mem where submitted_at>=t0 and submitted_at<t1
 union all select member_id,'applicable_review' from mem where submitted_at>=t0 and submitted_at<t1
 union all select member_id,'no_choice_trial' from events e where e.kind='offer_seen' and e.step='trial' and e.day>=date_from
 and not exists(select 1 from events a where a.member_id=e.member_id and a.step='trial' and a.day>=date_from and a.kind in('chose_free','checkout','left_offer'))
 union all select member_id,'paid_subscriber' from mem m where store_access and exists(select 1 from marriage.launch_receipts t where t.member_id=m.member_id and not t.trial and not t.revoked and effective_end>now())

 union all select member_id,'discoverable' from mem where visibility='visible' and marriage.relationship_member_allowed(member_id)
 union all select a.member_id,'zero_eligible' from mem a where a.visibility='visible' and marriage.relationship_member_allowed(a.member_id)
 and not exists(select 1 from mem b where b.visibility='visible' and b.gender<>a.gender and b.member_id<>a.member_id
 and marriage.relationship_member_allowed(b.member_id) and marriage.compatible(a.member_id,b.member_id)
 and not marriage.permanent_boundary(a.member_id,b.member_id) and (not exists(select 1 from pairs r where r.status='accepted'
 and a.member_id in (r.requester_id,r.recipient_id) and b.member_id in (r.requester_id,r.recipient_id)) or marriage.new_pair_requirements(a.member_id,b.member_id)))
 union all select m.member_id,'retention_due_'||v.day from mem m cross join (values(1),(7))v(day)
 where m.approved_at>=greatest(t0,(select started_at from marriage.launch_measurement)) and m.approved_at<t1
 and (m.approved_at at time zone 'Asia/Riyadh')::date+v.day<today
 union all select m.member_id,'retention_return_'||v.day from mem m cross join (values(1),(7))v(day)
 where m.approved_at>=greatest(t0,(select started_at from marriage.launch_measurement)) and m.approved_at<t1 and
 (m.approved_at at time zone 'Asia/Riyadh')::date+v.day<today and exists(select 1 from marriage.launch_events e
 where e.member_id=m.member_id and e.kind='activity' and e.day=(m.approved_at at time zone 'Asia/Riyadh')::date+v.day
 union all select 1 from marriage.member_requests r where r.requester_id=m.member_id and (r.created_at at time zone 'Asia/Riyadh')::date=(m.approved_at at time zone 'Asia/Riyadh')::date+v.day
 union all select 1 from marriage.thread_messages t where t.sender_id=m.member_id and (t.created_at at time zone 'Asia/Riyadh')::date=(m.approved_at at time zone 'Asia/Riyadh')::date+v.day)
 union all select member_id,'verified_trial' from marriage.launch_receipts where trial and purchased_at>=t0 and purchased_at<t1
 union all select member_id,'active_trial' from marriage.launch_receipts t where trial and expires_at>now() and not revoked and exists(select 1 from mem m where m.member_id=t.member_id and m.store_access)
 union all select member_id,'trial_converted' from marriage.launch_receipts t where not trial and not revoked and purchased_at>=t0 and purchased_at<t1 and exists(select 1 from marriage.launch_receipts b where b.original_id=t.original_id and b.trial and b.purchased_at<t.purchased_at)
 union all select member_id,'trial_expired' from marriage.launch_receipts t where trial and expires_at>=t0 and expires_at<t1 and expires_at<=now() and not exists(select 1 from marriage.launch_receipts b where b.original_id=t.original_id and not b.trial and not b.revoked and b.purchased_at>=t.purchased_at)
 union all select member_id,'renewal_off' from marriage.launch_receipts where auto_renew=false and transaction_id=status_transaction and effective_end>now()
 union all select member_id,'billing_retry' from marriage.launch_receipts where billing_retry and transaction_id=status_transaction
 union all select member_id,'revoked' from marriage.launch_receipts where revoked and signed_at>=t0 and signed_at<t1
 ), member_counts as (
 select k,m.gender,count(distinct f.member_id)::numeric n from facts f join mem m using(member_id) group by k,m.gender
 ), pair_counts as (
 select k,m.gender,count(*)::numeric n from pairs r join mem m on m.member_id=r.requester_id
 cross join lateral(values('requests',r.created_at),('accepted_cohort',case when r.analytics_accepted_at is not null or r.status='accepted' then r.created_at end),
 ('communication', (select (a.data->>'manSignedAt')::timestamptz from marriage.conversation_agreements a where a.request_id=r.id and a.data->>'womanSignedAt' is not null)))v(k,stamp)
 where v.stamp>=t0 and v.stamp<t1 group by k,m.gender
 ), special as (
 select 'slots'::text k,c.gender,case when enabled then greatest(0,capacity-count(cl.app_transaction_id)) else 0 end::numeric n
 from marriage.launch_offer_campaigns c left join marriage.launch_offer_claims cl using(gender) group by c.gender,c.capacity,c.enabled
 union all select 'sms_'||state,'unknown',sum(total) from marriage.launch_sms_daily where day between date_from and date_to group by state
 ), all_counts as (select * from member_counts union all select * from pair_counts union all select * from special),
 result_counts as (select k,jsonb_build_object('man',coalesce(sum(n)filter(where gender='man'),0),'woman',coalesce(sum(n)filter(where gender='woman'),0),
 'unknown',coalesce(sum(n)filter(where gender='unknown'),0),'total',sum(n)) value from all_counts group by k),
 first_requests as (
 select m.gender,v.k,extract(epoch from (v.stamp-m.approved_at))/3600 hours from mem m
 cross join lateral(values ('sent',(select min(created_at) from pairs where requester_id=m.member_id and created_at>=m.approved_at)),
 ('received',(select min(created_at) from pairs where recipient_id=m.member_id and created_at>=m.approved_at)))v(k,stamp)
 where v.stamp>=t0 and v.stamp<t1
 ),
 waits as (select k,coalesce(gender,'total') g,round((percentile_cont(0.5)within group(order by hours))::numeric,1) n from first_requests group by grouping sets((k,gender),(k))),
 issues as (
 select 'sms' k,coalesce(sum(total),0)::int n,min(day)::timestamp at time zone 'Asia/Riyadh' oldest,'operations' dest from marriage.launch_sms_daily where state='provider_error' and day=today
 union all select 'luna',count(distinct member_id),min(first_at),'applications' from marriage.launch_events e join mem using(member_id) where kind='fault' and e.step='compatibility' and day=today
 union all select 'submission',count(distinct member_id),min(first_at),'applications' from marriage.launch_events e join mem using(member_id) where kind='fault' and e.step='review' and day=today
 union all select 'reviews',count(*),min(stamp),'applications' from mem where review_status='pending' and stamp<now()-interval '24 hours'
 union all select 'safety',count(*),min(r.created_at),'reports' from marriage.reports r join mem m on m.member_id=r.reported_id where r.resolved_at is null
 union all select 'purchase',count(*),min(t.purchased_at),'applications' from marriage.launch_receipts t join mem m using(member_id) where not t.revoked and t.expires_at>now() and not m.store_access and coalesce(t.renewal_status,1) not in(2,3,5)
 )
 select jsonb_build_object('metrics',coalesce((select jsonb_object_agg(k,value) from result_counts),'{}'::jsonb),
 'waits',coalesce((select jsonb_object_agg(k,parts) from(select k,jsonb_object_agg(g,n)parts from waits group by k)x),'{}'::jsonb),
 'issues',(select jsonb_agg(jsonb_build_object('key',k,'n',n,'oldest',oldest,'dest',dest) order by n desc,k) from issues),
 'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by last_at desc) from (
  select e.step,e.platform,e.build,count(distinct e.member_id) affected,min(e.first_at) first_at,max(e.last_at) last_at,
   (select max(s.last_at) from marriage.launch_events s join mem using(member_id) where s.platform=e.platform and s.build=e.build
    and (s.kind='success' and s.step=e.step or e.step in ('render_error','unhandled_error','unhandled_rejection') and s.kind='activity')) last_success
   from marriage.launch_events e join mem using(member_id) where e.kind='fault' and e.day>=today-6
   group by e.step,e.platform,e.build)i),'[]'::jsonb),
 'calibration',(select jsonb_build_object('minimum',label_minimum,'regular',label_regular) from marriage.launch_measurement),
 'family',(select count(*) from marriage.family_accounts),'started',(select started_at from marriage.launch_measurement),
 'campaign',(select jsonb_object_agg(gender,enabled) from marriage.launch_offer_campaigns)) into result;
 return result;
end $$;
create function public.marriage_admin_launch_analytics(date_from date,date_to date) returns jsonb language sql security invoker set search_path='' as $$select marriage.admin_launch_analytics($1,$2)$$;

create function marriage.admin_member_signals(target uuid,days integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner']);since_time timestamptz; result jsonb;
begin
 if days is null or days not in(7,30) or not exists(select 1 from marriage.launch_members where member_id=target) then
 raise exception 'تعذّر فتح إحصاءات الحساب.' using errcode='22023';end if;
 since_time:=(((now() at time zone 'Asia/Riyadh')::date-days+1)::timestamp at time zone 'Asia/Riyadh');
 with pairs as materialized(
 select r.*,case when r.requester_id=target then r.recipient_id else r.requester_id end peer,
 a.data->>'manSignedAt' signed_at from marriage.member_requests r left join marriage.conversation_agreements a on a.request_id=r.id and a.data->>'womanSignedAt' is not null
 where target in (r.requester_id,r.recipient_id)
 and exists(select 1 from marriage.launch_members other where other.member_id=case when r.requester_id=target then r.recipient_id else r.requester_id end)),
 conversations as (
 select r.id,r.peer,count(*)filter(where m.sender_id=target and m.created_at>=since_time) sent,
 count(*)filter(where m.sender_id<>target and m.created_at>=since_time) received,min(m.created_at) started
 from pairs r join marriage.thread_messages m on m.request_id=r.id group by r.id,r.peer),
 first_contact as (
 select r.id,f.created_at received, response.created_at replied from pairs r
 cross join lateral(select sender_id,created_at from marriage.thread_messages where request_id=r.id and created_at>=r.signed_at::timestamptz order by created_at,id limit 1) f
 left join lateral(select min(created_at) created_at from marriage.thread_messages where request_id=r.id and sender_id=target and created_at>=f.created_at) response on true
 where f.sender_id=r.peer and f.created_at>=since_time and f.created_at<=now()-interval '48 hours' and r.status='accepted'
 and not exists(select 1 from marriage.blocks b where (b.member_id=target and b.blocked_id=r.peer) or (b.member_id=r.peer and b.blocked_id=target))
 ), follow as (
 select count(*) opportunities,count(*)filter(where replied<=received+interval '48 hours') replied from first_contact),
 progresses as (
 select s.request_id,s.stage from marriage.stage_choices s join pairs r on r.id=s.request_id group by s.request_id,s.stage having count(distinct s.member_id)=2 and max(s.agreed_at)>=since_time),
 family as (
 select room.request_id from marriage.family_rooms room join pairs r on r.id=room.request_id join marriage.family_room_approvals a on a.room_id=room.id
 group by room.id,room.request_id having count(distinct a.member_key)=2 and max(a.approved_at)>=since_time)
 select jsonb_build_object(
 'sent',(select count(distinct peer) from pairs where requester_id=target and created_at>=since_time),
 'received',(select count(distinct peer) from pairs where recipient_id=target and created_at>=since_time),
 'acceptedSent',(select count(distinct peer) from pairs where requester_id=target and analytics_accepted_at>=since_time),
 'acceptedReceived',(select count(distinct peer) from pairs where recipient_id=target and analytics_accepted_at>=since_time),
 'messaged',(select count(distinct peer) from conversations where sent>0),
 'sentMessages',(select coalesce(sum(sent),0) from conversations),
 'newThreads',(select count(*) from conversations where started>=since_time),
 'twoWay',(select count(*) from conversations where sent>0 and received>0),
 'perThread',(select round(avg(sent),1) from conversations where sent>0),
 'opportunities',opportunities,'replied',replied,'steps',(select count(*) from progresses),
 'family',(select count(distinct request_id) from family),
 'closed',(select count(*) from pairs where analytics_closed_by=target and closure_outcome='closed' and closed_at>=since_time),
 'level',case when label_minimum is null or label_regular is null then 'calibrating'
 when opportunities<label_minimum then 'insufficient' when replied::numeric/nullif(opportunities,0)>=label_regular then 'regular' else 'intermittent' end)
 into result from follow cross join marriage.launch_measurement;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
 values(staff.user_id,staff.display_name,staff.role,'member_signals_viewed','member',target,'Opened private follow-through statistics');
 return result;
end $$;
create function public.marriage_admin_member_signals(target uuid,days integer) returns jsonb
 language sql security invoker set search_path='' as $$select marriage.admin_member_signals($1,$2)$$;

revoke all on function marriage.launch_sms_counter(),marriage.launch_request_stamp() from public,anon,authenticated,service_role;
revoke all on function marriage.launch_note(text,text,text,text),public.marriage_launch_note(text,text,text,text),
 marriage.admin_launch_directory(text,text,integer,uuid),public.marriage_admin_launch_directory(text,text,integer,uuid),
 marriage.admin_launch_analytics(date,date),public.marriage_admin_launch_analytics(date,date),
 marriage.admin_member_signals(uuid,integer),public.marriage_admin_member_signals(uuid,integer) from public,anon,service_role;
grant execute on function marriage.launch_note(text,text,text,text),public.marriage_launch_note(text,text,text,text),
 marriage.admin_launch_directory(text,text,integer,uuid),public.marriage_admin_launch_directory(text,text,integer,uuid),
 marriage.admin_launch_analytics(date,date),public.marriage_admin_launch_analytics(date,date),
 marriage.admin_member_signals(uuid,integer),public.marriage_admin_member_signals(uuid,integer) to authenticated;

-- Only the trusted API can increment anonymous counters. Network buckets have a one-hour useful lifetime.
create table marriage.launch_network_limits(scope_key text primary key, started_at timestamptz not null, attempts int not null);
alter table marriage.launch_network_limits enable row level security;
revoke all on marriage.launch_network_limits from public,anon,authenticated,service_role;
create function public.marriage_launch_counter(kind_value text,bucket text) returns void
language plpgsql security definer set search_path='' as $$
declare n integer; begin
 if kind_value is null or kind_value not in('signup_start','provider_error') or bucket is null or bucket !~ '^[a-f0-9]{64}$' then raise exception 'invalid';end if;
 delete from marriage.launch_network_limits where started_at<now()-interval '2 hours';
 insert into marriage.launch_network_limits values(kind_value||':'||bucket,now(),1)
 on conflict(scope_key) do update set attempts=case when marriage.launch_network_limits.started_at<now()-interval '1 hour' then 1 else least(151,marriage.launch_network_limits.attempts+1) end,
 started_at=case when marriage.launch_network_limits.started_at<now()-interval '1 hour' then now() else marriage.launch_network_limits.started_at end returning attempts into n;
 if n>150 then return;end if;
 insert into marriage.launch_sms_daily values((now() at time zone 'Asia/Riyadh')::date,kind_value,1) on conflict(day,state) do update set total=marriage.launch_sms_daily.total+1;
end $$;
revoke all on function public.marriage_launch_counter(text,text) from public,anon,authenticated;
grant execute on function public.marriage_launch_counter(text,text) to service_role;

-- Activation uses only eligible observed opportunities and is reversible. No effect on access or scoring.
create function marriage.admin_follow_policy(minimum_count integer,regular_rate numeric) returns void language plpgsql security definer set search_path='' as $$
declare actor marriage.staff_accounts:=marriage.require_staff(array['owner']); observed bigint;
begin
 if minimum_count is null and regular_rate is null then
  update marriage.launch_measurement set label_minimum=null,label_regular=null;
 else
  if minimum_count is null or minimum_count not between 5 and 100 or regular_rate is null or regular_rate not between 0.1 and 1 then raise exception 'راجع الحد الأدنى ونسبة المتابعة.' using errcode='22023';end if;
  select count(*) into observed from marriage.member_requests r join marriage.conversation_agreements a on a.request_id=r.id
   join marriage.launch_members sender on sender.member_id=r.requester_id join marriage.launch_members recipient on recipient.member_id=r.recipient_id
   cross join lateral(select min(created_at) first_at from marriage.thread_messages where request_id=r.id and created_at>=(a.data->>'manSignedAt')::timestamptz) first_contact
   where r.status='accepted' and a.data->>'womanSignedAt' is not null and first_at between (select started_at from marriage.launch_measurement) and now()-interval '48 hours'
    and not exists(select 1 from marriage.blocks b where b.member_id in(r.requester_id,r.recipient_id) and b.blocked_id in(r.requester_id,r.recipient_id));
  if observed<greatest(50,minimum_count*5) then raise exception 'تحتاج المعايرة إلى مزيد من فرص الرد المرصودة.' using errcode='22023';end if;
  update marriage.launch_measurement set label_minimum=minimum_count,label_regular=regular_rate;
 end if;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason) values(actor.user_id,actor.display_name,actor.role,'follow_policy_changed','staff',actor.user_id,
 case when minimum_count is null then 'Disabled internal follow-through labels' else 'Configured internal labels: minimum '||minimum_count::text||', regular rate '||regular_rate::text end);
end $$;
create function public.marriage_admin_follow_policy(minimum_count integer,regular_rate numeric) returns void
 language sql security invoker set search_path='' as $$select marriage.admin_follow_policy($1,$2)$$;
revoke all on function marriage.admin_follow_policy(integer,numeric),public.marriage_admin_follow_policy(integer,numeric) from public,anon,authenticated,service_role;
grant execute on function marriage.admin_follow_policy(integer,numeric),public.marriage_admin_follow_policy(integer,numeric) to authenticated;
