create or replace function marriage.member_state_before_boundaries(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select marriage.member_state_before_demo_discovery(target) || jsonb_build_object(
   'demoDiscoveryEnabled', coalesce((select demo_discovery_enabled from marriage.testing_signup_config where id), false),
   'demoInteractionsEnabled', exists (
     select 1 from auth.users
     where id = target and email_confirmed_at is not null
       and (lower(email) = 'timgoldenz1999@yahoo.com' or id = '4c6ad0d9-a5c5-42dd-bb6c-a0614e7341b9'::uuid)
   )
 )
$$;
