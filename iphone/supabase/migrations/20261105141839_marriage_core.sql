-- Dedicated project for the marriage app. No imports from the events database.
create schema marriage;
revoke all on schema marriage from public, anon, authenticated, service_role;
grant usage on schema marriage to authenticated, service_role;
alter default privileges in schema marriage revoke execute on functions from public;
alter default privileges in schema marriage revoke all on tables from public, anon, authenticated, service_role;

create table marriage.members (
  id uuid primary key references auth.users(id) on delete cascade,
  app_account_token uuid not null unique default gen_random_uuid(),
  review_status text not null default 'draft' check (review_status in ('draft','pending','approved')),
  paused boolean not null default false,
  suspended boolean not null default false,
  joined_at timestamptz not null default now()
);
create table marriage.cities (
  id uuid primary key default gen_random_uuid(), label text not null unique check(length(label) between 1 and 80)
);
create table marriage.profiles (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  display_name text not null check(length(display_name) between 1 and 60),
  age smallint not null check(age between 18 and 110),
  gender text not null check(gender in ('woman','man')),
  city_id uuid not null references marriage.cities(id),
  profession text not null check(length(profession) between 1 and 100),
  bio text not null check(length(bio) between 1 and 1200)
);
create index profiles_match_filter on marriage.profiles(city_id,gender,age);
create table marriage.preferences (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  min_age smallint not null check(min_age between 18 and 110),
  max_age smallint not null check(max_age between min_age and 110),
  family_preference text not null check(length(family_preference)<=180)
);
create table marriage.contacts (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  contact_value text not null check(length(contact_value) between 1 and 180)
);
create table marriage.interests (
  code text primary key, label text not null unique, position smallint not null unique
);
create table marriage.member_interests (
  member_id uuid not null references marriage.members(id) on delete cascade,
  interest_code text not null references marriage.interests(code),
  primary key(member_id,interest_code)
);
create index member_interests_reverse on marriage.member_interests(interest_code,member_id);
create table marriage.questions (
  code text primary key, label text not null, position smallint not null unique
);
create table marriage.question_options (
  question_code text not null references marriage.questions(code),
  code text not null, label text not null, position smallint not null,
  primary key(question_code,code), unique(question_code,position)
);
create table marriage.member_answers (
  member_id uuid not null references marriage.members(id) on delete cascade,
  question_code text not null, option_code text not null,
  primary key(member_id,question_code),
  foreign key(question_code,option_code) references marriage.question_options(question_code,code)
);
create index answers_by_option on marriage.member_answers(question_code,option_code);
create table marriage.consent_versions (version text primary key);
insert into marriage.consent_versions values ('2026-11-05');
create table marriage.consents (
  id bigint generated always as identity primary key,
  member_id uuid not null references marriage.members(id) on delete cascade,
  version text not null references marriage.consent_versions(version), recorded_at timestamptz not null default now()
);
create index consents_member_version on marriage.consents(member_id,version);
create table marriage.reviews (
  id bigint generated always as identity primary key,
  member_id uuid not null references marriage.members(id) on delete cascade,
  action text not null check(action in ('submit','approve','suspend')),
  recorded_at timestamptz not null default now()
);
create index reviews_by_member on marriage.reviews(member_id,recorded_at);
create table marriage.subscription_owners (
  original_id text primary key check(length(original_id) between 1 and 100),
  member_id uuid not null references marriage.members(id) on delete cascade
);
create index subscription_owner_member on marriage.subscription_owners(member_id);
create table marriage.store_transactions (
  transaction_id text primary key check(length(transaction_id) between 1 and 100),
  original_id text not null references marriage.subscription_owners(original_id) on delete cascade,
  expires_at timestamptz not null, signed_at timestamptz not null, revoked boolean not null,
  environment text not null check(environment in ('Sandbox','Production'))
);
create index store_transactions_entitlement on marriage.store_transactions(original_id,expires_at desc) where not revoked;
create table marriage.introductions (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references marriage.members(id) on delete cascade,
  member_b uuid not null references marriage.members(id) on delete cascade,
  created_at timestamptz not null default now(), closed_at timestamptz,
  check(member_a<member_b), unique(member_a,member_b)
);
create index introductions_by_b on marriage.introductions(member_b);
create index open_intros_a on marriage.introductions(member_a) where closed_at is null;
create index open_intros_b on marriage.introductions(member_b) where closed_at is null;
create table marriage.introduction_decisions (
  introduction_id uuid not null references marriage.introductions(id) on delete cascade,
  member_id uuid not null references marriage.members(id) on delete cascade,
  accepted_at timestamptz not null default now(), primary key(introduction_id,member_id)
);
create index decisions_by_member on marriage.introduction_decisions(member_id);
create table marriage.blocks (
  member_id uuid not null references marriage.members(id) on delete cascade,
  blocked_id uuid not null references marriage.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(member_id<>blocked_id), primary key(member_id,blocked_id)
);
create index blocks_by_target on marriage.blocks(blocked_id,member_id);
create table marriage.reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references marriage.members(id) on delete cascade,
  reported_id uuid not null references marriage.members(id) on delete cascade,
  reason text not null check(length(reason) between 3 and 1000),
  created_at timestamptz not null default now(), resolved_at timestamptz,
  check(member_id<>reported_id), unique(member_id,reported_id)
);
create index reports_by_target on marriage.reports(reported_id);

