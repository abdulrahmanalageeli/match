-- Extend the existing opt-in, session-bound private outbox for Web Push.
-- Browser endpoints and encryption keys never enter public profile APIs.
alter table marriage.push_devices add column web_subscription jsonb;
alter table marriage.push_devices drop constraint push_devices_environment_check;
alter table marriage.push_devices add constraint push_devices_environment_check check(environment in ('sandbox','production','web'));
alter table marriage.push_devices add constraint push_devices_web_subscription_check check(environment <> 'web' or web_subscription is not null);
create unique index push_devices_web_endpoint on marriage.push_devices ((web_subscription->>'endpoint')) where environment='web';

create function marriage.web_push_register(subscription jsonb,installation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
 endpoint text:=$1->>'endpoint'; p256dh text:=$1->'keys'->>'p256dh'; auth_key text:=$1->'keys'->>'auth'; normalized jsonb;
begin
 if installation is null or jsonb_typeof($1) is distinct from 'object'
  or endpoint is null or length(endpoint)>2048
  or endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]#]+$'
  or p256dh is null or p256dh !~ '^[A-Za-z0-9_-]{87}$'
  or auth_key is null or auth_key !~ '^[A-Za-z0-9_-]{22}$' then
  raise exception 'تعذّر تسجيل إشعارات هذا المتصفح.' using errcode='22023';
 end if;
 normalized:=jsonb_build_object('endpoint',endpoint,'keys',jsonb_build_object('p256dh',p256dh,'auth',auth_key));
 perform 1 from marriage.members where id=me for update;
 if not exists(select 1 from marriage.push_devices where installation_id=installation and member_id=me)
    and (select count(*) from marriage.push_devices where member_id=me)>=5 then
  raise exception 'بلغ حسابك حد الأجهزة المسجلة.' using errcode='22023';
 end if;
 -- One browser subscription belongs to one active account, including account switches.
 delete from marriage.push_devices where environment='web' and web_subscription->>'endpoint'=endpoint and installation_id<>installation;
 insert into marriage.push_devices(installation_id,member_id,session_id,token,environment,updated_at,web_subscription)
 values(installation,me,sid,md5(normalized::text),'web',now(),normalized)
 on conflict(installation_id) do update set member_id=excluded.member_id,session_id=excluded.session_id,
  token=excluded.token,environment=excluded.environment,updated_at=now(),web_subscription=excluded.web_subscription;
 return marriage.push_settings();
end $$;

create or replace function marriage.push_allowed(job marriage.push_outbox) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.push_devices d
 join auth.sessions s on s.id=d.session_id and s.user_id=d.member_id
 join marriage.push_preferences p on p.member_id=d.member_id and p.enabled
 join marriage.member_requests r on r.id=job.request_id
 where d.installation_id=job.installation_id and d.member_id=job.member_id
 and (s.not_after is null or s.not_after>now())
 and job.member_id in(r.requester_id,r.recipient_id)
 and marriage.is_paid(r.requester_id) and marriage.is_paid(r.recipient_id)
 and marriage.compatible(r.requester_id,r.recipient_id)
 and case when job.kind='request' then r.status='pending' and r.recipient_id=job.member_id and r.created_at>now()-interval '7 days'
          else r.status='accepted' end
 -- A minute-delayed worker must not announce a message already read or deleted.
 and (job.kind<>'message' or exists(select 1 from marriage.thread_messages m
  left join marriage.thread_read_positions seen on seen.request_id=m.request_id and seen.reader_id=job.member_id
  where m.request_id=job.request_id and job.event_key='message:'||m.id::text and m.sender_id<>job.member_id and m.deleted_at is null
   and (m.created_at,m.id)>(coalesce(seen.through_created_at,'-infinity'::timestamptz),coalesce(seen.through_id,'00000000-0000-0000-0000-000000000000'::uuid)))))
$$;

create or replace function marriage.push_claim(delivery_environment text,batch_size integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare results jsonb;
begin
 if batch_size not between 1 and 50 or batch_size is null or delivery_environment not in('sandbox','production','web') or delivery_environment is null then raise exception 'Invalid batch'; end if;
 delete from marriage.push_outbox where finished_at<now()-interval '7 days';
 update marriage.push_outbox o set finished_at=now(),outcome=case when o.expires_at<=now() then 'expired' else 'revoked' end
 where o.finished_at is null and (o.expires_at<=now() or not marriage.push_allowed(o));
 with selected as (select o.id from marriage.push_outbox o join marriage.push_devices d using(installation_id)
   where o.finished_at is null and o.available_at<=now() and d.environment=delivery_environment
   and (o.lease_until is null or o.lease_until<now()) and o.attempts<5
   order by o.created_at for update of o skip locked limit batch_size),
 claimed as (update marriage.push_outbox o set lease_id=gen_random_uuid(),lease_until=now()+interval '120 seconds',attempts=o.attempts+1
   from selected s where o.id=s.id returning o.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'leaseId',c.lease_id,'requestId',c.request_id,'kind',c.kind,
   'token',d.token,'environment',d.environment,'expiresAt',c.expires_at)
   ||case when d.environment='web' then jsonb_build_object('subscription',d.web_subscription) else '{}'::jsonb end),'[]'::jsonb) into results
 from claimed c join marriage.push_devices d using(installation_id);
 return results;
end $$;

create function public.marriage_web_push_register(subscription jsonb,installation uuid) returns jsonb
language sql security invoker set search_path='' as $$ select marriage.web_push_register($1,$2) $$;
revoke all on function marriage.web_push_register(jsonb,uuid),public.marriage_web_push_register(jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.web_push_register(jsonb,uuid),public.marriage_web_push_register(jsonb,uuid) to authenticated;
-- Existing RLS, session revocation, eligibility rechecks, retries, opt-out and
-- service-role-only claim/validate/finish permissions apply to both transports.
