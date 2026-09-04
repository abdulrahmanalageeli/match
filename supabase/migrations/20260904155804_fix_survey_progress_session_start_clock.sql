-- now() is transaction-stable. A new browser session must receive its actual
-- wall-clock start even when the previous session update shares a transaction.

create or replace function public.reset_survey_progress_session_started_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.session_id is distinct from old.session_id then
    new.started_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;

revoke all on function public.reset_survey_progress_session_started_at() from public, anon, authenticated;
grant execute on function public.reset_survey_progress_session_started_at() to service_role;
