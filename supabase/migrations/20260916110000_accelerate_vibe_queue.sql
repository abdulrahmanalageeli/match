-- Keep the existing signed worker and 12-job batches; dispatch more often.
-- A locked singleton serializes claims and caps all workers at 36 active jobs.
create table public.compatibility_vibe_worker_control (
  singleton boolean primary key default true check (singleton),
  priority_event_id integer,
  updated_at timestamptz not null default now()
);
insert into public.compatibility_vibe_worker_control (singleton) values (true);
alter table public.compatibility_vibe_worker_control enable row level security;
alter table public.compatibility_vibe_worker_control force row level security;
revoke all on public.compatibility_vibe_worker_control from public, anon, authenticated;
grant select, update on public.compatibility_vibe_worker_control to service_role;

create or replace function public.claim_compatibility_vibe_enrichment_jobs(p_limit integer default 12)
returns setof public.compatibility_vibe_enrichment_jobs
language plpgsql security definer set search_path = '' as $$
declare
  priority_event integer;
  active_jobs integer;
begin
  select priority_event_id into priority_event
  from public.compatibility_vibe_worker_control where singleton for update;

  select count(*) into active_jobs from public.compatibility_vibe_enrichment_jobs
  where status = 'processing' and locked_at >= now() - interval '10 minutes';
  if active_jobs >= 36 then return; end if;

  return query
  with candidates as materialized (
    select jobs.id
    from public.compatibility_vibe_enrichment_jobs jobs
    where (jobs.status = 'pending' and jobs.available_at <= now())
       or (jobs.status = 'processing' and jobs.locked_at < now() - interval '10 minutes')
    order by
      -- Actual attendees come before the broader batch-cache pool.
      (exists (select 1 from public.participants p
        where p.match_id = jobs.match_id and p.assigned_number = jobs.participant_a_number
          and p.event_id = priority_event)
       and exists (select 1 from public.participants p
        where p.match_id = jobs.match_id and p.assigned_number = jobs.participant_b_number
          and p.event_id = priority_event)) desc,
      coalesce(jobs.event_id = priority_event, false) desc,
      jobs.available_at, jobs.created_at, jobs.id
    for update skip locked
    limit least(greatest(1, least(coalesce(p_limit, 12), 12)), 36 - active_jobs)
  )
  update public.compatibility_vibe_enrichment_jobs jobs
  set status = 'processing', attempt_count = jobs.attempt_count + 1,
      locked_at = now(), updated_at = now(), last_error = null
  from candidates where jobs.id = candidates.id
  returning jobs.*;
end;
$$;
revoke execute on function public.claim_compatibility_vibe_enrichment_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_compatibility_vibe_enrichment_jobs(integer) to service_role;

create function public.compatibility_vibe_queue_status(p_event_id integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'processing', count(*) filter (where status = 'processing'),
    'completed', count(*) filter (where status = 'completed'),
    'failed', count(*) filter (where status = 'failed'),
    'obsolete', count(*) filter (where status = 'obsolete'),
    'completed_last_minute', count(*) filter (where status = 'completed' and completed_at >= now() - interval '1 minute'),
    'retrying', count(*) filter (where status = 'pending' and attempt_count > 0),
    'priority_event_id', (select priority_event_id from public.compatibility_vibe_worker_control where singleton),
    'max_in_flight', 36,
    'dispatch_seconds', 5
  ) from public.compatibility_vibe_enrichment_jobs where event_id = p_event_id;
$$;
revoke execute on function public.compatibility_vibe_queue_status(integer) from public, anon, authenticated;
grant execute on function public.compatibility_vibe_queue_status(integer) to service_role;

-- Avoid calling Vercel when there is no runnable work or all slots are occupied.
create function public.dispatch_compatibility_vibe_worker()
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.compatibility_vibe_enrichment_jobs
      where status = 'processing' and locked_at >= now() - interval '10 minutes') >= 36
    then return null; end if;
  if exists (select 1 from public.compatibility_vibe_enrichment_jobs
    where (status = 'pending' and available_at <= now())
       or (status = 'processing' and locked_at < now() - interval '10 minutes')) then
    return public.invoke_compatibility_vibe_worker();
  end if;
  return null;
end;
$$;
revoke execute on function public.dispatch_compatibility_vibe_worker() from public, anon, authenticated, service_role;

select cron.schedule('compatibility-vibe-enrichment-worker', '5 seconds',
  'select public.dispatch_compatibility_vibe_worker();');
