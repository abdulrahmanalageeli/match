-- Private, account-scoped help for members and family accounts, including users
-- who cannot yet access paid discovery. No profile or message data is attached.
create table marriage.support_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  category text not null check(category in ('help','access','billing','safety')),
  subject text not null check(length(subject) between 3 and 140),
  body text not null check(length(body) between 5 and 3000),
  status text not null default 'open' check(status in ('open','in_review','resolved')),
  response text check(length(response) between 3 and 3000),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,client_id)
);
create index support_requests_owner_page on marriage.support_requests(owner_id,created_at desc,id desc);
create index support_requests_queue on marriage.support_requests(status,created_at desc,id desc);
create table marriage.support_actions (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references marriage.support_requests(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  fingerprint jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique(actor_id,request_id)
);
alter table marriage.support_requests enable row level security;
alter table marriage.support_actions enable row level security;
revoke all on marriage.support_requests,marriage.support_actions from public,anon,authenticated,service_role;
revoke all on sequence marriage.support_actions_id_seq from public,anon,authenticated,service_role;

create function marriage.support_summary(t marriage.support_requests) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',t.id,'category',t.category,'subject',t.subject,'body',t.body,
    'status',t.status,'response',t.response,'revision',t.revision,'createdAt',t.created_at,'updatedAt',t.updated_at)
$$;

create function marriage.support(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
<<support>>
declare
  me uuid:=marriage.staff_identity(); t marriage.support_requests; previous marriage.support_actions;
  staff marriage.staff_accounts; result jsonb; entries jsonb; boundary marriage.support_requests;
  category text; subject text; body text; status text; response text; client_id uuid; request_id uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'طلب غير صالح.' using errcode='22023'; end if;
  if action='create' then
    category:=payload->>'category'; subject:=btrim(payload->>'subject'); body:=btrim(payload->>'body'); client_id:=(payload->>'clientId')::uuid;
    if client_id is null or category is null or category not in ('help','access','billing','safety')
      or subject is null or length(subject) not between 3 and 140 or body is null or length(body) not between 5 and 3000 then
      raise exception 'أكمل نوع الطلب والموضوع والتفاصيل ضمن الحدود الموضحة.' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('support:'||me::text,0));
    select * into t from marriage.support_requests s where s.owner_id=me and s.client_id=support.client_id;
    if found then
      if t.category<>category or t.subject<>subject or t.body<>body then raise exception 'معرّف الطلب مستخدم لتفاصيل أخرى.' using errcode='22023'; end if;
      return marriage.support_summary(t);
    end if;
    if (select count(*) from marriage.support_requests s where s.owner_id=me and s.created_at>now()-interval '24 hours')>=5 then
      raise exception 'لديك خمسة طلبات خلال آخر ٢٤ ساعة. تابع ردودها هنا أو أعد المحاولة لاحقًا.' using errcode='P0001';
    end if;
    insert into marriage.support_requests(owner_id,client_id,category,subject,body)
      values(me,client_id,category,subject,body) returning * into t;
    return marriage.support_summary(t);
  elsif action in ('list','admin_list') then
    if action='admin_list' then
      staff:=marriage.require_staff(array['owner','moderator']);
      status:=coalesce(payload->>'status','open');
      if status not in ('all','open','in_review','resolved') then raise exception 'حالة غير صالحة.' using errcode='22023'; end if;
    end if;
    if nullif(payload->>'before','') is not null then
      select * into boundary from marriage.support_requests s where s.id=(payload->>'before')::uuid and (action='admin_list' or s.owner_id=me);
      if not found then raise exception 'تعذّر متابعة القائمة. حدّث الطلبات.' using errcode='22023'; end if;
    end if;
    select coalesce(jsonb_agg(row.item order by row.created_at desc,row.id desc),'[]') into entries from (
      select s.id,s.created_at,marriage.support_summary(s) || case when action='admin_list' then jsonb_build_object('ownerId',s.owner_id) else '{}'::jsonb end as item
      from marriage.support_requests s
      where (action='admin_list' or s.owner_id=me) and (action='list' or support.status='all' or s.status=support.status)
        and (boundary.id is null or (s.created_at,s.id)<(boundary.created_at,boundary.id))
      order by s.created_at desc,s.id desc limit 50
    ) row;
    return jsonb_build_object('items',entries,'nextCursor',case when jsonb_array_length(entries)=50 then entries->49->>'id' else null end);
  elsif action='admin_reply' then
    staff:=marriage.require_staff(array['owner','moderator']);
    request_id:=(payload->>'requestId')::uuid;
    status:=payload->>'status'; response:=btrim(payload->>'response');
    if request_id is null or status is null or status not in ('in_review','resolved') or response is null or length(response) not between 3 and 3000 then
      raise exception 'أدخل ردًا واضحًا وحالة صالحة.' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('support-staff:'||me::text,0));
    select * into previous from marriage.support_actions a where a.actor_id=me and a.request_id=support.request_id;
    if found then
      if previous.fingerprint<>payload then raise exception 'معرّف الإجراء مستخدم لقرار آخر.' using errcode='22023'; end if;
      return previous.result;
    end if;
    select * into t from marriage.support_requests s where s.id=(payload->>'id')::uuid for update;
    if not found then raise exception 'الطلب غير متاح.' using errcode='22023'; end if;
    if t.revision is distinct from (payload->>'revision')::bigint then raise exception 'تغيّر الطلب. حدّث القائمة قبل الرد.' using errcode='40001'; end if;
    update marriage.support_requests s set status=support.status,response=support.response,revision=s.revision+1,updated_at=now() where s.id=t.id returning * into t;
    result:=marriage.support_summary(t)||jsonb_build_object('ownerId',t.owner_id);
    insert into marriage.support_actions(ticket_id,actor_id,request_id,fingerprint,result) values(t.id,me,request_id,payload,result);
    return result;
  end if;
  raise exception 'إجراء غير متاح.' using errcode='22023';
end $$;

create function public.marriage_support(action text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select marriage.support(action,payload) $$;
revoke all on function marriage.support_summary(marriage.support_requests),marriage.support(text,jsonb),public.marriage_support(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.support(text,jsonb),public.marriage_support(text,jsonb) to authenticated;