insert into marriage.interests values
 ('reading','القراءة',1),('cooking','الطبخ',2),('walking','المشي',3),('travel','السفر',4),
 ('photography','التصوير',5),('board_games','الألعاب اللوحية',6),('museums','المتاحف',7),('creative_writing','الكتابة الإبداعية',8);
insert into marriage.questions values
 ('conversation_initiative_preference','كيف تبدأ الحديث عادةً؟',1),
 ('partner_conversation_initiative_preference','كيف تفضّل أن يبدأ الطرف الآخر الحديث؟',2),
 ('match_disagreement_style','كيف تتعامل مع الاختلاف؟',3),
 ('partner_match_disagreement_style','كيف تفضّل أن يتعامل الطرف الآخر مع الاختلاف؟',4);
insert into marriage.question_options
 select q.code,v.code,v.label,v.position from marriage.questions q
 cross join(values ('A','أتفاعل عندما يبدأ الآخر',1),('B','نتبادل المبادرة',2),('C','أبادر بفتح الحديث',3),('D','أبادر إذا طال الصمت',4)) v(code,label,position)
 where q.position<=2;
insert into marriage.question_options
 select q.code,v.code,v.label,v.position from marriage.questions q
 cross join(values ('A','مناقشة الحجج',1),('B','فهم أسباب الاختلاف',2),('C','تلطيف الأجواء بالمزاح',3),('D','الانتقال إلى أرضية مشتركة',4)) v(code,label,position)
 where q.position>2;

-- Every row-bearing table is private and denies direct API access, including
-- through PostgREST. Only the narrowly granted RPCs below return member data.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='marriage' loop
  execute format('alter table marriage.%I enable row level security', t.tablename);
 end loop;
end $$;
revoke all on all tables in schema marriage from public,anon,authenticated,service_role;
revoke all on all sequences in schema marriage from public,anon,authenticated,service_role;
create function marriage.on_signup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into marriage.members(id) values (new.id);
 return new;
end $$;
create trigger marriage_auth_signup after insert on auth.users for each row execute function marriage.on_signup();
insert into marriage.members(id) select id from auth.users on conflict do nothing;

