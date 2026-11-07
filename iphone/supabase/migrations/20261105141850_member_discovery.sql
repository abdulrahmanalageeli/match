-- Private, paid member discovery. Requests have their own lifecycle so a
-- unilateral request can never masquerade as a curated mutual introduction.
create table marriage.member_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references marriage.members(id) on delete cascade,
  recipient_id uuid not null references marriage.members(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
create unique index member_requests_pair on marriage.member_requests
  (least(requester_id,recipient_id), greatest(requester_id,recipient_id));
create index member_requests_out on marriage.member_requests(requester_id,status,updated_at desc);
create index member_requests_in on marriage.member_requests(recipient_id,status,updated_at desc);
create table marriage.thread_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references marriage.member_requests(id) on delete cascade,
  sender_id uuid not null references marriage.members(id) on delete cascade,
  client_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (request_id,sender_id,client_id)
);
create index thread_messages_timeline on marriage.thread_messages(request_id,created_at desc,id desc);
create index thread_messages_sender on marriage.thread_messages(sender_id);
alter table marriage.member_requests enable row level security;
alter table marriage.thread_messages enable row level security;
revoke all on marriage.member_requests, marriage.thread_messages from public, anon, authenticated;

-- A reason is earned only if both members selected what the other actually
-- described, or if the same catalogued interest occurs on both profiles.
create function marriage.match_evidence(a uuid, b uuid)
returns table (evidence_order integer, kind text, label text)
language sql stable set search_path='' as $$
  with dimensions(question, ordinal, reason) as (values
    ('conversation_initiative_preference',1,'يتوافق أسلوب كلٍّ منكما في بدء الحديث مع تفضيل الطرف الآخر.'),
    ('match_disagreement_style',2,'تفضيل كلٍّ منكما عند الاختلاف ينسجم مع أسلوب الطرف الآخر.')
  )
  select d.ordinal,'mutual'::text,d.reason
  from dimensions d
  join marriage.member_answers sa on sa.member_id=a and sa.question_code=d.question
  join marriage.member_answers pb on pb.member_id=b and pb.question_code='partner_'||d.question
    and pb.option_code=sa.option_code
  join marriage.member_answers sb on sb.member_id=b and sb.question_code=d.question
  join marriage.member_answers pa on pa.member_id=a and pa.question_code='partner_'||d.question
    and pa.option_code=sb.option_code
  union all
  select 100+i.position::integer,'interest','اهتمام مشترك: '||i.label
  from marriage.member_interests mine
  join marriage.member_interests theirs on theirs.member_id=b and theirs.interest_code=mine.interest_code
  join marriage.interests i on i.code=mine.interest_code
  where mine.member_id=a
$$;
create function marriage.match_metrics(a uuid, b uuid)
returns table (mutual_count integer, shared_count integer)
language sql stable set search_path='' as $$
  select count(*) filter (where kind='mutual')::integer, count(*) filter (where kind='interest')::integer
  from marriage.match_evidence(a,b)
$$;
create or replace function marriage.match_reasons(a uuid, b uuid) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(label order by evidence_order),
    '["تتوافق مدينتكما والفئة العمرية التي اختارها كلٌّ منكما."]'::jsonb)
  from marriage.match_evidence(a,b)
$$;
create function marriage.member_card(viewer uuid, subject uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.member_id,'alias',p.display_name,'age',p.age,
    'city',c.label,'occupation',p.profession,'bio',p.bio,
    'interests',marriage.interest_labels(subject),'reasons',marriage.match_reasons(viewer,subject))
  from marriage.profiles p join marriage.cities c on c.id=p.city_id where p.member_id=subject
