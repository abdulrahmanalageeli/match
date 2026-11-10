-- Isolated APNs delivery for the two authenticated private tester accounts.
create table nisfayn_test.push_preferences(actor text primary key check(actor in('abdulrahman','reham')),enabled boolean not null default false);
create table nisfayn_test.push_devices(
 installation_id uuid primary key, actor text not null check(actor in('abdulrahman','reham')),
 session_hash bytea not null references nisfayn_test.sessions(token_hash) on delete cascade,
 token text not null check(token ~ '^[0-9a-f]+$' and length(token) between 32 and 512 and length(token)%2=0),
 environment text not null check(environment in('sandbox','production')),updated_at timestamptz not null default now(),unique(token,environment));
create index test_push_session on nisfayn_test.push_devices(session_hash);
create table nisfayn_test.push_outbox(
 id uuid primary key default gen_random_uuid(),installation_id uuid not null references nisfayn_test.push_devices on delete cascade,
 actor text not null,kind text not null check(kind in('message','mutual')),event_key text not null,
 created_at timestamptz not null default now(),available_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',
 attempts integer not null default 0,lease_id uuid,lease_until timestamptz,finished_at timestamptz,outcome text,
 unique(installation_id,event_key));
create index test_push_ready on nisfayn_test.push_outbox(available_at) where finished_at is null;
alter table nisfayn_test.push_preferences enable row level security;
alter table nisfayn_test.push_devices enable row level security;
alter table nisfayn_test.push_outbox enable row level security;
revoke all on nisfayn_test.push_preferences,nisfayn_test.push_devices,nisfayn_test.push_outbox from public,anon,authenticated,service_role;