-- Revalidate the session row, not just the JWT. Sign-out/deletion takes effect
-- immediately for private reads and writes even if the JWT has not yet expired.
create function marriage.require_member() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if not exists (select 1 from auth.users u join marriage.members m on m.id=u.id
   join auth.sessions s on s.user_id=u.id
   where u.id=uid and u.email is not null and u.email_confirmed_at is not null
   and s.id=(auth.jwt()->>'session_id')::uuid and (s.not_after is null or s.not_after>now())) then
   raise exception 'يلزم تسجيل الدخول بحساب مؤكد.' using errcode='42501';
 end if;
 return uid;
end $$;

create function marriage.is_paid(target uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.subscription_owners o join marriage.store_transactions t using(original_id)
 where o.member_id=target and not t.revoked and t.expires_at>now())
$$;
create function marriage.compatible(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.members x join marriage.profiles p on p.member_id=x.id
 join marriage.preferences xp on xp.member_id=x.id
 join marriage.members y on y.id=b join marriage.profiles q on q.member_id=y.id join marriage.preferences yp on yp.member_id=y.id
 where x.id=a and x.id<>y.id and x.review_status='approved' and y.review_status='approved'
 and not(x.paused or y.paused or x.suspended or y.suspended)
 and p.gender<>q.gender and p.city_id=q.city_id and p.age between yp.min_age and yp.max_age and q.age between xp.min_age and xp.max_age
 and not exists(select 1 from marriage.blocks z where (z.member_id=a and z.blocked_id=b) or (z.member_id=b and z.blocked_id=a)))
