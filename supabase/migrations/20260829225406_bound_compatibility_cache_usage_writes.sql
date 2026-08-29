-- Cache usage fields are diagnostic metadata. A full matching run can hit tens
-- of thousands of rows, so an unbounded touch generated more WAL than the
-- primary matching writes and could exhaust database I/O.
create or replace function public.touch_compatibility_cache_rows(p_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with requested as (
    select distinct requested.id
    from unnest(coalesce(p_ids, array[]::uuid[])) as requested(id)
    where requested.id is not null
    limit 200
  ),
  touched as (
    update public.compatibility_cache as cache
    set
      last_used = now(),
      use_count = coalesce(cache.use_count, 0) + 1
    from requested
    where cache.id = requested.id
      and (
        cache.last_used is null
        or cache.last_used < now() - interval '6 hours'
      )
    returning 1
  )
  select count(*)::integer
  from touched;
$$;

comment on function public.touch_compatibility_cache_rows(uuid[])
is 'Updates usage metadata for at most 200 cache rows and no more than once per row every six hours.';

revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from public;
revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from anon;
revoke execute on function public.touch_compatibility_cache_rows(uuid[]) from authenticated;
grant execute on function public.touch_compatibility_cache_rows(uuid[]) to service_role;

-- No application query filters or orders by last_used, and production index
-- statistics showed zero scans. Keeping this index made every metadata touch a
-- non-HOT update and amplified WAL considerably.
drop index if exists public.idx_cache_usage;
