-- Contact details are retrieved explicitly. Chat, notifications and closed-history rows
-- never carry the number.
create table marriage.pact_family_contacts (
  request_id uuid primary key references marriage.member_requests(id) on delete cascade,
  phone text not null check (phone ~ '^\+966(5[0-9]{8}|1[123467][0-9]{7})$')
);
alter table marriage.pact_family_contacts enable row level security;
revoke all on marriage.pact_family_contacts from public, anon, authenticated, service_role;

create function marriage.family_contact_allowed(r marriage.member_requests, member uuid)
returns boolean language sql stable set search_path='' as $$
  select member in (r.requester_id,r.recipient_id)
    and (r.status='accepted' or (r.status='cancelled' and r.notice_resolution='ended'
      and r.analytics_closed_by in (r.requester_id,r.recipient_id)))
    and marriage.relationship_member_allowed(r.requester_id)
    and marriage.relationship_member_allowed(r.recipient_id)
    and not exists(select from marriage.blocks b where (b.member_id,b.blocked_id) in
      ((r.requester_id,r.recipient_id),(r.recipient_id,r.requester_id)))
    and not exists(select from marriage.reports p where (p.member_id,p.reported_id) in
      ((r.requester_id,r.recipient_id),(r.recipient_id,r.requester_id)))
$$;
revoke all on function marriage.family_contact_allowed(marriage.member_requests,uuid) from public, anon, authenticated, service_role;

