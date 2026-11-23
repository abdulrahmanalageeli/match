-- The public entry point must work before a member has a session.
create table marriage.release_policies (
  platform text primary key check (platform in ('ios','web')),
  audit_id uuid not null unique default gen_random_uuid(),
  minimum_build integer not null default 0 check (minimum_build between 0 and 999999),
  recommended_build integer not null default 0 check (recommended_build between 0 and 999999),
  store_url text,
  maintenance_until timestamptz,
  revision integer not null default 0 check (revision >= 0),
  check (recommended_build = 0 or recommended_build >= minimum_build),
  check (store_url is null or (platform = 'ios' and store_url ~ '^https://apps[.]apple[.]com/app/id[1-9][0-9]{0,18}$')),
  check (platform <> 'ios' or greatest(minimum_build,recommended_build) = 0 or store_url is not null)
);
alter table marriage.release_policies enable row level security;
revoke all on marriage.release_policies from public,anon,authenticated,service_role;
insert into marriage.release_policies(platform) values ('ios'),('web');

alter table marriage.staff_audit drop constraint staff_audit_target_type_check;
alter table marriage.staff_audit add constraint staff_audit_target_type_check check (
  target_type in ('member','report','staff','staff_invitation','family_link','verification','publication','release_policy')
);

create function marriage.read_release_policy(target_platform text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  policy jsonb;
begin
  select jsonb_build_object(
    'minimumBuild',p.minimum_build,
    'recommendedBuild',p.recommended_build,
    'storeUrl',p.store_url,
    'maintenanceUntil',case when p.maintenance_until > now() then p.maintenance_until end,
    'revision',p.revision
  ) into policy from marriage.release_policies p where p.platform=target_platform;

  if not found then raise exception 'منصة غير مدعومة.' using errcode='22023'; end if;
  return policy;
end $$;

create function public.wudayn_release_policy(target_platform text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select marriage.read_release_policy($1)
$$;

create function marriage.write_release_policy(
  target_platform text, expected_revision integer, minimum_build integer, recommended_build integer,
  store_url text, maintenance_until timestamptz
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  staff marriage.staff_accounts := marriage.require_staff(array['owner']);
  current_policy marriage.release_policies;
  listing text := nullif(btrim(store_url),'');
  apple_id text;
  ends_at timestamptz := case when maintenance_until > now() then maintenance_until end;
  before_policy jsonb;
  after_policy jsonb;
begin
  select p.* into current_policy from marriage.release_policies p where p.platform=target_platform for update;
  if not found then raise exception 'منصة غير مدعومة.' using errcode='22023'; end if;
  if current_policy.revision is distinct from expected_revision then
    raise exception 'تغيّرت إعدادات الإصدار. حدّث الصفحة قبل الحفظ.' using errcode='40001';
  end if;
  if minimum_build is null or minimum_build not between 0 and 999999
     or recommended_build is null or recommended_build not between 0 and 999999
     or (recommended_build <> 0 and recommended_build < minimum_build) then
    raise exception 'تحقّق من أرقام إصدارات التطبيق.' using errcode='22023';
  end if;
  if ends_at > now() + interval '24 hours' then
    raise exception 'حدّد موعدًا لانتهاء الصيانة خلال ٢٤ ساعة.' using errcode='22023';
  end if;

  if target_platform='ios' then
    if listing is not null then
      if listing ~ '^[1-9][0-9]{0,18}$' then
        apple_id := listing;
      else
        apple_id := substring(listing from '^https://apps[.]apple[.]com/(?:[a-z]{2}/)?app/(?:[[:alnum:]%._~-]+/)?id([1-9][0-9]{0,18})/?$');
      end if;
      if apple_id is null then raise exception 'أدخل رابط التطبيق الرسمي في App Store.' using errcode='22023'; end if;
      listing := 'https://apps.apple.com/app/id' || apple_id;
    elsif greatest(minimum_build,recommended_build)>0 then
      raise exception 'أضف رابط App Store قبل طلب التحديث.' using errcode='22023';
    end if;
  elsif listing is not null then
    raise exception 'تحديث الويب يتم من الموقع مباشرة.' using errcode='22023';
  end if;

  before_policy := marriage.read_release_policy(target_platform);
  if (current_policy.minimum_build,current_policy.recommended_build,current_policy.store_url,current_policy.maintenance_until)
      is not distinct from (minimum_build,recommended_build,listing,ends_at) then
    return before_policy;
  end if;
  update marriage.release_policies p set
    minimum_build=$3,recommended_build=$4,store_url=listing,maintenance_until=ends_at,revision=p.revision+1
    where p.platform=target_platform;

  after_policy := marriage.read_release_policy(target_platform);
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,result)
    values(staff.user_id,staff.display_name,staff.role,'release_policy_updated','release_policy',current_policy.audit_id,
           'تعديل إعدادات الإصدار · ' || target_platform,
           jsonb_build_object('platform',target_platform,'before',before_policy,'after',after_policy));
  return after_policy;
end $$;

create function public.wudayn_set_release_policy(
  target_platform text, expected_revision integer, minimum_build integer, recommended_build integer,
  store_url text, maintenance_until timestamptz
) returns jsonb
language sql security invoker set search_path='' as $$
  select marriage.write_release_policy($1,$2,$3,$4,$5,$6)
$$;

revoke all on function marriage.read_release_policy(text),public.wudayn_release_policy(text),
  marriage.write_release_policy(text,integer,integer,integer,text,timestamptz),
  public.wudayn_set_release_policy(text,integer,integer,integer,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function marriage.read_release_policy(text),public.wudayn_release_policy(text) to anon,authenticated;
grant execute on function marriage.write_release_policy(text,integer,integer,integer,text,timestamptz),
  public.wudayn_set_release_policy(text,integer,integer,integer,text,timestamptz) to authenticated;
