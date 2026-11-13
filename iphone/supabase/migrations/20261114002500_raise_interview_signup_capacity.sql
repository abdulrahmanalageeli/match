-- Reham's live QA signup reached the normal daily ceiling while completing the
-- required interview. Extend only the two approved QA members while preserving
-- the default member, burst, and project-wide safeguards.
do $$
declare
  definition text;
  updated text;
begin
  select pg_get_functiondef('nisfayn_ai.interview_before_receipts(text,jsonb,text)'::regprocedure)
    into definition;

  updated := replace(
    definition,
    '(case when owner=''member:b3019f65-9462-4e12-9614-1127e8712a04'' then 80 else 40 end)',
    '(case when owner in (''member:b3019f65-9462-4e12-9614-1127e8712a04'',''member:4c6ad0d9-a5c5-42dd-bb6c-a0614e7341b9'') then 80 else 40 end)'
  );

  if updated = definition then
    raise exception 'Interview daily capacity expression was not found';
  end if;

  execute updated;
end;
$$;
