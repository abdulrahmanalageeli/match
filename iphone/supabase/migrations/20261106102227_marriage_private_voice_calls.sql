-- Foreground, mutually accepted voice calls. No Agora credentials live in SQL.
-- Only checked RPCs expose state; member locks serialize competing call starts.
create table marriage.voice_calls (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references marriage.member_requests(id) on delete cascade,
 caller_id uuid not null references marriage.members(id) on delete cascade,
 callee_id uuid not null references marriage.members(id) on delete cascade,
 client_id uuid not null,
 status text not null default 'ringing' check(status in('ringing','active','ended')),
 created_at timestamptz not null default now(),
 ringing_until timestamptz not null default now()+interval '45 seconds',
 accepted_at timestamptz,
 active_until timestamptz,
 ended_at timestamptz,
 end_reason text check(end_reason in('declined','cancelled','ended','missed','expired','unavailable')),
 unique(caller_id,client_id),
 check(caller_id<>callee_id),
 check((status='ended')=(ended_at is not null and end_reason is not null)),
 check(status<>'active' or (accepted_at is not null and active_until is not null))
);
create index voice_calls_caller_created on marriage.voice_calls(caller_id,created_at desc);
create index voice_calls_callee_created on marriage.voice_calls(callee_id,created_at desc);
create index voice_calls_request on marriage.voice_calls(request_id);
create table marriage.voice_call_participants (
 call_id uuid not null references marriage.voice_calls(id) on delete cascade,
 member_id uuid not null references marriage.members(id) on delete cascade,
 rtc_uid integer not null check(rtc_uid in(1,2)),
 lease_until timestamptz not null,
 token_window_at timestamptz not null default now(),
 token_count integer not null default 0 check(token_count>=0),
 primary key(call_id,member_id), unique(call_id,rtc_uid)
);
create index voice_call_participants_member on marriage.voice_call_participants(member_id);
alter table marriage.voice_calls enable row level security;
alter table marriage.voice_call_participants enable row level security;
revoke all on marriage.voice_calls,marriage.voice_call_participants from public,anon,authenticated,service_role;

create function marriage.voice_allowed(request uuid,a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.member_requests r where r.id=request and r.status='accepted'
 and ((r.requester_id=a and r.recipient_id=b) or (r.requester_id=b and r.recipient_id=a)))
 and marriage.is_paid(a) and marriage.is_paid(b) and marriage.compatible(a,b)
$$;

create function marriage.voice_refresh(target uuid) returns void language plpgsql set search_path='' as $$
begin
 update marriage.voice_calls c set status='ended',ended_at=now(),end_reason=case
  when not marriage.voice_allowed(c.request_id,c.caller_id,c.callee_id) then 'unavailable'
  when c.status='ringing' then 'missed' else 'expired' end
 where target in(c.caller_id,c.callee_id) and c.status in('ringing','active') and (
  not marriage.voice_allowed(c.request_id,c.caller_id,c.callee_id)
  or (c.status='ringing' and c.ringing_until<=now())
  or (c.status='active' and (c.active_until<=now() or exists(
   select 1 from marriage.voice_call_participants p where p.call_id=c.id and p.lease_until<=now()))));
end $$;

create function marriage.voice_json(call marriage.voice_calls,viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',call.id,'requestId',call.request_id,'status',call.status,
  'direction',case when call.caller_id=viewer then 'outgoing' else 'incoming' end,
  'createdAt',call.created_at,'ringingUntil',call.ringing_until,'acceptedAt',call.accepted_at,
  'endedAt',call.ended_at,'endReason',call.end_reason,'person',case
   when marriage.voice_allowed(call.request_id,call.caller_id,call.callee_id)
   then marriage.member_card(viewer,case when call.caller_id=viewer then call.callee_id else call.caller_id end)
   else null end)
 where viewer in(call.caller_id,call.callee_id)
$$;

