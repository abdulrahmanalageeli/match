-- Calls keep their own lifecycle. Their history must never become a text
-- message, a read cursor, a search result, or an admissible reply target.
create index voice_calls_missed_timeline
 on marriage.voice_calls(request_id, created_at desc, id desc)
 where end_reason = 'missed';

create view marriage.chat_timeline_keys with (security_invoker = true) as
 select request_id, id, created_at, sender_id, false as missed_call
 from marriage.thread_messages
 union all
 select request_id, id, created_at, caller_id, true
 from marriage.voice_calls where end_reason = 'missed';
revoke all on marriage.chat_timeline_keys from public, anon, authenticated, service_role;

create function marriage.chat_timeline(request_id uuid, before_id uuid, wanted_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 viewer uuid;
 boundary timestamptz;
begin
 perform marriage.chat_peer(request_id);
 viewer := auth.uid();
 if cardinality(wanted_ids) > 100 then
  raise exception 'حدّث الرسائل على دفعات أصغر.' using errcode = '22023';
 end if;
 -- The existing call state machine finalizes timeouts even when both devices
 -- were offline. Its reason distinguishes a missed call from a revoked call.
 if exists (select 1 from marriage.voice_calls c where c.request_id = $1
            and c.status = 'ringing' and c.ringing_until <= now()) then
  perform marriage.voice_refresh(viewer);
 end if;
 if before_id is not null then
  select k.created_at into boundary from marriage.chat_timeline_keys k
  where k.request_id = $1 and k.id = $2;
  if not found then return '[]'::jsonb; end if;
 end if;
 return (
  select coalesce(jsonb_agg(
   case when page.missed_call then jsonb_build_object(
    'id', page.id, 'createdAt', page.created_at, 'senderIsMe', page.sender_id = viewer,
    'body', '', 'missedCall', true)
   else marriage.chat_message_json(m, viewer) end
   order by page.created_at, page.id), '[]'::jsonb)
  from (
   select k.* from marriage.chat_timeline_keys k
   where k.request_id = $1
    and ($2 is null or (k.created_at, k.id) < (boundary, $2))
    and ($3 is null or k.id = any($3))
   order by k.created_at desc, k.id desc
   limit case when $3 is null then 50 else 100 end
  ) page
  left join marriage.thread_messages m on not page.missed_call and m.id = page.id
 );
end $$;

create function public.marriage_chat_timeline(request_id uuid, before_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
 select marriage.chat_timeline($1, $2, null)
$$;
create function public.marriage_chat_timeline_changes(request_id uuid, message_ids uuid[])
returns jsonb language sql security invoker set search_path = '' as $$
 select marriage.chat_timeline($1, null, coalesce($2, '{}'::uuid[]))
$$;
revoke all on function marriage.chat_timeline(uuid,uuid,uuid[]),
 public.marriage_chat_timeline(uuid,uuid), public.marriage_chat_timeline_changes(uuid,uuid[])
 from public, anon, authenticated, service_role;
grant execute on function marriage.chat_timeline(uuid,uuid,uuid[]),
 public.marriage_chat_timeline(uuid,uuid), public.marriage_chat_timeline_changes(uuid,uuid[])
 to authenticated;

-- The isolated tester room replaces its single call object at each new dial.
-- Retain missed events for this match only; closure/rematch starts a fresh log.
create table nisfayn_test.missed_calls (
 id uuid primary key, created_at timestamptz not null,
 caller text not null check (caller in ('abdulrahman','reham'))
);
alter table nisfayn_test.missed_calls enable row level security;
revoke all on nisfayn_test.missed_calls from public, anon, authenticated, service_role;

create function nisfayn_test.remember_missed_call()
returns trigger language plpgsql set search_path = '' as $$
declare
 prev jsonb := old.data->'call';
 curr jsonb := new.data->'call';
 missed jsonb;
begin
 if new.data->>'matched' is distinct from 'true' or old.data->>'matched' is distinct from 'true' then
  delete from nisfayn_test.missed_calls;
  return new;
 end if;
 if curr->>'endReason' = 'missed' then
  missed := curr;
 elsif prev->>'id' is distinct from curr->>'id' and prev->>'status' = 'ringing'
  and (prev->>'ringingUntil')::timestamptz <= now() then
  -- Starting the next call can expire and replace the prior call in one write.
  missed := prev;
 end if;
 if missed is not null then
  insert into nisfayn_test.missed_calls(id, created_at, caller)
  values ((missed->>'id')::uuid, (missed->>'createdAt')::timestamptz, missed->>'caller')
  on conflict (id) do nothing;
 end if;
 return new;
end $$;
revoke all on function nisfayn_test.remember_missed_call() from public, anon, authenticated, service_role;
create trigger track_missed_call after update of data on nisfayn_test.room
 for each row when ((old.data->'call') is distinct from (new.data->'call')
  or (old.data->'matched') is distinct from (new.data->'matched'))
 execute function nisfayn_test.remember_missed_call();
insert into nisfayn_test.missed_calls(id,created_at,caller)
 select (data#>>'{call,id}')::uuid, (data#>>'{call,createdAt}')::timestamptz, data#>>'{call,caller}'
 from nisfayn_test.room where data->>'matched' = 'true' and data#>>'{call,endReason}' = 'missed'
 and (data->>'matchedAt' is null or (data#>>'{call,createdAt}')::timestamptz >= (data->>'matchedAt')::timestamptz);

alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_missed_calls;
create function public.nisfayn_test_rpc(action text, session_token text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 result := nisfayn_test.rpc_before_missed_calls($1,$2,$3);
 if result ? 'messages' and result->>'matched' = 'true' and exists (
  select 1 from marriage.admin_test_members p where p.actor <> result->>'actor'
   and not p.paused and not p.suspended and p.review_status = 'approved' and p.access_until > now()
 ) then
  result := result || jsonb_build_object('missedCalls', (
   select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'createdAt',h.created_at,'caller',h.caller)
    order by h.created_at,h.id), '[]'::jsonb)
   from nisfayn_test.missed_calls h));
 end if;
 return result;
end $$;
revoke all on function nisfayn_test.rpc_before_missed_calls(text,text,jsonb), public.nisfayn_test_rpc(text,text,jsonb)
 from public, anon, authenticated, service_role;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
