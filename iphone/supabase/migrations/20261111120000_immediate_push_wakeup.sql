-- Wake the existing delivery worker after commit. Cron remains the retry fallback.
create extension if not exists pg_net with schema extensions;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'nisfayn_push_wake') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'), 'nisfayn_push_wake');
  end if;
end $$;

create or replace function public.nisfayn_push_wake_authorized(candidate text)
returns boolean language sql security definer set search_path = '' as $$
  select coalesce(length(candidate) = 64 and exists (
    select 1 from vault.decrypted_secrets where name = 'nisfayn_push_wake'
      and decrypted_secret = candidate
  ), false);
$$;
revoke all on function public.nisfayn_push_wake_authorized(text) from public, anon, authenticated;
grant execute on function public.nisfayn_push_wake_authorized(text) to service_role;

create or replace function marriage.wake_push_worker()
returns trigger language plpgsql security definer set search_path = '' as $$
declare secret text;
begin
  -- One wake per transaction, even when several devices receive the same event.
  if current_setting('nisfayn.push_woken', true) = 'yes' then return new; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'nisfayn_push_wake';
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://nisfayn-admin.vercel.app/api/push',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-push-wake',secret),
    timeout_milliseconds := 50000
  );
  perform set_config('nisfayn.push_woken','yes',true);
  return new;
exception when others then
  -- A wake failure must never prevent sending a message; cron will recover it.
  raise warning 'push worker wake failed';
  return new;
end;
$$;
revoke all on function marriage.wake_push_worker() from public, anon, authenticated;

create trigger push_worker_wakeup after insert on marriage.push_outbox
for each row when (new.kind <> 'reminder') execute function marriage.wake_push_worker();
create trigger push_worker_wakeup after insert on nisfayn_test.push_outbox
for each row when (new.kind <> 'reminder') execute function marriage.wake_push_worker();
