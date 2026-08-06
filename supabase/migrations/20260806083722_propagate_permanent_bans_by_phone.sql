-- Treat a permanent participant ban as a phone-level ban. This catches both
-- future signups and accounts whose phone number is added after token creation.
create or replace function public.normalize_phone_for_permanent_ban(raw_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g');
begin
  if left(digits, 2) = '00' then
    digits := substr(digits, 3);
  end if;

  -- Canonicalize the Saudi formats used by the signup form.
  if digits ~ '^9660?5[0-9]{8}$' or digits ~ '^05[0-9]{8}$' then
    return '+966' || right(digits, 9);
  elsif digits ~ '^5[0-9]{8}$' then
    return '+966' || digits;
  elsif length(digits) >= 7 then
    return '+' || digits;
  end if;

  return null;
end;
$$;

create or replace function public.apply_existing_phone_ban_to_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  banned_source_number integer;
begin
  if public.normalize_phone_for_permanent_ban(new.phone_number) is null then
    return new;
  end if;

  select banned_participant.assigned_number
    into banned_source_number
  from public.participants banned_participant
  join public.excluded_pairs ban
    on ban.match_id = banned_participant.match_id
   and ban.participant1_number = banned_participant.assigned_number
   and ban.participant2_number = -10
  where banned_participant.match_id = new.match_id
    and banned_participant.id <> new.id
    and public.normalize_phone_for_permanent_ban(banned_participant.phone_number)
      = public.normalize_phone_for_permanent_ban(new.phone_number)
  order by case when ban.created_by = 'automatic_phone_ban' then 1 else 0 end,
           ban.created_at
  limit 1;

  if banned_source_number is not null then
    insert into public.excluded_pairs (
      match_id, participant1_number, participant2_number, created_by, reason
    ) values (
      new.match_id,
      new.assigned_number,
      -10,
      'automatic_phone_ban',
      'AUTO_PHONE_BAN: duplicate of permanently banned participant #' || banned_source_number
    ) on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_existing_phone_ban_to_participant on public.participants;
create trigger apply_existing_phone_ban_to_participant
after insert or update of phone_number on public.participants
for each row
execute function public.apply_existing_phone_ban_to_participant();

-- When an admin creates a permanent ban, immediately ban any accounts that
-- already share the same normalized phone number.
create or replace function public.propagate_new_permanent_ban_by_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_phone text;
begin
  if new.participant2_number <> -10 or new.created_by = 'automatic_phone_ban' then
    return new;
  end if;

  select phone_number into source_phone
  from public.participants
  where match_id = new.match_id
    and assigned_number = new.participant1_number;

  if public.normalize_phone_for_permanent_ban(source_phone) is null then
    return new;
  end if;

  insert into public.excluded_pairs (
    match_id, participant1_number, participant2_number, created_by, reason
  )
  select
    duplicate.match_id,
    duplicate.assigned_number,
    -10,
    'automatic_phone_ban',
    'AUTO_PHONE_BAN: duplicate of permanently banned participant #' || new.participant1_number
  from public.participants duplicate
  where duplicate.match_id = new.match_id
    and duplicate.assigned_number <> new.participant1_number
    and public.normalize_phone_for_permanent_ban(duplicate.phone_number)
      = public.normalize_phone_for_permanent_ban(source_phone)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists propagate_new_permanent_ban_by_phone on public.excluded_pairs;
create trigger propagate_new_permanent_ban_by_phone
after insert on public.excluded_pairs
for each row
execute function public.propagate_new_permanent_ban_by_phone();

-- Backfill duplicate accounts that predate this migration.
insert into public.excluded_pairs (
  match_id, participant1_number, participant2_number, created_by, reason
)
select distinct on (duplicate.match_id, duplicate.assigned_number)
  duplicate.match_id,
  duplicate.assigned_number,
  -10,
  'automatic_phone_ban',
  'AUTO_PHONE_BAN: duplicate of permanently banned participant #' || banned.assigned_number
from public.participants banned
join public.excluded_pairs ban
  on ban.match_id = banned.match_id
 and ban.participant1_number = banned.assigned_number
 and ban.participant2_number = -10
join public.participants duplicate
  on duplicate.match_id = banned.match_id
 and duplicate.assigned_number <> banned.assigned_number
 and public.normalize_phone_for_permanent_ban(duplicate.phone_number)
   = public.normalize_phone_for_permanent_ban(banned.phone_number)
where public.normalize_phone_for_permanent_ban(banned.phone_number) is not null
order by duplicate.match_id, duplicate.assigned_number, ban.created_at
on conflict do nothing;