create function public.marriage_family_contact(selected_request uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare member uuid:=marriage.require_member();
begin
  return (select c.phone from marriage.pact_family_contacts c join marriage.member_requests r on r.id=c.request_id
          where c.request_id=$1 and marriage.family_contact_allowed(r,member));
end $$;

create function public.marriage_share_family_contact(selected_request uuid, family_phone text, close_now boolean default false, allow_rematch boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare
  member uuid:=marriage.require_member();
  r marriage.member_requests;
  agreement jsonb;
  canonical text;
  deadline timestamptz;
begin
  select * into r from marriage.member_requests where id=$1 and member in (requester_id,recipient_id);
  if not found then raise exception 'التعارف غير متاح.' using errcode='42501'; end if;
  perform marriage.lock_member_pair(r.requester_id,r.recipient_id);
  select * into strict r from marriage.member_requests where id=$1 for update;
  if not coalesce(marriage.family_contact_allowed(r,member),false)
     or not exists(select from marriage.profiles where member_id=member and gender='woman') then
    raise exception 'مشاركة رقم الأهل غير متاحة.' using errcode='42501';
  end if;

  canonical:=translate(family_phone,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹ -','01234567890123456789');
  if family_phone is null or length(family_phone)>32 or canonical !~ '^(0|\+966|00966)(5[0-9]{8}|1[123467][0-9]{7})$' then
    raise exception 'أدخلي رقم جوال أو هاتف ثابت سعودي صحيح.' using errcode='22023';
  end if;
  canonical:='+966'||right(canonical,9);
  if exists(select from marriage.signup_phone_verifications v where v.user_id in (r.requester_id,r.recipient_id)
            and ltrim(v.phone,'+')=ltrim(canonical,'+'))
     or exists(select from auth.users u where u.id in (r.requester_id,r.recipient_id) and u.phone_confirmed_at is not null
               and ltrim(u.phone,'+')=ltrim(canonical,'+')) then
    raise exception 'أدخلي رقم الشخص من أهلك اللي ترغبين بالتواصل معه.' using errcode='22023';
  end if;

  if r.status<>'accepted' then
    if close_now is true and r.analytics_closed_by=member and exists(select from marriage.pact_family_contacts
       where request_id=$1 and phone=canonical) then return; end if;
    raise exception 'انتهى التعارف.' using errcode='42501';
  end if;
  if not marriage.compatible(r.requester_id,r.recipient_id) then raise exception 'التعارف غير متاح.' using errcode='42501'; end if;
  select a.data into agreement from marriage.conversation_agreements a where a.request_id=$1;
  if not found or coalesce(agreement->>'status','') not in ('accepted','family')
     or nullif(agreement->>'womanSignedAt','') is null or nullif(agreement->>'manSignedAt','') is null then
    raise exception 'مشاركة رقم الأهل متاحة بعد توقيع الميثاق.' using errcode='42501';
  end if;
  deadline:=(agreement->>'deadline')::timestamptz;
  if close_now is not true and (deadline is null or not isfinite(deadline) or deadline>clock_timestamp()) then
    raise exception 'تقدرين تشاركين الرقم عند انتهاء المدة أو عند إنهاء التعارف.' using errcode='42501';
  end if;
  insert into marriage.pact_family_contacts(request_id,phone) values($1,canonical)
    on conflict(request_id) do nothing;
  if not found then
    if not exists(select from marriage.pact_family_contacts c where c.request_id=$1 and c.phone=canonical) then
      raise exception 'سبق تأكيد رقم الأهل لهذا التعارف.' using errcode='22023';
    end if;
    if close_now is not true then return; end if;
  end if;
  if close_now then
    perform marriage.cancel_request($1,allow_rematch);
  else
    insert into marriage.notification_updates(member_id,request_id,event_key,target_id)
    values(case when member=r.requester_id then r.recipient_id else r.requester_id end,$1,'agreement:family_contact:'||$1,$1)
    on conflict(member_id,event_key) do nothing;
    perform realtime.send('{}','changed','marriage:member:'||r.requester_id::text,true);
    perform realtime.send('{}','changed','marriage:member:'||r.recipient_id::text,true);
  end if;
end $$;
revoke all on function public.marriage_family_contact(uuid),public.marriage_share_family_contact(uuid,text,boolean,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.marriage_family_contact(uuid),public.marriage_share_family_contact(uuid,text,boolean,boolean) to authenticated;

create function marriage.pact_exclusive(request_id uuid) returns boolean language sql stable set search_path='' as $$
  select count(*)=2 from marriage.exclusive_members e
  join marriage.exclusive_consents c using(request_id,member_id) where e.request_id=$1
$$;
revoke all on function marriage.pact_exclusive(uuid) from public,anon,authenticated,service_role;

-- Preserve agreement negotiation and the common history projection used for both list and single-item reads.
do $$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('marriage.agreement(uuid,text,jsonb)'::regprocedure);
  patched:=replace(definition,'return v;', $patch$
    return v||jsonb_build_object('exclusive',marriage.pact_exclusive($1),
      'hasFamilyContact',exists(select from marriage.pact_family_contacts c join marriage.member_requests r on r.id=c.request_id
        where c.request_id=$1 and marriage.family_contact_allowed(r,auth.uid())));$patch$);
  if patched=definition then raise exception 'Unexpected agreement return'; end if;
  execute patched;
  definition:=pg_get_functiondef('marriage.closed_introduction_row(marriage.member_requests,uuid)'::regprocedure);
  patched:=replace(definition,'''canRequestAgain'',', $patch$
    'hasFamilyContact',exists(select from marriage.pact_family_contacts c where c.request_id=r.id and marriage.family_contact_allowed(r,member)),
    'canRequestAgain',$patch$);
  if patched=definition then raise exception 'Unexpected history projection'; end if;
  execute patched;
  definition:=pg_get_functiondef('marriage.member_update_current(marriage.notification_updates)'::regprocedure);
  patched:=replace(definition,'when u.event_key like ''agreement:due:%''', $patch$
    when u.event_key like 'agreement:family_contact:%' then exists(
      select from marriage.pact_family_contacts c join marriage.member_requests r on r.id=c.request_id
      where c.request_id=u.request_id and r.status='accepted' and marriage.family_contact_allowed(r,u.member_id))
    when (u.event_key like 'agreement:due:%' or u.event_key like 'agreement:expired:%')
      and u.request_id is not null and marriage.pact_exclusive(u.request_id) then false
    when u.event_key like 'agreement:due:%'$patch$);
  if patched=definition then raise exception 'Unexpected agreement notice projection'; end if;
  execute patched;
  -- Include the availability flag on the existing private closure notice. The notification
  -- already links to this exact history row; its device push never includes contact details.
  definition:=pg_get_functiondef('marriage.read_notification_updates(uuid,text,uuid)'::regprocedure);
  patched:=replace(definition,'u.read_at is null as unread', $patch$u.read_at is null as unread,
    case when u.event_key like 'introduction:closed:%' and owner is not null then exists(
      select from marriage.pact_family_contacts c join marriage.member_requests r on r.id=c.request_id
      where c.request_id=u.target_id and marriage.family_contact_allowed(r,owner)) else false end as "hasFamilyContact"$patch$);
  if patched=definition then raise exception 'Unexpected notification projection'; end if;
  execute patched;
end $$;

-- Deadline notices already queued before the second signature must also disappear.
-- Gate schedules at the source and re-evaluate device jobs at delivery.
do $$
declare spec record; definition text; patched text;
begin
  for spec in select * from (values
    ('public.nisfayn_enqueue_deadline_reminders_before_updates()', 'where r.status=''accepted'' and a.data->>''status''=''accepted''', 'r.id'),
    ('public.nisfayn_enqueue_deadline_reminders_before_alert_feed()', 'where c.status=''accepted'' and a.data->>''status'' in (''accepted'',''expired'')', 'c.id'),
    ('public.nisfayn_enqueue_deadline_reminders()', 'where r.status=''accepted'' and a.data->>''status''=''accepted''', 'r.id')
  ) s(signature,guard,key) loop
    definition:=pg_get_functiondef(spec.signature::regprocedure);
    patched:=replace(definition,spec.guard,spec.guard||' and not marriage.pact_exclusive('||spec.key||')');
    if patched=definition then raise exception 'Unexpected deadline scheduler %',spec.signature; end if;
    execute patched;
  end loop;
  definition:=pg_get_functiondef('marriage.push_allowed(marriage.push_outbox)'::regprocedure);
  patched:=replace(definition,'if job.kind<>''update'' then', $patch$
    if job.request_id is not null and (job.event_key like 'deadline:%' or job.event_key like 'agreement:expired:%'
        or job.event_key like 'agreement:due:%') and marriage.pact_exclusive(job.request_id) then return false; end if;
    if job.kind<>'update' then$patch$);
  if patched=definition then raise exception 'Unexpected push eligibility function'; end if;
  execute patched;
end $$;

create or replace function marriage.agreement_allows_communication(request_id uuid) returns boolean
language plpgsql stable set search_path='' as $$
declare agreement jsonb; deadline timestamptz;
begin
  select a.data into agreement from marriage.conversation_agreements a where a.request_id=$1;
  if agreement->>'status'='family' then return true; end if;
  if agreement->>'status' is distinct from 'accepted' then return false; end if;
  begin deadline:=(agreement->>'deadline')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then return false; end;
  return coalesce(isfinite(deadline) and (deadline>now() or
    (nullif(agreement->>'womanSignedAt','') is not null and nullif(agreement->>'manSignedAt','') is not null and marriage.pact_exclusive($1))),false);
end $$;
