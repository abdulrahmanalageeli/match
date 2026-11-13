-- Keep resumable applications and their private staged portraits available for
-- the same 30-day window as the guided interview. Expired records stay expired.
alter table marriage.onboarding_drafts
  alter column expires_at set default now() + interval '30 days';

update marriage.onboarding_drafts
set expires_at = greatest(expires_at, updated_at + interval '30 days')
where expires_at > now();

do $recovery$
declare
  definition text;
begin
  definition := pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
  if strpos(definition, 'interval ''7 days''') = 0 then
    raise exception 'Unexpected onboarding draft retention definition';
  end if;
  execute replace(definition, 'interval ''7 days''', 'interval ''30 days''');

  definition := pg_get_functiondef('marriage.portrait_prepare(integer)'::regprocedure);
  if strpos(definition, 'interval ''7 days''') = 0 then
    raise exception 'Unexpected portrait prepare retention definition';
  end if;
  execute replace(definition, 'interval ''7 days''', 'interval ''30 days''');

  definition := pg_get_functiondef('marriage.portrait_cleanup_batch()'::regprocedure);
  if strpos(definition, 'interval ''7 days''') = 0 then
    raise exception 'Unexpected portrait cleanup retention definition';
  end if;
  execute replace(definition, 'interval ''7 days''', 'interval ''30 days''');

  definition := pg_get_functiondef('marriage.portrait_stage_action(uuid,text)'::regprocedure);
  if strpos(definition, 'interval ''7 days''') = 0 then
    raise exception 'Unexpected portrait stage action retention definition';
  end if;
  execute replace(definition, 'interval ''7 days''', 'interval ''30 days''');

  definition := pg_get_functiondef('marriage.portrait_stage_resume()'::regprocedure);
  if strpos(definition, 'interval ''7 days''') = 0 then
    raise exception 'Unexpected portrait stage resume retention definition';
  end if;
  execute replace(definition, 'interval ''7 days''', 'interval ''30 days''');

  definition := pg_get_functiondef('marriage.has_onboarding_portrait(uuid)'::regprocedure);
  if strpos(definition, 'interval ''7 days''') = 0 then
    raise exception 'Unexpected onboarding portrait retention definition';
  end if;
  execute replace(definition, 'interval ''7 days''', 'interval ''30 days''');
end
$recovery$;