$$;
-- Keep operator eligibility aligned with the paid discovery history. Future
-- assignments, including the first-subscription availability check, consult
-- the same canonical pair on both sides.
create or replace function marriage.can_offer(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
  select marriage.compatible(a,b) and not marriage.has_open(a) and not marriage.has_open(b)
    and not exists(select 1 from marriage.introductions where member_a=least(a,b) and member_b=greatest(a,b))
    and not exists(select 1 from marriage.member_requests r
      where least(r.requester_id,r.recipient_id)=least(a,b)
      and greatest(r.requester_id,r.recipient_id)=greatest(a,b))
$$;
create or replace function marriage.can_renew_relationship(target uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from marriage.introductions j where target in(j.member_a,j.member_b)
    and j.closed_at is null and marriage.compatible(target,case when target=j.member_a then j.member_b else j.member_a end))
    or exists(select 1 from marriage.member_requests r where target in(r.requester_id,r.recipient_id)
      and r.status in ('pending','accepted') and
      marriage.compatible(target,case when target=r.requester_id then r.recipient_id else r.requester_id end))
$$;
-- Keep founder shortlisting and member discovery on the same documented
-- ranking; operator email access remains limited to the service-role RPC.
create or replace function marriage.operator_candidates(target uuid) returns table(member_id uuid,email text)
language sql stable security definer set search_path='' as $$
  select p.member_id,u.email::text
  from marriage.profiles p
  join auth.users u on u.id=p.member_id
  cross join lateral marriage.match_metrics(target,p.member_id) metric
  where marriage.is_paid(target) and marriage.is_paid(p.member_id) and marriage.can_offer(target,p.member_id)
  order by metric.mutual_count desc,metric.shared_count desc,p.member_id limit 200
$$;
create function marriage.require_discovery_member() returns uuid
language plpgsql stable set search_path='' as $$
declare me uuid := marriage.require_member();
begin
  if not exists(select 1 from marriage.members m where m.id=me and m.review_status='approved'
    and not m.paused and not m.suspended and marriage.is_paid(me)) then
    raise exception 'الاكتشاف متاح للأعضاء المعتمدين ذوي الاشتراك الفعّال.' using errcode='42501';
  end if;
  return me;
end $$;
create function marriage.lock_member_pair(a uuid,b uuid) returns void
language plpgsql volatile set search_path='' as $$
begin
  perform 1 from marriage.members where id in (a,b) order by id for update;
end $$;

create function marriage.discover(min_age integer default null, max_age integer default null,
  interest text default null, after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid := marriage.require_discovery_member();
begin
  if coalesce(min_age,18)<18 or coalesce(max_age,110)>110 or coalesce(min_age,18)>coalesce(max_age,110) then
    raise exception 'تحقق من نطاق العمر.' using errcode='22023';
  end if;
  return (
    with eligible as materialized (
      select p.member_id,score.mutual_count,score.shared_count
      from marriage.profiles p
      cross join lateral marriage.match_metrics(me,p.member_id) score
      where p.member_id<>me and p.age between coalesce(min_age,18) and coalesce(max_age,110)
        and marriage.is_paid(p.member_id) and marriage.compatible(me,p.member_id)
        and (interest is null or exists(select 1 from marriage.member_interests mi
          where mi.member_id=p.member_id and mi.interest_code=interest))
    ), cards as (
      select e.* from eligible e
      where not exists(select 1 from marriage.member_requests r
        where least(r.requester_id,r.recipient_id)=least(me,e.member_id)
          and greatest(r.requester_id,r.recipient_id)=greatest(me,e.member_id))
        and not exists(select 1 from marriage.introductions i where
          i.member_a=least(me,e.member_id) and i.member_b=greatest(me,e.member_id))
        and (after_id is null or exists(select 1 from eligible prior where prior.member_id=after_id
          and (-e.mutual_count,-e.shared_count,e.member_id) >
              (-prior.mutual_count,-prior.shared_count,prior.member_id)))
      order by e.mutual_count desc,e.shared_count desc,e.member_id limit 24
    )
    select coalesce(jsonb_agg(marriage.member_card(me,member_id)
      order by mutual_count desc,shared_count desc,member_id),'[]'::jsonb) from cards
  );
end $$;

create function marriage.request_member(member_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); r marriage.member_requests; requested uuid;
begin
  if member_id is null or member_id=me then raise exception 'العضو غير متاح.' using errcode='42501'; end if;
  perform marriage.lock_member_pair(me,member_id);
  if not marriage.is_paid(me) or not marriage.is_paid(member_id) or not marriage.compatible(me,member_id) then
    raise exception 'العضو غير متاح.' using errcode='42501';
  end if;
  select * into r from marriage.member_requests x where
    least(x.requester_id,x.recipient_id)=least(me,member_id)
    and greatest(x.requester_id,x.recipient_id)=greatest(me,member_id);
  if found then
    if r.status in ('pending','accepted') then return r.id; end if;
    raise exception 'أُغلق هذا الطلب بالفعل.' using errcode='P0001';
  end if;
  if exists(select 1 from marriage.introductions i where
    i.member_a=least(me,member_id) and i.member_b=greatest(me,member_id)) then
    raise exception 'سبق ترشيح هذا العضو.' using errcode='P0001';
  end if;
  if (select count(*) from marriage.member_requests x where x.requester_id=me and x.status in ('pending','accepted'))>=5 then
    raise exception 'لديك خمسة طلبات مفتوحة.' using errcode='P0001';
  end if;
  insert into marriage.member_requests(requester_id,recipient_id) values(me,member_id) returning id into requested;
  return requested;
end $$;

create function marriage.inbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,
    'direction',case when r.requester_id=me then 'outgoing' else 'incoming' end,
    'person',marriage.member_card(me,p.peer)) order by r.updated_at desc,r.id),'[]'::jsonb)
    from marriage.member_requests r cross join lateral (select case when r.requester_id=me
      then r.recipient_id else r.requester_id end as peer) p
    where me in(r.requester_id,r.recipient_id) and r.status in ('pending','accepted')
      and marriage.is_paid(p.peer) and marriage.compatible(me,p.peer));