$$;
create function marriage.has_open(target uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.introductions where closed_at is null and target in(member_a,member_b))
$$;
create function marriage.can_offer(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.compatible(a,b) and not marriage.has_open(a) and not marriage.has_open(b)
 and not exists(select 1 from marriage.introductions where member_a=least(a,b) and member_b=greatest(a,b))
$$;
create function marriage.can_renew_relationship(target uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.introductions i where target in(i.member_a,i.member_b) and closed_at is null
 and marriage.compatible(target,case when target=i.member_a then i.member_b else i.member_a end))
$$;

create function marriage.profile_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('displayName',p.display_name,'age',p.age,'gender',p.gender,'city',c.label,
 'profession',p.profession,'bio',p.bio,'contact',ct.contact_value,'preferredMinAge',pref.min_age,
 'preferredMaxAge',pref.max_age,'familyPreference',pref.family_preference,
 'interestIds',coalesce((select jsonb_agg(i.interest_code order by i.interest_code) from marriage.member_interests i where i.member_id=p.member_id),'[]'::jsonb),
 'surveyAnswers',coalesce((select jsonb_object_agg(a.question_code,a.option_code) from marriage.member_answers a where a.member_id=p.member_id),'{}'::jsonb))
 from marriage.profiles p join marriage.cities c on p.city_id=c.id
 join marriage.preferences pref using(member_id) join marriage.contacts ct using(member_id)
 where p.member_id=target
$$;
create function marriage.interest_labels(target uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(i.label order by i.position),'[]'::jsonb) from marriage.member_interests m join marriage.interests i on i.code=m.interest_code where m.member_id=target
$$;
-- Refined by the discovery migration using the event's bilateral answer dimensions.
create function marriage.match_reasons(a uuid,b uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg('اهتمام مشترك: '||i.label order by i.position),'[]'::jsonb)
 from marriage.member_interests x join marriage.member_interests y on y.interest_code=x.interest_code
 join marriage.interests i on i.code=x.interest_code where x.member_id=a and y.member_id=b
$$;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb; expiry timestamptz; paid boolean; intro jsonb;
begin
 select max(t.expires_at) into expiry from marriage.store_transactions t join marriage.subscription_owners o using(original_id) where o.member_id=target and not t.revoked;
 paid:=coalesce(expiry>now(),false);
 if paid then
  select jsonb_build_object('id',j.id,
    'status',case when me.member_id is not null and them.member_id is not null then 'mutual' when me.member_id is not null then 'waiting' else 'proposed' end,
    'person',jsonb_build_object('displayName',p.display_name,'age',p.age,'city',c.label,'profession',p.profession,'bio',p.bio,
      'familyPreference',f.family_preference,'interests',marriage.interest_labels(p.member_id)),
   'reasons',marriage.match_reasons(target,p.member_id),
   'contact',case when me.member_id is not null and them.member_id is not null then ct.contact_value end)
  into intro from marriage.introductions j
  join marriage.profiles p on p.member_id=case when target=j.member_a then j.member_b else j.member_a end
  join marriage.cities c on c.id=p.city_id join marriage.preferences f on f.member_id=p.member_id
  join marriage.contacts ct on ct.member_id=p.member_id
  left join marriage.introduction_decisions me on me.introduction_id=j.id and me.member_id=target
  left join marriage.introduction_decisions them on them.introduction_id=j.id and them.member_id=p.member_id
  where target in(j.member_a,j.member_b) and j.closed_at is null and marriage.compatible(target,p.member_id) and marriage.is_paid(p.member_id)
  order by j.created_at desc limit 1;
 end if;
 select jsonb_build_object('user',jsonb_build_object('id',m.id,'email',u.email,'applicationStatus',m.review_status,'appAccountToken',m.app_account_token,'paused',m.paused),
 'profile',marriage.profile_json(target),'membership',jsonb_build_object('active',paid,'expiresAt',expiry,'canStart',not paid and (marriage.can_renew_relationship(target) or exists(select 1 from marriage.profiles p where marriage.can_offer(target,p.member_id)))),
 'introduction',intro) into result from marriage.members m join auth.users u on u.id=m.id where m.id=target;
 return result;
end $$;

create function marriage.state_for_self() returns jsonb language sql stable security definer set search_path='' as $$
 select marriage.member_state(marriage.require_member())
$$;
create function public.marriage_state() returns jsonb language sql stable security invoker set search_path='' as $$
 select marriage.state_for_self()
$$;
create function marriage.catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform marriage.require_member();
 return jsonb_build_object('interests',(select jsonb_agg(jsonb_build_object('id',code,'label',label) order by position) from marriage.interests),
 'questions',(select jsonb_agg(jsonb_build_object('id',q.code,'label',q.label,'options',
 (select jsonb_agg(jsonb_build_object('id',o.code,'label',o.label) order by o.position) from marriage.question_options o where o.question_code=q.code)) order by q.position) from marriage.questions q));
end $$;
create function public.marriage_catalog() returns jsonb language sql stable security invoker set search_path='' as $$select marriage.catalog()$$;

create function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 id_self uuid:=marriage.require_member(); previous jsonb; normalized jsonb; choices jsonb; answers jsonb;
 city uuid; old_status text; is_suspended boolean; changed boolean; version text:='2026-11-05';
begin
 select review_status,suspended into old_status,is_suspended from marriage.members where id=id_self for update;
 if is_suspended then raise exception 'الحساب قيد مراجعة البلاغات.' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'consentVersion' is distinct from version then
  raise exception 'يلزم الاطّلاع على سياسة الخصوصية الحالية والموافقة عليها.' using errcode='22023';
 end if;
 previous:=marriage.profile_json(id_self);
 choices:=coalesce(payload->'interestIds',previous->'interestIds','[]'::jsonb);
 answers:=coalesce(payload->'surveyAnswers',previous->'surveyAnswers','{}'::jsonb);
 if jsonb_typeof(choices) is distinct from 'array' or jsonb_typeof(answers) is distinct from 'object' then
  raise exception 'صيغة الاهتمامات أو الإجابات غير صالحة.' using errcode='22023';
 end if;
 if jsonb_array_length(choices)>3 or (select count(*)<>count(distinct v) from jsonb_array_elements_text(choices) v)
 or exists(select 1 from jsonb_array_elements_text(choices) i(code) where not exists(select 1 from marriage.interests c where c.code=i.code))
 or exists(select 1 from jsonb_each_text(answers) a where not exists(select 1 from marriage.question_options o where o.question_code=a.key and o.code=a.value)) then
  raise exception 'تحقق من الاهتمامات والإجابات المختارة.' using errcode='22023';
 end if;
 normalized:=jsonb_build_object('displayName',btrim(payload->>'displayName'),'age',(payload->>'age')::smallint,
  'gender',payload->>'gender','city',btrim(payload->>'city'),'profession',btrim(payload->>'profession'),
  'bio',btrim(payload->>'bio'),'contact',btrim(payload->>'contact'),'preferredMinAge',coalesce((payload->>'preferredMinAge')::smallint,18),
  'preferredMaxAge',coalesce((payload->>'preferredMaxAge')::smallint,110),'familyPreference',btrim(coalesce(payload->>'familyPreference','')),
  'interestIds',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(choices) v),'[]'::jsonb),'surveyAnswers',answers);
 changed:=previous is distinct from normalized;
 if changed then
  insert into marriage.cities(label) values (normalized->>'city') on conflict(label) do nothing;
  select c.id into strict city from marriage.cities c where label=normalized->>'city';
  insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio)
   values(id_self,normalized->>'displayName',(normalized->>'age')::smallint,normalized->>'gender',city,normalized->>'profession',normalized->>'bio')
   on conflict(member_id) do update set display_name=excluded.display_name,age=excluded.age,gender=excluded.gender,city_id=excluded.city_id,
    profession=excluded.profession,bio=excluded.bio;
  insert into marriage.preferences values(id_self,(normalized->>'preferredMinAge')::smallint,(normalized->>'preferredMaxAge')::smallint,normalized->>'familyPreference')
   on conflict(member_id) do update set min_age=excluded.min_age,max_age=excluded.max_age,family_preference=excluded.family_preference;
  insert into marriage.contacts values(id_self,normalized->>'contact') on conflict(member_id) do update set contact_value=excluded.contact_value;
  delete from marriage.member_interests where member_id=id_self;
  insert into marriage.member_interests select id_self,v from jsonb_array_elements_text(choices) v;
  delete from marriage.member_answers where member_id=id_self;
  insert into marriage.member_answers select id_self,key,value from jsonb_each_text(answers);
  update marriage.introductions set closed_at=now() where closed_at is null and id_self in(member_a,member_b);
 end if;
 if changed or old_status<>'approved' then
  update marriage.members set review_status='pending' where id=id_self;
  insert into marriage.reviews(member_id,action) values(id_self,'submit');
 end if;
 insert into marriage.consents(member_id,version) values(id_self,version);
 return marriage.member_state(id_self);
