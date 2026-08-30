-- Service-only helpers. App routes still enforce participant/cohost/admin auth.
set local lock_timeout = '5s';

create or replace function public.append_event3_support_message(
  p_request_id text, p_event_id integer, p_message text, p_actor text,
  p_participant_number integer default null, p_table_info text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if p_actor is null or p_actor not in ('user', 'host', 'cohost') or nullif(btrim(p_message), '') is null
    or length(p_message) > 2000 or p_event_id is null or p_event_id <= 0
    or (p_actor = 'user' and p_participant_number is null) then
    raise exception 'Invalid support message' using errcode = '22023';
  end if;
  update public.organizer_requests r set
    event_id = coalesce(r.event_id, p_event_id),
    chat_history = coalesce(r.chat_history::jsonb, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'from', case when p_actor = 'user' then 'user' else 'organizer' end,
      'organizer_role', case when p_actor = 'user' then null else p_actor end,
      'text', btrim(p_message), 'timestamp', clock_timestamp()
    )),
    message = case when p_actor = 'user' then btrim(p_message) else r.message end,
    organizer_reply = case when p_actor <> 'user' then btrim(p_message) else r.organizer_reply end,
    table_info = coalesce(p_table_info, r.table_info),
    status = case when p_actor = 'user' then 'pending' else 'replied' end,
    updated_at = clock_timestamp()
  where r.id = p_request_id::uuid and (r.event_id = p_event_id or r.event_id is null)
    and r.status <> 'resolved'
    and (p_participant_number is null or r.participant_number = p_participant_number)
  returning jsonb_build_object('id', r.id, 'status', r.status) into v_result;
  if v_result is null then
    raise exception 'Support request is closed or outside this event' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.send_event3_support_message(
  p_event_id integer, p_participant_number integer, p_participant_token text,
  p_participant_name text, p_table_info text, p_message text, p_request_type text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_id text; v_result jsonb; v_text text;
begin
  if p_event_id is null or p_event_id <= 0 or p_participant_number is null or p_participant_number <= 0 or nullif(p_participant_token, '') is null
    or length(coalesce(p_message, '')) > 2000 then
    raise exception 'Invalid support request' using errcode = '22023';
  end if;
  v_text := coalesce(nullif(btrim(p_message), ''), 'أحتاج مساعدة من المنظم');
  -- Serialize simultaneous first messages for the same attendee/event, too.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('event3-support:' || p_event_id || ':' || p_participant_token, 0));
  select r.id::text into v_id from public.organizer_requests r
  where r.participant_token = p_participant_token and r.participant_number = p_participant_number
    and (r.event_id = p_event_id or r.event_id is null) and r.status <> 'resolved'
  order by r.created_at desc limit 1 for update;
  if v_id is not null then
    return public.append_event3_support_message(v_id, p_event_id, v_text, 'user', p_participant_number, p_table_info);
  end if;
  insert into public.organizer_requests(event_id, participant_token, participant_number, participant_name, table_info, message, status, request_type, chat_history)
  values (p_event_id, p_participant_token, p_participant_number, p_participant_name, p_table_info, v_text, 'pending', coalesce(p_request_type, 'chat'),
    jsonb_build_array(jsonb_build_object('from', 'user', 'text', v_text, 'timestamp', clock_timestamp())))
  returning jsonb_build_object('id', id, 'status', status) into v_result;
  return v_result;
end;
$$;

revoke all on function public.append_event3_support_message(text, integer, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.send_event3_support_message(integer, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.append_event3_support_message(text, integer, text, text, integer, text) to service_role;
grant execute on function public.send_event3_support_message(integer, integer, text, text, text, text, text) to service_role;

create index if not exists organizer_requests_active_participant_event_idx
  on public.organizer_requests(participant_token, event_id, created_at desc) where status <> 'resolved';
