-- A refresh may race a closed connection. Return only the alert fields still
-- authorized by the same member/session and relationship checks as the chat.
create function public.marriage_alert_progress(request_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  request_key uuid;
  summary jsonb;
  result jsonb := '{}';
begin
  if cardinality(request_ids) > 24 then
    raise exception 'عدد طلبات التعارف أكبر من المسموح.' using errcode = '22023';
  end if;
  for request_key in select distinct id from unnest(request_ids) as requested(id) where id is not null loop
    begin
      select jsonb_object_agg(key, value) into summary
      from jsonb_each(public.marriage_progress(request_key))
      where key in ('stage', 'mine', 'peer', 'exclusive', 'consentMine', 'consentPeer', 'rewindPeer', 'updatedAt');
      result := result || jsonb_build_object(request_key, summary);
    exception when insufficient_privilege then
      continue;
    end;
  end loop;
  return result;
end;
$$;
revoke all on function public.marriage_alert_progress(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.marriage_alert_progress(uuid[]) to authenticated;
