-- Rate counters only: no prompts, generated answers or chat transcripts are
-- stored by the AI service. Expired counters are removed after seven days.
create schema nisfayn_ai;
revoke all on schema nisfayn_ai from public,anon,authenticated,service_role;
grant usage on schema nisfayn_ai to anon,authenticated;
create table marriage.ai_usage (
 id uuid primary key default gen_random_uuid(),
 owner_key text not null,
 feature text not null check(feature in('opener','demo_reply')),
 created_at timestamptz not null default now()
);
create index ai_usage_owner_recent on marriage.ai_usage(owner_key,created_at);
create index ai_usage_recent on marriage.ai_usage(created_at);
alter table marriage.ai_usage enable row level security;
revoke all on marriage.ai_usage from public,anon,authenticated,service_role;

-- Identity is always derived here from a verified JWT + live Auth session, or
-- the existing tester session token. A caller cannot choose another owner.
create function nisfayn_ai.allow_request(test_token text,feature text,reserve boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner text; actor_name text; me uuid; today timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; per_day int;
begin
 if feature is null or feature not in('opener','demo_reply') or reserve is null then
  raise exception 'Invalid AI request' using errcode='22023';
 end if;
 if coalesce(test_token,'')<>'' then
  if test_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid session' using errcode='42501';end if;
  select s.actor into actor_name from nisfayn_test.sessions s
   join marriage.admin_test_members m on m.actor=s.actor
   where s.token_hash=sha256(test_token::bytea) and s.expires_at>now()
   and m.review_status='approved' and not m.suspended and not m.paused and m.access_until>now();
  if actor_name is null then raise exception 'Invalid session' using errcode='42501';end if;
  owner:='tester:'||actor_name;per_day:=80;
 else
  me:=marriage.require_member();
  if feature='demo_reply' or not exists(select 1 from marriage.members m where m.id=me
   and m.review_status='approved' and not m.suspended and not m.paused) then
   raise exception 'Invalid session' using errcode='42501';
  end if;
  owner:='member:'||me::text;per_day:=20;
 end if;
 if not reserve then return jsonb_build_object('owner',encode(sha256(owner::bytea),'hex'));end if;
 -- Serialize this short transaction to enforce the global spend ceiling even
 -- when multiple Vercel instances reserve at once.
 perform pg_advisory_xact_lock(723906711);
 delete from marriage.ai_usage where created_at<now()-interval '7 days';
 if (select count(*) from marriage.ai_usage r where r.owner_key=owner and r.created_at>=today)>=per_day
  or (select count(*) from marriage.ai_usage r where r.owner_key=owner and r.created_at>now()-interval '1 minute')>=6
  or (select count(*) from marriage.ai_usage r where r.created_at>=today)>=300 then
  return jsonb_build_object('status','limited');
 end if;
 insert into marriage.ai_usage(owner_key,feature) values(owner,feature);
 return jsonb_build_object('status','allowed');
end $$;
create function public.nisfayn_ai_allow(test_token text default '',feature text default null,reserve boolean default false) returns jsonb
language sql set search_path='' as $$ select nisfayn_ai.allow_request(test_token,feature,reserve) $$;
revoke all on function nisfayn_ai.allow_request(text,text,boolean),public.nisfayn_ai_allow(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function nisfayn_ai.allow_request(text,text,boolean),public.nisfayn_ai_allow(text,text,boolean) to anon,authenticated;
