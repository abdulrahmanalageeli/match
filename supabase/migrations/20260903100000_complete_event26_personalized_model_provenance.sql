-- Complete v11 activation on databases whose cache routines still contain the
-- original v7 tag. This is intentionally idempotent for fresh installations,
-- where the preceding activation migration has already upgraded every tag.

do $migration$
declare
  routine record;
  definition text;
begin
  for routine in
    select procedure.oid
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind in ('f', 'p')
      and (
        pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-08-25-v7-balanced-100%'
        or pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-02-v9-feedback-evidence-100%'
        or pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-03-v10-v7-restored-100%'
      )
  loop
    definition := pg_catalog.replace(
      pg_catalog.pg_get_functiondef(routine.oid),
      '2026-08-25-v7-balanced-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    definition := pg_catalog.replace(
      definition,
      '2026-09-02-v9-feedback-evidence-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    definition := pg_catalog.replace(
      definition,
      '2026-09-03-v10-v7-restored-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    execute definition;
  end loop;

  if pg_catalog.to_regclass('public.v_cache_freshness') is not null then
    definition := pg_catalog.replace(
      pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true),
      '2026-08-25-v7-balanced-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    definition := pg_catalog.replace(
      definition,
      '2026-09-02-v9-feedback-evidence-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    definition := pg_catalog.replace(
      definition,
      '2026-09-03-v10-v7-restored-100',
      '2026-09-03-v11-event26-archetype-personalized-100'
    );
    execute 'create or replace view public.v_cache_freshness as ' || definition;
    execute 'alter view public.v_cache_freshness set (security_invoker = true)';
    execute 'revoke all on table public.v_cache_freshness from public, anon, authenticated';
    execute 'grant select on table public.v_cache_freshness to service_role';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind in ('f', 'p')
      and (
        pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-08-25-v7-balanced-100%'
        or pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-02-v9-feedback-evidence-100%'
        or pg_catalog.pg_get_functiondef(procedure.oid) like '%2026-09-03-v10-v7-restored-100%'
      )
  ) then
    raise exception 'A public score-provenance routine still references an older score model';
  end if;

  if pg_catalog.to_regclass('public.v_cache_freshness') is not null
    and (
      pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true)
        not like '%2026-09-03-v11-event26-archetype-personalized-100%'
      or pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true)
        like '%2026-08-25-v7-balanced-100%'
      or pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true)
        like '%2026-09-02-v9-feedback-evidence-100%'
      or pg_catalog.pg_get_viewdef('public.v_cache_freshness'::pg_catalog.regclass, true)
        like '%2026-09-03-v10-v7-restored-100%'
    )
  then
    raise exception 'Cache freshness view did not advance to v11';
  end if;
end
$migration$;