end $$;

create function marriage.close_member_requests() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.paused and not old.paused) or (new.suspended and not old.suspended)
      or (old.review_status='approved' and new.review_status<>'approved') then
    update marriage.member_requests set status='closed',updated_at=now()
    where new.id in(requester_id,recipient_id) and status in('pending','accepted');
  end if;
  return new;
end $$;
create trigger close_social_requests after update of paused,suspended,review_status on marriage.members
  for each row execute function marriage.close_member_requests();
create function marriage.close_blocked_requests() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update marriage.member_requests set status='closed',updated_at=now()
  where least(requester_id,recipient_id)=least(new.member_id,new.blocked_id)
    and greatest(requester_id,recipient_id)=greatest(new.member_id,new.blocked_id)
    and status in('pending','accepted');
  return new;
end $$;
create trigger close_blocked_social_requests after insert on marriage.blocks for each row
  execute function marriage.close_blocked_requests();
create function marriage.guard_curated_pair() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform marriage.lock_member_pair(new.member_a,new.member_b);
  if exists(select 1 from marriage.member_requests r where
    least(r.requester_id,r.recipient_id)=least(new.member_a,new.member_b)
    and greatest(r.requester_id,r.recipient_id)=greatest(new.member_a,new.member_b)) then
    raise exception 'يوجد طلب سابق بين العضوين.' using errcode='P0001';
  end if;
  return new;
end $$;
create trigger reject_duplicate_curated_pair before insert on marriage.introductions for each row
  execute function marriage.guard_curated_pair();

create function marriage.act_request(request_id uuid, action text, reason text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); r marriage.member_requests; peer uuid; target text;
begin
  select * into r from marriage.member_requests where id=request_id and me in(requester_id,recipient_id);
  if not found then raise exception 'الطلب غير متاح.' using errcode='42501'; end if;
  peer:=case when me=r.requester_id then r.recipient_id else r.requester_id end;
  perform marriage.lock_member_pair(me,peer);
  select * into strict r from marriage.member_requests where id=request_id for update;
  if action in ('block','report') then
    if action='report' then
      if length(btrim(coalesce(reason,''))) not between 3 and 500 then
        raise exception 'أدخل سبب البلاغ من ٣ إلى ٥٠٠ حرف.' using errcode='22023';
      end if;
      if not exists(select 1 from marriage.reports p where p.member_id=me and p.reported_id=peer) then
        insert into marriage.reports(member_id,reported_id,reason) values(me,peer,btrim(reason));
      end if;
    end if;
    insert into marriage.blocks(member_id,blocked_id) values(me,peer) on conflict do nothing;
    update marriage.member_requests set status='closed',updated_at=now() where id=request_id and status in ('pending','accepted');
    return true;
  end if;
  if not marriage.is_paid(me) or not marriage.is_paid(peer) or not marriage.compatible(me,peer) then
    raise exception 'الطلب غير متاح.' using errcode='42501';
  end if;
  case action
    when 'accept' then
      if me<>r.recipient_id then raise exception 'لا يمكنك قبول طلبك الخاص.' using errcode='42501'; end if;
      target:='accepted';
    when 'decline' then
      if me<>r.recipient_id then raise exception 'يمكن للمستلم الاعتذار فقط.' using errcode='42501'; end if;
      target:='declined';
    when 'cancel' then
      if me<>r.requester_id and r.status not in ('accepted','cancelled') then
        raise exception 'يمكن للمرسل إلغاء الطلب.' using errcode='42501';
      end if;
      target:='cancelled';
    else raise exception 'الإجراء غير معروف.' using errcode='22023';
  end case;
  if r.status=target then return true; end if;
  if r.status<>'pending' and not (r.status='accepted' and action='cancel') then
    raise exception 'لا يمكن تغيير حالة الطلب المغلق.' using errcode='P0001';
  end if;
  update marriage.member_requests set status=target,updated_at=now() where id=request_id;
  return true;
end $$;

