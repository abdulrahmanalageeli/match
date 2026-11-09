-- Private birthdays are deliberately separate from searchable/public profiles.
create table marriage.member_birth_dates (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 birth_date date not null
);
alter table marriage.member_birth_dates enable row level security;
revoke all on marriage.member_birth_dates from public,anon,authenticated,service_role;

create function marriage.birthday_age(birthday date, today date default (now() at time zone 'Asia/Riyadh')::date)
returns integer language sql immutable set search_path='' as $$
 select extract(year from today)::integer-extract(year from birthday)::integer
  -case when to_char(today,'MMDD')<to_char(birthday,'MMDD') then 1 else 0 end
$$;
revoke all on function marriage.birthday_age(date,date) from public,anon,authenticated,service_role;

alter function marriage.profile_json(uuid) rename to profile_json_before_birthday;
create function marriage.profile_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.profile_json_before_birthday(target) || coalesce((
  select jsonb_build_object('age',marriage.birthday_age(b.birth_date)) ||
   case when auth.uid()=target then jsonb_build_object('birthDate',b.birth_date) else '{}'::jsonb end
  from marriage.member_birth_dates b where b.member_id=target),'{}'::jsonb)
$$;
revoke all on function marriage.profile_json(uuid),marriage.profile_json_before_birthday(uuid) from public,anon,authenticated,service_role;

alter function marriage.apply_profile(jsonb) rename to apply_profile_before_birthday;
create function marriage.apply_profile(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); birthday date; years integer; result jsonb;
begin
 perform 1 from marriage.members where id=me for update;
 select birth_date into birthday from marriage.member_birth_dates where member_id=me;
 if payload ? 'birthDate' then
  if jsonb_typeof(payload->'birthDate') is distinct from 'string' or coalesce(payload->>'birthDate','') !~ '^\d{4}-\d{2}-\d{2}$' then
   raise exception 'أدخل تاريخ ميلاد صحيحًا بالتقويم الميلادي.' using errcode='22023';
  end if;
  begin birthday:=(payload->>'birthDate')::date;
  exception when datetime_field_overflow or invalid_datetime_format then
   raise exception 'تاريخ الميلاد غير صالح.' using errcode='22023';end;
 end if;
 if birthday is null and not exists(select 1 from marriage.profiles where member_id=me) then
  raise exception 'أدخل تاريخ ميلادك لإكمال التسجيل.' using errcode='22023';
 end if;
 if birthday is not null then
  years:=marriage.birthday_age(birthday);
  if years not between 18 and 110 then raise exception 'نصفين متاح لمن أتمّ ١٨ عامًا، حتى ١١٠ أعوام.' using errcode='22023';end if;
  payload:=jsonb_set(payload,'{age}',to_jsonb(years));
 end if;
 result:=marriage.apply_profile_before_birthday(payload-'birthDate');
 if birthday is not null then
  insert into marriage.member_birth_dates values(me,birthday)
  on conflict(member_id) do update set birth_date=excluded.birth_date;
 end if;
 return marriage.member_state(me);
end $$;
revoke all on function marriage.apply_profile(jsonb),marriage.apply_profile_before_birthday(jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.apply_profile(jsonb) to authenticated;

-- Preserve private saved onboarding drafts, including unfinished date entry.
do $$declare definition text;begin
 definition:=pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
 if strpos(definition,'''displayName'',''age'',''gender''')=0 then raise exception 'Draft allowlist changed';end if;
 execute replace(definition,'''displayName'',''age'',''gender''','''displayName'',''age'',''birthDate'',''gender''');
end $$;

-- Existing daily maintenance updates indexed ages used by discovery/eligibility.
create function marriage.refresh_birthday_ages() returns integer language plpgsql set search_path='' as $$
declare changed integer;
begin
 update marriage.profiles p set age=least(110,marriage.birthday_age(b.birth_date))
 from marriage.member_birth_dates b where p.member_id=b.member_id and p.age<>least(110,marriage.birthday_age(b.birth_date));
 get diagnostics changed=row_count;
 update marriage.members m set approved_profile_snapshot=jsonb_set(m.approved_profile_snapshot,'{card,age}',to_jsonb(p.age))
 from marriage.profiles p join marriage.member_birth_dates b on b.member_id=p.member_id
 where m.id=p.member_id and jsonb_typeof(m.approved_profile_snapshot->'card')='object'
 and m.approved_profile_snapshot#>'{card,age}' is distinct from to_jsonb(p.age);
 return changed;
end $$;
revoke all on function marriage.refresh_birthday_ages() from public,anon,authenticated,service_role;
alter function marriage.operations_cleanup() rename to operations_cleanup_before_birthdays;
create function marriage.operations_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare refreshed integer;begin
 refreshed:=marriage.refresh_birthday_ages();
 return marriage.operations_cleanup_before_birthdays()||jsonb_build_object('birthdayAgesUpdated',refreshed);
end $$;
revoke all on function marriage.operations_cleanup(),marriage.operations_cleanup_before_birthdays() from public,anon,authenticated,service_role;
grant execute on function marriage.operations_cleanup() to service_role;
