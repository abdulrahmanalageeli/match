-- Keep a single transactional claim across Auth phone login and signup SMS.
-- The private index survives account deletion only for outstanding suspensions.
lock table auth.users, marriage.members, marriage.signup_phone_verifications in share row exclusive mode;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'wudayn_phone_claim_key');

create table marriage.phone_claims (
  phone_tag bytea primary key,
  member_id uuid not null,
  auth_bound boolean not null,
  signup_bound boolean not null,
  held boolean not null
);
create index phone_claims_member on marriage.phone_claims(member_id);
alter table marriage.phone_claims enable row level security;
revoke all on marriage.phone_claims from public, anon, authenticated, service_role;

create function marriage.phone_claim_tag(value text) returns bytea
language plpgsql stable strict set search_path = '' as $$
declare
  canonical text := '+' || ltrim(value, '+');
  secret text;
begin
  -- Same two designated numbers as the signup SMS provider exceptions.
  if value = '' or canonical in ('+966560899666', '+966553576798') then return null; end if;
  select decrypted_secret into strict secret from vault.decrypted_secrets where name = 'wudayn_phone_claim_key';
  return extensions.hmac(canonical, secret, 'sha256');
end $$;

-- Fail atomically if existing accounts disagree about ownership. Never silently
-- pick a winner. A member can have the same phone in both source tables.
with bindings as (
  select id, marriage.phone_claim_tag(phone) as tag, true as native from auth.users where phone_confirmed_at is not null
  union all
  select user_id, marriage.phone_claim_tag(phone), false from marriage.signup_phone_verifications
)
insert into marriage.phone_claims
select b.tag, b.id, bool_or(b.native), bool_or(not b.native), bool_or(coalesce(m.suspended, false))
from bindings b left join marriage.members m on m.id = b.id
where b.tag is not null group by b.tag, b.id;

create function marriage.sync_phone_claim() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  native boolean := tg_table_schema = 'auth';
  member uuid;
  previous_tag bytea;
  next_tag bytea;
  suspended_now boolean;
begin
  if tg_op <> 'INSERT' then
    if native then
      member := old.id;
      if old.phone_confirmed_at is not null then previous_tag := marriage.phone_claim_tag(old.phone); end if;
    else
      member := old.user_id;
      previous_tag := marriage.phone_claim_tag(old.phone);
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if native then
      member := new.id;
      if new.phone_confirmed_at is not null then next_tag := marriage.phone_claim_tag(new.phone); end if;
    else
      member := new.user_id;
      next_tag := marriage.phone_claim_tag(new.phone);
    end if;
  end if;
  if previous_tag is not distinct from next_tag then return null; end if;
  select suspended into suspended_now from marriage.members where id = member for update;

  if next_tag is not null then
    insert into marriage.phone_claims as claim values(next_tag, member, native, not native, coalesce(suspended_now, false))
    on conflict(phone_tag) do update set auth_bound = claim.auth_bound or excluded.auth_bound,
      signup_bound = claim.signup_bound or excluded.signup_bound
    where claim.member_id = excluded.member_id;
    if not found then
      raise exception 'تعذّر استخدام رقم الجوال لهذا الحساب. جرّب تسجيل الدخول أو تواصل مع الدعم.' using errcode='P0001';
    end if;
  end if;
  if previous_tag is not null then
    update marriage.phone_claims set auth_bound = auth_bound and not native, signup_bound = signup_bound and native
    where phone_tag = previous_tag and member_id = member;
    delete from marriage.phone_claims where phone_tag = previous_tag and member_id = member
      and not (auth_bound or signup_bound or held);
  end if;
  return null;
end $$;
create trigger sync_auth_phone_claim after insert or update of phone, phone_confirmed_at or delete on auth.users
for each row execute function marriage.sync_phone_claim();
create trigger sync_signup_phone_claim after insert or update of phone or delete on marriage.signup_phone_verifications
for each row execute function marriage.sync_phone_claim();

create function marriage.sync_phone_suspension() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update marriage.phone_claims set held = new.suspended where member_id = new.id;
  if not new.suspended then
    delete from marriage.phone_claims where member_id = new.id and not (auth_bound or signup_bound);
  end if;
  return null;
end $$;
create trigger sync_phone_suspension after update of suspended on marriage.members
for each row when (old.suspended is distinct from new.suspended) execute function marriage.sync_phone_suspension();

create function marriage.release_deleted_phone_block(phone_number text, reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  staff marriage.staff_accounts := marriage.require_staff(array['owner','moderator']);
  former_member uuid;
begin
  if phone_number is null or phone_number !~ '^\+[1-9][0-9]{6,14}$'
    or reason is null or reason not in ('قُبل الاعتراض','أُعيد تخصيص الرقم','تبيّن خطأ التعليق') then
    raise exception 'أدخل رقم الجوال واختر سبب رفع الحظر.';
  end if;
  delete from marriage.phone_claims c where c.phone_tag = marriage.phone_claim_tag(phone_number)
    and c.held and not c.auth_bound and not c.signup_bound
    and not exists(select 1 from auth.users u where u.id = c.member_id)
  returning c.member_id into former_member;
  if not found then return false; end if;
  insert into marriage.staff_audit(actor_id, actor_name, actor_role, action, target_type, target_id, reason)
  values(staff.user_id, staff.display_name, staff.role, 'release_phone_block', 'member', former_member, btrim(reason));
  return true;
end $$;
create function public.marriage_release_deleted_phone_block(phone_number text, reason text) returns boolean
language sql security invoker set search_path = '' as $$ select marriage.release_deleted_phone_block($1,$2) $$;
revoke all on function marriage.phone_claim_tag(text), marriage.sync_phone_claim(), marriage.sync_phone_suspension(),
  marriage.release_deleted_phone_block(text,text), public.marriage_release_deleted_phone_block(text,text) from public, anon, authenticated, service_role;
grant execute on function marriage.release_deleted_phone_block(text,text), public.marriage_release_deleted_phone_block(text,text) to authenticated;
