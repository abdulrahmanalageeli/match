create or replace function public.touch_compatibility_cache_rows(p_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with touched as (
    update public.compatibility_cache
    set
      last_used = now(),
      use_count = coalesce(use_count, 0) + 1
    where id = any(coalesce(p_ids, array[]::uuid[]))
    returning 1
  )
  select count(*)::integer
  from touched;
$$;

comment on function public.touch_compatibility_cache_rows(uuid[])
is 'Atomically increments usage metadata for exact compatibility-cache hits in one database call.';

revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from public;
revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from anon;
revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from authenticated;
grant execute on function public.touch_compatibility_cache_rows(uuid[]) to service_role;