create function marriage.thread(request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); r marriage.member_requests; peer uuid;
begin
  select * into r from marriage.member_requests where id=request_id and me in(requester_id,recipient_id);
  if not found or r.status<>'accepted' then raise exception 'المحادثة غير متاحة.' using errcode='42501'; end if;
  peer:=case when me=r.requester_id then r.recipient_id else r.requester_id end;
  if not marriage.is_paid(peer) or not marriage.compatible(me,peer) then raise exception 'المحادثة غير متاحة.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'senderIsMe',m.sender_id=me,
    'body',m.body,'createdAt',m.created_at) order by m.created_at,m.id),'[]'::jsonb)
    from (select t.* from marriage.thread_messages t where t.request_id=$1 order by t.created_at desc,t.id desc limit 200) m);
end $$;

create function marriage.message(request_id uuid, message_body text, client_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); r marriage.member_requests; prior marriage.thread_messages; peer uuid; sent uuid;
begin
  select * into r from marriage.member_requests where id=request_id and me in(requester_id,recipient_id);
  if not found then raise exception 'المحادثة غير متاحة.' using errcode='42501'; end if;
  peer:=case when r.requester_id=me then r.recipient_id else r.requester_id end;
  perform marriage.lock_member_pair(me,peer);
  select * into strict r from marriage.member_requests where id=request_id for update;
  if r.status<>'accepted' or not marriage.is_paid(me) or not marriage.is_paid(peer)
    or not marriage.compatible(me,peer) then raise exception 'المحادثة غير متاحة.' using errcode='42501'; end if;
  if client_id is null or length(btrim(coalesce(message_body,''))) not between 1 and 1000 then
    raise exception 'أدخل رسالة بين حرف و١٠٠٠ حرف.' using errcode='22023';
  end if;
  select * into prior from marriage.thread_messages t where t.request_id=$1 and t.sender_id=me and t.client_id=$3;
  if found then
    if prior.body<>btrim(message_body) then raise exception 'استُخدم معرّف الإرسال لرسالة أخرى.' using errcode='P0001'; end if;
    return prior.id;
  end if;
  insert into marriage.thread_messages(request_id,sender_id,client_id,body) values($1,me,$3,btrim(message_body)) returning id into sent;
  return sent;
end $$;

-- The exposed schema holds invoker wrappers only. Authenticated callers may
-- execute just these checked member operations, never the ranking/locking helpers.
create function public.marriage_discover(min_age integer default null, max_age integer default null,
  interest text default null, after_id uuid default null) returns jsonb language sql stable security invoker set search_path=''
  as $$ select marriage.discover($1,$2,$3,$4) $$;
create function public.marriage_inbox() returns jsonb language sql stable security invoker set search_path=''
  as $$ select marriage.inbox() $$;
create function public.marriage_request(member_id uuid) returns uuid language sql security invoker set search_path=''
  as $$ select marriage.request_member($1) $$;
create function public.marriage_act(request_id uuid, action text, reason text default null) returns boolean
  language sql security invoker set search_path='' as $$ select marriage.act_request($1,$2,$3) $$;
create function public.marriage_thread(request_id uuid) returns jsonb language sql stable security invoker set search_path=''
  as $$ select marriage.thread($1) $$;
create function public.marriage_message(request_id uuid,message_body text,client_id uuid) returns uuid
  language sql security invoker set search_path='' as $$ select marriage.message($1,$2,$3) $$;

revoke all on function marriage.match_evidence(uuid,uuid),marriage.match_metrics(uuid,uuid),
  marriage.match_reasons(uuid,uuid),marriage.member_card(uuid,uuid),marriage.require_discovery_member(),
  marriage.lock_member_pair(uuid,uuid),marriage.close_member_requests(),marriage.close_blocked_requests(),
  marriage.guard_curated_pair() from public, anon, authenticated;
revoke all on function marriage.discover(integer,integer,text,uuid),marriage.inbox(),
  marriage.request_member(uuid),marriage.act_request(uuid,text,text),marriage.thread(uuid),marriage.message(uuid,text,uuid),
  public.marriage_discover(integer,integer,text,uuid),public.marriage_inbox(),public.marriage_request(uuid),
  public.marriage_act(uuid,text,text),public.marriage_thread(uuid),public.marriage_message(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function marriage.discover(integer,integer,text,uuid),marriage.inbox(),
  marriage.request_member(uuid),marriage.act_request(uuid,text,text),marriage.thread(uuid),marriage.message(uuid,text,uuid),
  public.marriage_discover(integer,integer,text,uuid),public.marriage_inbox(),public.marriage_request(uuid),
  public.marriage_act(uuid,text,text),public.marriage_thread(uuid),public.marriage_message(uuid,text,uuid)
  to authenticated;