end $$;
create function public.marriage_apply(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select marriage.apply_profile(payload)
$$;

create function marriage.set_pause(paused boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if paused is null then raise exception 'اختر حالة البحث.' using errcode='22023'; end if;
 update marriage.members set paused=$1 where id=me;
 if paused then update marriage.introductions set closed_at=now() where closed_at is null and me in(member_a,member_b); end if;
 return marriage.member_state(me);
end $$;
create function public.marriage_pause(paused boolean) returns jsonb language sql security invoker set search_path='' as $$select marriage.set_pause(paused)$$;

create function marriage.respond(proposal_id uuid,decision text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); intro marriage.introductions; peer uuid;
begin
 select * into intro from marriage.introductions where id=proposal_id and me in(member_a,member_b);
 if not found then raise exception 'الترشيح غير متاح.' using errcode='42501'; end if;
 -- Same lock order as assignment and the community request endpoints.
 perform 1 from marriage.members where id in(intro.member_a,intro.member_b) order by id for update;
 select * into strict intro from marriage.introductions where id=proposal_id for update;
 peer:=case when intro.member_a=me then intro.member_b else intro.member_a end;
 if decision='accept' then
  if intro.closed_at is not null or not marriage.compatible(me,peer) or not marriage.is_paid(me) or not marriage.is_paid(peer) then
   raise exception 'الترشيح غير متاح.' using errcode='42501';
  end if;
  insert into marriage.introduction_decisions(introduction_id,member_id) values(proposal_id,me) on conflict do nothing;
 elsif decision in ('pass','block','report') then
  if decision in ('block','report') then
    insert into marriage.blocks(member_id,blocked_id) values(me,peer) on conflict do nothing;
  end if;
  if decision='report' then
    insert into marriage.reports(member_id,reported_id,reason) values(me,peer,btrim(reason)) on conflict(member_id,reported_id) do nothing;
  end if;
  update marriage.introductions set closed_at=coalesce(closed_at,now()) where id=proposal_id;
 else raise exception 'اختر إجراءً صالحًا.' using errcode='22023';
 end if;
 return marriage.member_state(me);
end $$;
create function public.marriage_respond(proposal_id uuid,decision text,reason text default null) returns jsonb language sql security invoker set search_path='' as $$
 select marriage.respond(proposal_id,decision,reason)
$$;
create function marriage.review_member(target uuid,action text) returns void language plpgsql security definer set search_path='' as $$
declare m marriage.members;
begin
 select * into strict m from marriage.members where id=target for update;
 if action='approve' then
  if m.review_status<>'pending' or not exists(select 1 from marriage.consents c where c.member_id=target and c.version='2026-11-05') then
    raise exception 'الطلب غير جاهز للمراجعة.' using errcode='22023';
  end if;
  update marriage.members set review_status='approved',suspended=false where id=target;
 elsif action='suspend' then
  update marriage.members set review_status=case when review_status='draft' then 'draft' else 'pending' end,suspended=true where id=target;
  update marriage.introductions set closed_at=now() where closed_at is null and target in(member_a,member_b);
 else raise exception 'قرار المراجعة غير صالح.' using errcode='22023'; end if;
 insert into marriage.reviews(member_id,action) values(target,action);
end $$;
create function public.marriage_review(member_id uuid,action text) returns void language sql security invoker set search_path='' as $$select marriage.review_member(member_id,action)$$;

create function marriage.assign(a uuid,b uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform 1 from marriage.members where id in(a,b) order by id for update;
 if not marriage.can_offer(a,b) or not marriage.is_paid(a) or not marriage.is_paid(b) then
  raise exception 'العضوان غير متاحين لترشيح جديد.' using errcode='22023';
 end if;
 insert into marriage.introductions(member_a,member_b) values(least(a,b),greatest(a,b)) returning id into result;
 return result;
end $$;
create function public.marriage_assign(a uuid,b uuid) returns uuid language sql security invoker set search_path='' as $$select marriage.assign(a,b)$$;

-- Called only by the Edge Function AFTER Apple's cryptographic verification.
-- A member RPC never accepts decoded transaction JSON or client entitlement flags.
create function marriage.record_receipt(actor uuid,receipt jsonb,notification boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target marriage.members; orig text:=receipt->>'originalTransactionId'; tx text:=receipt->>'transactionId';
 expiry timestamptz:=to_timestamp((receipt->>'expiresDate')::numeric/1000);
 signed_time timestamptz:=to_timestamp((receipt->>'signedDate')::numeric/1000);
 is_revoked boolean:=(receipt->>'revocationDate' is not null or coalesce((receipt->>'isUpgraded')::boolean,false));
begin
 if receipt->>'bundleId' is distinct from 'com.blindmatch.marriage' or receipt->>'productId' is distinct from 'com.blindmatch.marriage.monthly'
 or coalesce(receipt->>'environment','') not in ('Sandbox','Production') or nullif(orig,'') is null or nullif(tx,'') is null
 or expiry is null or signed_time is null then raise exception 'اشتراك Apple غير صالح.' using errcode='22023'; end if;
 select * into target from marriage.members where app_account_token=(receipt->>'appAccountToken')::uuid for update;
 if target.id is null and notification then return null; end if;
 if target.id is null or (not notification and (actor is distinct from target.id or target.review_status<>'approved' or target.suspended)) then
  raise exception 'تعذّر ربط الاشتراك بهذا الحساب.' using errcode='42501';
 end if;
 insert into marriage.subscription_owners(original_id,member_id) values(orig,target.id) on conflict do nothing;
 if not exists(select 1 from marriage.subscription_owners where original_id=orig and member_id=target.id)
 or exists(select 1 from marriage.store_transactions where transaction_id=tx and original_id<>orig) then
  raise exception 'الاشتراك مرتبط بحساب آخر.' using errcode='42501';
 end if;
 insert into marriage.store_transactions(transaction_id,original_id,expires_at,signed_at,revoked,environment)
 values(tx,orig,expiry,signed_time,is_revoked,receipt->>'environment')
 on conflict(transaction_id) do update set expires_at=excluded.expires_at,signed_at=excluded.signed_at,revoked=excluded.revoked
 where marriage.store_transactions.original_id=excluded.original_id and
 (excluded.signed_at>marriage.store_transactions.signed_at or (excluded.signed_at=marriage.store_transactions.signed_at and excluded.revoked));
 return marriage.member_state(target.id);
end $$;
create function public.marriage_record_receipt(actor uuid,receipt jsonb,notification boolean default false) returns jsonb language sql security invoker set search_path='' as $$
 select marriage.record_receipt(actor,receipt,notification)
$$;
create function marriage.review_queue() returns table(member_id uuid,email text,display_name text,age smallint)
language sql stable security definer set search_path='' as $$
 select m.id,u.email::text,p.display_name,p.age from marriage.members m join auth.users u on u.id=m.id join marriage.profiles p on p.member_id=m.id
 where m.review_status='pending' and not m.suspended order by m.joined_at,m.id limit 200
$$;
create function public.marriage_review_queue() returns table(member_id uuid,email text,display_name text,age smallint)
language sql stable security invoker set search_path='' as $$select * from marriage.review_queue()$$;
create function marriage.operator_candidates(target uuid) returns table(member_id uuid,email text)
language sql stable security definer set search_path='' as $$
 select p.member_id,u.email::text from marriage.profiles p join auth.users u on u.id=p.member_id
 where marriage.is_paid(target) and marriage.is_paid(p.member_id) and marriage.can_offer(target,p.member_id)
 order by p.member_id limit 200
$$;
create function public.marriage_candidates(member_id uuid) returns table(member_id_out uuid,email text)
language sql stable security invoker set search_path='' as $$select * from marriage.operator_candidates(member_id)$$;

-- The private routines below are the ONLY functions intentionally callable by
-- each API role; wrapper functions are SECURITY INVOKER with no ambient grants.
revoke all on all functions in schema marriage from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('marriage_state','marriage_apply','marriage_pause','marriage_respond','marriage_catalog','marriage_review','marriage_assign','marriage_record_receipt','marriage_review_queue','marriage_candidates') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
end $$;
grant execute on function marriage.state_for_self(),marriage.apply_profile(jsonb),marriage.set_pause(boolean),
 marriage.respond(uuid,text,text),marriage.catalog(),
 public.marriage_state(),public.marriage_apply(jsonb),public.marriage_pause(boolean),public.marriage_respond(uuid,text,text),
 public.marriage_catalog() to authenticated;
grant execute on function marriage.review_member(uuid,text),marriage.assign(uuid,uuid),marriage.record_receipt(uuid,jsonb,boolean),
 marriage.review_queue(),marriage.operator_candidates(uuid),
 public.marriage_review(uuid,text),public.marriage_assign(uuid,uuid),public.marriage_record_receipt(uuid,jsonb,boolean),
 public.marriage_review_queue(),public.marriage_candidates(uuid) to service_role;