create function nisfayn_test.push(action text,session_token text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text; iid uuid; tok text; env text;
begin
 select s.actor into who from nisfayn_test.sessions s join marriage.admin_test_members m using(actor)
 where s.token_hash=sha256(session_token::bytea) and s.expires_at>now() and not m.suspended and m.review_status='approved' and m.access_until>now();
 if who is null then raise exception 'انتهت الجلسة. سجّل الدخول مجددًا.' using errcode='42501';end if;
 perform 1 from marriage.admin_test_members where actor=who for update;
 if action='push_register' then
  iid:=(payload->>'installation')::uuid;tok:=lower(payload->>'device_token');env:=payload->>'device_environment';
  if iid is null or tok is null or tok !~ '^[0-9a-f]+$' or length(tok) not between 32 and 512 or length(tok)%2<>0 or env is null or env not in('sandbox','production') then raise exception 'بيانات الجهاز غير صالحة.' using errcode='22023';end if;
  delete from nisfayn_test.push_devices d using nisfayn_test.sessions s where d.session_hash=s.token_hash and s.expires_at<=now();
  if not exists(select 1 from nisfayn_test.push_devices where installation_id=iid and actor=who) and (select count(*) from nisfayn_test.push_devices where actor=who)>=5 then raise exception 'بلغ حسابك حد الأجهزة المسجلة.';end if;
  -- Drop prior account queues when an installation changes accounts or rotates its token.
  delete from nisfayn_test.push_devices where (installation_id=iid or (token=tok and environment=env))
    and (actor<>who or token<>tok or environment<>env or installation_id<>iid);
  delete from marriage.push_devices where installation_id=iid or (token=tok and environment=env);
  insert into nisfayn_test.push_devices values(iid,who,sha256(session_token::bytea),tok,env,now())
   on conflict(installation_id) do update set session_hash=excluded.session_hash,updated_at=now();
 elsif action='push_enable' then
  if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'إعداد غير صالح.';end if;
  insert into nisfayn_test.push_preferences values(who,(payload->>'enabled')::boolean)
   on conflict(actor) do update set enabled=excluded.enabled;
  if not (payload->>'enabled')::boolean then update nisfayn_test.push_outbox set finished_at=now(),outcome='revoked' where actor=who and finished_at is null;end if;
 elsif action='push_unregister' then
  delete from nisfayn_test.push_devices where installation_id=(payload->>'installation')::uuid and actor=who;
 elsif action<>'push_settings' then raise exception 'Invalid push action';end if;
 return jsonb_build_object('enabled',coalesce((select enabled from nisfayn_test.push_preferences where actor=who),false));
end $$;
create function public.nisfayn_test_push(action text,session_token text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select nisfayn_test.push($1,$2,$3)$$;

-- Signing into a regular member account on the same phone invalidates tester routing.
create function nisfayn_test.detach_member_device() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from nisfayn_test.push_devices where installation_id=new.installation_id or (token=new.token and environment=new.environment);return new;end $$;
create trigger detach_test_push before insert or update on marriage.push_devices for each row execute function nisfayn_test.detach_member_device();

create function nisfayn_test.enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not coalesce((new.data->>'matched')::boolean,false) then return new;end if;
 if new.data->'messages' is distinct from old.data->'messages' then
  insert into nisfayn_test.push_outbox(installation_id,actor,kind,event_key)
  select d.installation_id,d.actor,'message',m->>'id' from jsonb_array_elements(new.data->'messages') m
  join nisfayn_test.push_devices d on d.actor<>m->>'sender'
  join nisfayn_test.push_preferences p on p.actor=d.actor and p.enabled
  where m->>'sender' in('abdulrahman','reham') and m->>'deletedAt' is null
   and not exists(select 1 from jsonb_array_elements(old.data->'messages') prev where prev->>'id'=m->>'id')
  on conflict(installation_id,event_key) do nothing;
 end if;
 if not coalesce((old.data->>'matched')::boolean,false) then
  insert into nisfayn_test.push_outbox(installation_id,actor,kind,event_key)
  select d.installation_id,d.actor,'mutual','mutual:'||gen_random_uuid() from nisfayn_test.push_devices d
  join nisfayn_test.push_preferences p on p.actor=d.actor and p.enabled;
 end if;
 return new;
end $$;
create trigger tester_push_events after update of data on nisfayn_test.room for each row execute function nisfayn_test.enqueue_push();

create function nisfayn_test.push_allowed(job nisfayn_test.push_outbox) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from nisfayn_test.push_devices d
 join nisfayn_test.sessions s on s.token_hash=d.session_hash and s.actor=d.actor and s.expires_at>now()
 join nisfayn_test.push_preferences p on p.actor=d.actor and p.enabled
 cross join nisfayn_test.room r
 where d.installation_id=job.installation_id and d.actor=job.actor and (r.data->>'matched')::boolean
 and (select count(*) from marriage.admin_test_members where actor in('abdulrahman','reham') and not suspended and not paused and review_status='approved' and access_until>now())=2
 and (job.kind='mutual' or exists(select 1 from jsonb_array_elements(r.data->'messages') m
   where m->>'id'=job.event_key and m->>'sender'<>job.actor and m->>'deletedAt' is null
   and not exists(select 1 from nisfayn_test.message_deletions x where x.id::text=m->>'id')
   and (m->>'createdAt')::timestamptz>coalesce((r.data#>>array['read',job.actor])::timestamptz,'-infinity'))))
$$;
create function nisfayn_test.push_claim(delivery_environment text,batch_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare results jsonb;
begin
 if batch_size is null or batch_size not between 1 and 20 or delivery_environment is null or delivery_environment not in('sandbox','production') then raise exception 'Invalid batch';end if;
 delete from nisfayn_test.push_outbox where finished_at<now()-interval '7 days';
 update nisfayn_test.push_outbox o set finished_at=now(),outcome=case when expires_at<=now() then 'expired' else 'revoked' end
 where finished_at is null and (expires_at<=now() or not nisfayn_test.push_allowed(o));
 with selected as (select o.id from nisfayn_test.push_outbox o join nisfayn_test.push_devices d using(installation_id)
  where o.finished_at is null and o.available_at<=now() and d.environment=delivery_environment and (lease_until is null or lease_until<now()) and attempts<5
  order by o.created_at for update of o skip locked limit batch_size),
 claimed as(update nisfayn_test.push_outbox o set lease_id=gen_random_uuid(),lease_until=now()+interval '120 seconds',attempts=attempts+1 from selected s where o.id=s.id returning o.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'leaseId',c.lease_id,'requestId','00000000-0000-4000-8000-000000000001','kind',c.kind,'token',d.token,'environment',d.environment,'expiresAt',c.expires_at)),'[]') into results
 from claimed c join nisfayn_test.push_devices d using(installation_id);
 return results;
end $$;
create function nisfayn_test.push_validate(job_id uuid,lease uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select finished_at is null and lease_id=$2 and lease_until>now() and expires_at>now() and nisfayn_test.push_allowed(o) from nisfayn_test.push_outbox o where id=$1),false)
$$;
create function nisfayn_test.push_finish(job_id uuid,lease uuid,result text,device_token text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare job nisfayn_test.push_outbox;
begin
 if result is null or result not in('sent','invalid','retry','failed','revoked') then raise exception 'Invalid result';end if;
 select * into job from nisfayn_test.push_outbox where id=$1 and lease_id=$2 and lease_until>now() and finished_at is null for update;
 if not found then return false;end if;
 if result='invalid' then delete from nisfayn_test.push_devices where installation_id=job.installation_id and actor=job.actor and token=$4;end if;
 update nisfayn_test.push_outbox set finished_at=case when result='retry' and attempts<5 then null else now() end,
 outcome=case when result='retry' then case when attempts>=5 then 'failed' else null end else result end,
 available_at=now()+make_interval(secs=>least(900,15*(2^attempts)::integer)),lease_id=null,lease_until=null where id=$1;
 return true;
end $$;
create function public.nisfayn_test_push_claim(delivery_environment text,batch_size integer) returns jsonb language sql security invoker set search_path='' as $$select nisfayn_test.push_claim($1,$2)$$;
create function public.nisfayn_test_push_validate(job_id uuid,lease uuid) returns boolean language sql stable security invoker set search_path='' as $$select nisfayn_test.push_validate($1,$2)$$;
create function public.nisfayn_test_push_finish(job_id uuid,lease uuid,result text,device_token text default null) returns boolean language sql security invoker set search_path='' as $$select nisfayn_test.push_finish($1,$2,$3,$4)$$;
revoke all on function nisfayn_test.push(text,text,jsonb),public.nisfayn_test_push(text,text,jsonb),nisfayn_test.detach_member_device(),nisfayn_test.enqueue_push(),nisfayn_test.push_allowed(nisfayn_test.push_outbox),nisfayn_test.push_claim(text,integer),nisfayn_test.push_validate(uuid,uuid),nisfayn_test.push_finish(uuid,uuid,text,text),public.nisfayn_test_push_claim(text,integer),public.nisfayn_test_push_validate(uuid,uuid),public.nisfayn_test_push_finish(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant usage on schema nisfayn_test to service_role;
grant execute on function nisfayn_test.push(text,text,jsonb),public.nisfayn_test_push(text,text,jsonb),nisfayn_test.push_claim(text,integer),nisfayn_test.push_validate(uuid,uuid),nisfayn_test.push_finish(uuid,uuid,text,text),public.nisfayn_test_push_claim(text,integer),public.nisfayn_test_push_validate(uuid,uuid),public.nisfayn_test_push_finish(uuid,uuid,text,text) to service_role;
