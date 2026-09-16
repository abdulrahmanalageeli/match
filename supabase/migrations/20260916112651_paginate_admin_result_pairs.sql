-- Read small pages without transferring the complete JSON report to the API.
-- Only the authenticated admin API's service role may call this function.
create or replace function public.get_admin_result_pair_page(p_session_id text, p_offset integer default 0)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  report jsonb;
  page jsonb := '[]'::jsonb;
  pair jsonb;
  cursor_position integer := greatest(coalesce(p_offset, 0), 0);
  total integer;
  page_bytes integer := 0;
  pair_bytes integer;
begin
  select calculated_pairs into report from public.admin_results
  where session_id = p_session_id order by created_at desc limit 1;
  if not found then return null; end if;
  if report is null or jsonb_typeof(report) <> 'array' then report := '[]'::jsonb; end if;
  total := jsonb_array_length(report);
  -- Bound both rows and bytes, allowing room for the response envelope.
  while cursor_position < total and jsonb_array_length(page) < 150 loop
    pair := report -> cursor_position;
    pair_bytes := octet_length(pair::text);
    if page_bytes + pair_bytes > 2000000 then
      if page_bytes = 0 then raise exception 'A single score detail exceeds the page limit'; end if;
      exit;
    end if;
    page := page || jsonb_build_array(pair);
    page_bytes := page_bytes + pair_bytes;
    cursor_position := cursor_position + 1;
  end loop;
  return jsonb_build_object('pairs', page, 'total', total,
    'nextOffset', case when cursor_position < total then cursor_position else null end);
end;
$$;
revoke all on function public.get_admin_result_pair_page(text, integer) from public, anon, authenticated;
grant execute on function public.get_admin_result_pair_page(text, integer) to service_role;