create function marriage.call_start(request_id uuid,client_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid; c marriage.voice_calls;
begin
 if request_id is null or client_id is null then raise exception 'طلب المكالمة غير صالح.' using errcode='22023'; end if;
 select case when r.requester_id=me then r.recipient_id else r.requester_id end into peer
 from marriage.member_requests r where r.id=request_id and me in(r.requester_id,r.recipient_id);
 if peer is null then raise exception 'المحادثة غير متاحة.' using errcode='42501'; end if;
 perform marriage.lock_member_pair(me,peer);
 if not marriage.voice_allowed(request_id,me,peer) then raise exception 'المحادثة غير متاحة.' using errcode='42501'; end if;
 perform marriage.voice_refresh(me); perform marriage.voice_refresh(peer);
 select * into c from marriage.voice_calls v where v.caller_id=me and v.client_id=call_start.client_id;
 if found then
  if c.request_id<>request_id then raise exception 'طلب المكالمة غير صالح.' using errcode='22023'; end if;
  return marriage.voice_json(c,me);
 end if;
 if exists(select 1 from marriage.voice_calls v where v.status in('ringing','active')
  and (me in(v.caller_id,v.callee_id) or peer in(v.caller_id,v.callee_id))) then
  raise exception 'أحد الطرفين في مكالمة أخرى.' using errcode='P0001';
 end if;
 if (select count(*) from marriage.voice_calls v where v.caller_id=me and v.created_at>now()-interval '5 minutes')>=3
 or (select count(*) from marriage.voice_calls v where v.caller_id=me and v.created_at>now()-interval '1 hour')>=10 then
  raise exception 'انتظر قليلًا قبل الاتصال مجددًا.' using errcode='P0001';
 end if;
 insert into marriage.voice_calls(request_id,caller_id,callee_id,client_id)
 values(request_id,me,peer,client_id) returning * into c;
 insert into marriage.voice_call_participants(call_id,member_id,rtc_uid,lease_until)
 values(c.id,me,1,c.ringing_until),(c.id,peer,2,c.ringing_until);
 return marriage.voice_json(c,me);
end $$;

create function marriage.call_state(call_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); c marriage.voice_calls;
begin
 if call_id is not null and not exists(select 1 from marriage.voice_calls v
  where v.id=call_id and me in(v.caller_id,v.callee_id)) then
  raise exception 'المكالمة غير متاحة.' using errcode='42501';
 end if;
 perform marriage.voice_refresh(me);
 select * into c from marriage.voice_calls v where me in(v.caller_id,v.callee_id)
 and (case when call_id is not null then v.id=call_id else v.status<>'ended' or v.ended_at>now()-interval '5 minutes' end)
 order by (v.status<>'ended') desc,v.created_at desc limit 1;
 if not found then return null; end if;
 return marriage.voice_json(c,me);
end $$;

create function marriage.call_act(call_id uuid,action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); c marriage.voice_calls;
begin
 if action is null or action not in('accept','decline','end') then
  raise exception 'إجراء غير صالح.' using errcode='22023';
 end if;
 select * into c from marriage.voice_calls v where v.id=call_id and me in(v.caller_id,v.callee_id);
 if not found then raise exception 'المكالمة غير متاحة.' using errcode='42501'; end if;
 perform marriage.lock_member_pair(c.caller_id,c.callee_id);
 perform marriage.voice_refresh(me);
 select * into c from marriage.voice_calls v where v.id=call_id for update;
 if c.status='ended' then return marriage.voice_json(c,me); end if;
 if action in('accept','decline') and me<>c.callee_id then
  raise exception 'لا يمكنك قبول مكالمتك بنفسك.' using errcode='42501';
 end if;
 if action='accept' then
  if c.status='active' then return marriage.voice_json(c,me); end if;
  -- Refresh above has already rechecked both memberships, blocks and account status.
  update marriage.voice_calls v set status='active',accepted_at=now(),active_until=now()+interval '2 hours'
  where v.id=call_id returning * into c;
  update marriage.voice_call_participants p set lease_until=now()+interval '3 minutes' where p.call_id=call_act.call_id;
 elsif action='decline' and c.status='active' then
  raise exception 'المكالمة بدأت بالفعل.' using errcode='22023';
 else
  update marriage.voice_calls v set status='ended',ended_at=now(),end_reason=case
   when c.status='active' then 'ended' when me=c.caller_id then 'cancelled' else 'declined' end
  where v.id=call_id returning * into c;
 end if;
 return marriage.voice_json(c,me);
end $$;

create function marriage.call_token_grant(call_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); c marriage.voice_calls; p marriage.voice_call_participants;
 ttl integer; deadline timestamptz;
begin
 select * into c from marriage.voice_calls v where v.id=call_id and me in(v.caller_id,v.callee_id);
 if not found then raise exception 'المكالمة غير متاحة.' using errcode='42501'; end if;
 perform marriage.lock_member_pair(c.caller_id,c.callee_id);
 perform marriage.voice_refresh(me);
 select * into c from marriage.voice_calls v where v.id=call_id for update;
 -- Return null so expiration/revocation commits rather than rolling back on error.
 if c.status<>'active' then return null; end if;
 select * into p from marriage.voice_call_participants v where v.call_id=call_token_grant.call_id and v.member_id=me for update;
 if not found then return null; end if;
 if p.token_window_at>now()-interval '1 minute' and p.token_count>=6 then
  raise exception 'انتظر قليلًا قبل إعادة المحاولة.' using errcode='P0001';
 end if;
 ttl:=least(120,floor(extract(epoch from(c.active_until-now())))::integer);
 if ttl<1 then return null; end if;
 deadline:=date_trunc('second',now())+make_interval(secs=>ttl);
 update marriage.voice_call_participants v set lease_until=least(now()+interval '3 minutes',c.active_until),
  token_count=case when p.token_window_at>now()-interval '1 minute' then p.token_count+1 else 1 end,
  token_window_at=case when p.token_window_at>now()-interval '1 minute' then p.token_window_at else now() end
 where v.call_id=call_token_grant.call_id and v.member_id=me;
 return jsonb_build_object('callId',c.id,'channel','n_'||replace(c.id::text,'-',''),
  'uid',p.rtc_uid,'ttlSeconds',ttl,'expiresAt',deadline);
end $$;

create function marriage.signal_voice_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or old.status is distinct from new.status then
  begin
   perform realtime.send('{}'::jsonb,'changed','marriage:member:'||new.caller_id::text,true);
   perform realtime.send('{}'::jsonb,'changed','marriage:member:'||new.callee_id::text,true);
  exception when others then raise log 'Voice invalidation unavailable (%)',sqlstate;
  end;
 end if;
 return new;
end $$;
create trigger voice_changed after insert or update of status on marriage.voice_calls
for each row execute function marriage.signal_voice_change();

create function marriage.close_request_calls() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'accepted' then
  update marriage.voice_calls set status='ended',ended_at=now(),end_reason='unavailable'
  where request_id=new.id and status in('ringing','active');
 end if;
 return new;
end $$;
create trigger request_voice_closed after update of status on marriage.member_requests
for each row when(old.status is distinct from new.status) execute function marriage.close_request_calls();

create function public.marriage_call_start(request_id uuid,client_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select marriage.call_start(request_id,client_id) $$;
create function public.marriage_call_state(call_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select marriage.call_state(call_id) $$;
create function public.marriage_call_act(call_id uuid,action text) returns jsonb
language sql security invoker set search_path='' as $$ select marriage.call_act(call_id,action) $$;
create function public.marriage_call_token_grant(call_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select marriage.call_token_grant(call_id) $$;

revoke all on function marriage.voice_allowed(uuid,uuid,uuid),marriage.voice_refresh(uuid),
 marriage.voice_json(marriage.voice_calls,uuid),marriage.signal_voice_change(),marriage.close_request_calls(),
 marriage.call_start(uuid,uuid),marriage.call_state(uuid),marriage.call_act(uuid,text),marriage.call_token_grant(uuid),
 public.marriage_call_start(uuid,uuid),public.marriage_call_state(uuid),public.marriage_call_act(uuid,text),public.marriage_call_token_grant(uuid)
 from public,anon,authenticated,service_role;
grant execute on function marriage.call_start(uuid,uuid),marriage.call_state(uuid),marriage.call_act(uuid,text),marriage.call_token_grant(uuid),
 public.marriage_call_start(uuid,uuid),public.marriage_call_state(uuid),public.marriage_call_act(uuid,text),public.marriage_call_token_grant(uuid)
 to authenticated;
