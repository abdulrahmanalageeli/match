-- Delta cache freshness must only follow data that affects matching. The generic
-- participants.updated_at column changes for receipts, attendance, payment, and
-- other operational actions, so it cannot be used as evidence of enrollment.

alter table public.participants
  add column if not exists event_enrolled_at timestamptz;

-- Existing event assignments predate the dedicated timestamp. created_at is the
-- conservative legacy fallback: it cannot make an old participant look newly
-- enrolled merely because an unrelated field was updated recently.
update public.participants
set event_enrolled_at = coalesce(event_enrolled_at, created_at)
where event_id is not null
  and event_enrolled_at is null;

create or replace function public.sync_autosignup_to_next_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if new.auto_signup_next_event is true then
    new.signup_for_next_event := true;
  end if;

  if tg_op = 'INSERT' then
    if new.event_id is not null then
      new.event_enrolled_at := coalesce(new.event_enrolled_at, new.created_at, pg_catalog.now());
    end if;

    if new.signup_for_next_event is true or new.auto_signup_next_event is true then
      new.next_event_signup_timestamp := coalesce(
        new.next_event_signup_timestamp,
        new.created_at,
        pg_catalog.now()
      );
    end if;
  else
    if new.event_id is distinct from old.event_id then
      new.event_enrolled_at := pg_catalog.now();
    elsif new.event_id is not null and new.event_enrolled_at is null then
      new.event_enrolled_at := coalesce(old.event_enrolled_at, new.created_at, old.created_at, pg_catalog.now());
    end if;

    if new.signup_for_next_event is true or new.auto_signup_next_event is true then
      if not (old.signup_for_next_event is true or old.auto_signup_next_event is true)
         or new.signup_event_id is distinct from old.signup_event_id then
        new.next_event_signup_timestamp := pg_catalog.now();
      else
        new.next_event_signup_timestamp := coalesce(
          new.next_event_signup_timestamp,
          old.next_event_signup_timestamp,
          pg_catalog.now()
        );
      end if;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trigger_sync_autosignup_to_next_event on public.participants;
create trigger trigger_sync_autosignup_to_next_event
before insert or update on public.participants
for each row
execute function public.sync_autosignup_to_next_event();

comment on column public.participants.event_enrolled_at is
  'When event_id last changed; used for matching delta-cache invalidation instead of generic updated_at.';
