-- Vercel Hobby allows only one cron invocation per day. Use Supabase Cron for
-- minute-level dispatch. Only a short-lived, one-time HMAC leaves Supabase;
-- the signing secret itself remains encrypted in Vault.

create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'compatibility_vibe_worker_signing_key'
  ) then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'compatibility_vibe_worker_signing_key',
      'Signing key for one-time compatibility vibe worker requests'
    );
  end if;
end;
$$;

create table if not exists public.compatibility_vibe_worker_nonces (
  nonce uuid primary key,
  requested_at timestamptz not null,
  consumed_at timestamptz not null default now()
);

alter table public.compatibility_vibe_worker_nonces enable row level security;
alter table public.compatibility_vibe_worker_nonces force row level security;
revoke all on table public.compatibility_vibe_worker_nonces from public;
revoke all on table public.compatibility_vibe_worker_nonces from anon;
revoke all on table public.compatibility_vibe_worker_nonces from authenticated;
revoke all on table public.compatibility_vibe_worker_nonces from service_role;

create or replace function public.verify_compatibility_vibe_worker_request(
  p_timestamp bigint,
  p_nonce uuid,
  p_signature text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  signing_key text;
  expected_signature text;
  request_time timestamptz;
  inserted integer := 0;
begin
  if p_timestamp is null or p_nonce is null or p_signature is null
    or p_signature !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  request_time := pg_catalog.to_timestamp(p_timestamp);
  if request_time < now() - interval '2 minutes'
    or request_time > now() + interval '30 seconds' then
    return false;
  end if;

  select secret.decrypted_secret
  into signing_key
  from vault.decrypted_secrets as secret
  where secret.name = 'compatibility_vibe_worker_signing_key'
  order by secret.created_at desc
  limit 1;
  if signing_key is null then return false; end if;

  expected_signature := pg_catalog.encode(
    extensions.hmac(p_timestamp::text || '.' || p_nonce::text, signing_key, 'sha256'),
    'hex'
  );
  if expected_signature <> p_signature then return false; end if;

  insert into public.compatibility_vibe_worker_nonces (nonce, requested_at)
  values (p_nonce, request_time)
  on conflict (nonce) do nothing;
  get diagnostics inserted = row_count;
  if inserted <> 1 then return false; end if;

  delete from public.compatibility_vibe_worker_nonces
  where consumed_at < now() - interval '1 day';
  return true;
end;
$$;

revoke execute on function public.verify_compatibility_vibe_worker_request(bigint, uuid, text) from public;
revoke execute on function public.verify_compatibility_vibe_worker_request(bigint, uuid, text) from anon;
revoke execute on function public.verify_compatibility_vibe_worker_request(bigint, uuid, text) from authenticated;
grant execute on function public.verify_compatibility_vibe_worker_request(bigint, uuid, text) to service_role;

create or replace function public.invoke_compatibility_vibe_worker()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  signing_key text;
  request_timestamp bigint;
  request_nonce uuid;
  request_signature text;
  request_id bigint;
begin
  select secret.decrypted_secret
  into signing_key
  from vault.decrypted_secrets as secret
  where secret.name = 'compatibility_vibe_worker_signing_key'
  order by secret.created_at desc
  limit 1;
  if signing_key is null then
    raise exception 'Compatibility vibe worker signing key is missing';
  end if;

  request_timestamp := pg_catalog.floor(pg_catalog.extract(epoch from now()))::bigint;
  request_nonce := extensions.gen_random_uuid();
  request_signature := pg_catalog.encode(
    extensions.hmac(request_timestamp::text || '.' || request_nonce::text, signing_key, 'sha256'),
    'hex'
  );

  select net.http_post(
    url := 'https://blindmatch.app/api/admin/cache-vibe-worker',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Vibe-Worker-Timestamp', request_timestamp::text,
      'X-Vibe-Worker-Nonce', request_nonce::text,
      'X-Vibe-Worker-Signature', request_signature
    ),
    body := pg_catalog.jsonb_build_object('source', 'supabase_cron'),
    timeout_milliseconds := 55000
  ) into request_id;
  return request_id;
end;
$$;

revoke execute on function public.invoke_compatibility_vibe_worker() from public;
revoke execute on function public.invoke_compatibility_vibe_worker() from anon;
revoke execute on function public.invoke_compatibility_vibe_worker() from authenticated;
revoke execute on function public.invoke_compatibility_vibe_worker() from service_role;

select cron.schedule(
  'compatibility-vibe-enrichment-worker',
  '* * * * *',
  'select public.invoke_compatibility_vibe_worker();'
);

comment on function public.verify_compatibility_vibe_worker_request(bigint, uuid, text) is
  'Validates one short-lived HMAC once; the Vault signing key never leaves Postgres.';
comment on function public.invoke_compatibility_vibe_worker() is
  'Supabase-Cron-only dispatch for one durable 12-job AI-chemistry finalization lane.';
