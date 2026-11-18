-- Demo discovery is independent of complimentary signup access.
alter table marriage.testing_signup_config add column demo_discovery_enabled boolean not null default true;
alter function marriage.member_state(uuid) rename to member_state_before_demo_discovery;
create function marriage.member_state(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select marriage.member_state_before_demo_discovery(target) || jsonb_build_object(
 'demoDiscoveryEnabled',coalesce((select demo_discovery_enabled from marriage.testing_signup_config where id),false))
$$;
revoke all on function marriage.member_state(uuid),marriage.member_state_before_demo_discovery(uuid) from public,anon,authenticated;
