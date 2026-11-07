-- Family Bridge lives outside matching profiles and private couple conversations.
-- Relationship labels are declarations, never proof of legal guardianship.
create table marriage.family_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(btrim(display_name)) between 2 and 60),
 consent_version text not null check(consent_version='family-v1'),
 consented_at timestamptz not null default now(), created_at timestamptz not null default now(),
 link_attempt_window timestamptz not null default now(), link_attempts integer not null default 0
);
create table marriage.family_links (
 id uuid primary key default gen_random_uuid(), member_key text not null,
 member_id uuid references marriage.members(id) on delete cascade,
 test_actor text references marriage.admin_test_members(actor) on delete cascade,
 family_id uuid not null references marriage.family_accounts on delete cascade,
 relationship text not null check(relationship in('father','mother','brother','sister','relative')),
 status text not null default 'pending' check(status in('pending','active')),
 created_at timestamptz not null default now(), approved_at timestamptz,
 unique(member_key,family_id),
 check((member_id is not null and test_actor is null and member_key='member:'||member_id::text) or
       (member_id is null and test_actor is not null and member_key='test:'||test_actor))
);
create index family_links_family on marriage.family_links(family_id);
create table marriage.family_link_invites (
 id uuid primary key default gen_random_uuid(), member_key text not null,
 member_id uuid references marriage.members(id) on delete cascade,
 test_actor text references marriage.admin_test_members(actor) on delete cascade,
 token_hash bytea not null unique, code_hash bytea not null unique, relationship text not null check(relationship in('father','mother','brother','sister','relative')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 check((member_id is not null and test_actor is null and member_key='member:'||member_id::text) or
       (member_id is null and test_actor is not null and member_key='test:'||test_actor))
);
create index family_link_invites_member on marriage.family_link_invites(member_key);
create table marriage.family_login_accounts (
 username_hash text primary key check(username_hash~'^[a-f0-9]{64}$'),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 recovery_hash bytea not null,
 recovery_claim uuid unique, recovery_claim_until timestamptz, recovery_last_claim uuid unique,
 created_at timestamptz not null default now()
);
create table marriage.family_access_windows (
 operation text not null check(operation in('register','login','recover')),
 scope_key text not null, window_start timestamptz not null,
 attempts integer not null default 1 check(attempts>0), primary key(operation,scope_key,window_start)
);
create table marriage.family_bridge_consents (
 connection_id text not null, request_id uuid references marriage.member_requests(id) on delete cascade,
 member_key text not null, consented_at timestamptz not null default now(),
 primary key(connection_id,member_key),
 check((request_id is not null and connection_id=request_id::text and member_key like 'member:%') or
       (request_id is null and connection_id='tester-pair' and member_key in('test:reham','test:abdulrahman')))
);
create table marriage.family_rooms (
 id uuid primary key default gen_random_uuid(), connection_id text not null,
 request_id uuid references marriage.member_requests(id) on delete cascade,
 member_a text not null, member_b text not null, created_by text not null,
 title text not null check(length(btrim(title)) between 2 and 80),
 status text not null default 'pending' check(status in('pending','active','closed')),
 created_at timestamptz not null default now(), closed_at timestamptz,
 check(member_a<>member_b and created_by in(member_a,member_b)),
 check((request_id is not null and connection_id=request_id::text) or(request_id is null and connection_id='tester-pair'))
);
create index family_rooms_connection on marriage.family_rooms(connection_id,status);
create table marriage.family_room_approvals (
 room_id uuid not null references marriage.family_rooms on delete cascade,
 member_key text not null, approved_at timestamptz not null default now(), primary key(room_id,member_key)
);
create table marriage.family_room_participants (
 room_id uuid not null references marriage.family_rooms on delete cascade,
 participant_key text not null,
 family_id uuid references marriage.family_accounts on delete set null,
 link_id uuid references marriage.family_links on delete set null,
 role text not null check(role in('member','family')), accepted_at timestamptz,
 primary key(room_id,participant_key), check((role='member' and family_id is null and link_id is null) or role='family')
);
create index family_room_participant_lookup on marriage.family_room_participants(participant_key,room_id);
create table marriage.family_messages (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references marriage.family_rooms on delete cascade,
 sender_key text not null, body text not null check(length(btrim(body)) between 1 and 1000),
 client_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 unique(room_id,sender_key,client_id)
);
create index family_messages_page on marriage.family_messages(room_id,created_at desc,id desc);
create index family_messages_sender_rate on marriage.family_messages(sender_key,created_at desc);
create table marriage.family_reads (
 room_id uuid not null references marriage.family_rooms on delete cascade,
 participant_key text not null, read_at timestamptz not null, primary key(room_id,participant_key)
);
alter table marriage.family_accounts enable row level security;
alter table marriage.family_links enable row level security;
alter table marriage.family_link_invites enable row level security;
alter table marriage.family_bridge_consents enable row level security;
alter table marriage.family_rooms enable row level security;
alter table marriage.family_room_approvals enable row level security;
alter table marriage.family_room_participants enable row level security;
alter table marriage.family_messages enable row level security;
alter table marriage.family_reads enable row level security;
alter table marriage.family_login_accounts enable row level security;
alter table marriage.family_access_windows enable row level security;
revoke all on marriage.family_accounts,marriage.family_links,marriage.family_link_invites,marriage.family_bridge_consents,
 marriage.family_rooms,marriage.family_room_approvals,marriage.family_room_participants,marriage.family_messages,marriage.family_reads,
 marriage.family_login_accounts,marriage.family_access_windows from public,anon,authenticated,service_role;

create function marriage.family_name(actor text) returns text language sql stable set search_path='' as $$
 select case when actor like 'member:%' then coalesce((select display_name from marriage.profiles where member_id=substring(actor from 8)::uuid),'عضو')
 when actor like 'family:%' then coalesce((select display_name from marriage.family_accounts where user_id=substring(actor from 8)::uuid),'مشارك سابق')
 when actor='test:reham' then coalesce((select data#>>'{profiles,reham,displayName}' from nisfayn_test.room where id),'رهام')
 when actor='test:abdulrahman' then coalesce((select data#>>'{profiles,abdulrahman,displayName}' from nisfayn_test.room where id),'عبدالرحمن') else 'مشارك' end
$$;
create function marriage.family_member_active(actor text) returns boolean language sql stable set search_path='' as $$
 select case when actor like 'member:%' then exists(select 1 from marriage.members where id=substring(actor from 8)::uuid and review_status='approved' and not suspended and not paused)
 when actor in('test:reham','test:abdulrahman') then exists(select 1 from marriage.admin_test_members where actor=substring($1 from 6) and review_status='approved' and not suspended and not paused and access_until>now()) else false end
$$;
create function marriage.family_peer(actor text,cid text) returns text language plpgsql stable set search_path='' as $$
declare peer text;
begin
 if actor like 'member:%' then peer:=marriage.readiness_peer(substring(actor from 8),cid);return case when peer is not null then 'member:'||peer end;
 elsif actor in('test:reham','test:abdulrahman') then return marriage.readiness_peer(actor,cid);end if;
 return null;
end $$;
create function marriage.family_bridge_enabled(actor text,cid text) returns boolean language sql stable set search_path='' as $$
 select marriage.family_peer(actor,cid) is not null and
 exists(select 1 from marriage.family_bridge_consents where connection_id=cid and member_key=actor) and
 exists(select 1 from marriage.family_bridge_consents where connection_id=cid and member_key=marriage.family_peer(actor,cid))
$$;
create function marriage.family_room_live(r marriage.family_rooms) returns boolean language sql stable set search_path='' as $$
 select r.status<>'closed' and marriage.family_bridge_enabled(r.member_a,r.connection_id) and
 not exists(select 1 from marriage.family_room_participants p where p.room_id=r.id and p.role='family' and
   not exists(select 1 from marriage.family_links l join marriage.family_accounts a on a.user_id=l.family_id
    where l.id=p.link_id and l.family_id=p.family_id and l.status='active' and l.member_key in(r.member_a,r.member_b)))
$$;
create function marriage.family_room_can_read(actor text,r marriage.family_rooms) returns boolean language sql stable set search_path='' as $$
 select r.status='active' and marriage.family_room_live(r) and exists(select 1 from marriage.family_room_participants where room_id=r.id and participant_key=actor and accepted_at is not null)
$$;
create function marriage.family_room_json(actor text,r marriage.family_rooms) returns jsonb language plpgsql stable set search_path='' as $$
declare live boolean:=marriage.family_room_live(r); readable boolean:=marriage.family_room_can_read(actor,r);
begin
 return jsonb_build_object('id',r.id,'title',r.title,'status',case when live then r.status else 'closed' end,'connectionId',r.connection_id,'createdAt',r.created_at,
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.participant_key,'name',marriage.family_name(p.participant_key),'role',p.role,'accepted',p.accepted_at is not null) order by p.role desc,p.participant_key) from marriage.family_room_participants p where p.room_id=r.id),'[]'::jsonb),
 'needsApproval',live and r.status='pending' and actor in(r.member_a,r.member_b) and not exists(select 1 from marriage.family_room_approvals where room_id=r.id and member_key=actor),
 'needsAcceptance',live and r.status='pending' and (select count(*) from marriage.family_room_approvals where room_id=r.id and member_key in(r.member_a,r.member_b))=2 and exists(select 1 from marriage.family_room_participants where room_id=r.id and participant_key=actor and role='family' and accepted_at is null),
 'canRead',readable,'canSend',readable,'unread',case when readable then (select count(*) from marriage.family_messages m where m.room_id=r.id and m.sender_key<>actor and m.created_at>coalesce((select read_at from marriage.family_reads where room_id=r.id and participant_key=actor),'-infinity'::timestamptz)) else 0 end);
end $$;
create function marriage.family_state(actor text,cid text default null) returns jsonb language plpgsql stable set search_path='' as $$
declare guardian boolean:=actor like 'family:%';peer text;bridge jsonb:=null;result jsonb;
begin
 if not guardian and cid is not null then
  peer:=marriage.family_peer(actor,cid);
  if peer is not null then bridge:=jsonb_build_object('connectionId',cid,
   'mine',exists(select 1 from marriage.family_bridge_consents where connection_id=cid and member_key=actor),
   'peer',exists(select 1 from marriage.family_bridge_consents where connection_id=cid and member_key=peer),
   'enabled',marriage.family_bridge_enabled(actor,cid),'memberIds',jsonb_build_array(actor,peer),
   'participants',(select jsonb_agg(jsonb_build_object('id',x.key,'name',marriage.family_name(x.key),'role',x.role) order by x.role desc,x.key)
    from (select actor key,'member' role union all select peer,'member' union select 'family:'||l.family_id::text,'family' from marriage.family_links l where l.member_key in(actor,peer) and l.status='active' and marriage.family_bridge_enabled(actor,cid))x));end if;
 end if;
 result:=jsonb_build_object('role',case when guardian then 'guardian' else 'member' end,'participantId',actor,
 'account',case when guardian then(select jsonb_build_object('displayName',display_name) from marriage.family_accounts where user_id=substring(actor from 8)::uuid) else null end,
 'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'memberName',case when guardian and l.status='pending' then 'بانتظار موافقة العضو' else marriage.family_name(l.member_key) end,'familyName',marriage.family_name('family:'||l.family_id::text),
  'relationship',l.relationship,'status',l.status,'owner',l.member_key=actor) order by l.created_at) from marriage.family_links l where l.member_key=actor or 'family:'||l.family_id::text=actor),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'relationship',i.relationship,'expiresAt',i.expires_at) order by i.created_at) from marriage.family_link_invites i where i.member_key=actor and i.expires_at>now()),'[]'::jsonb),
 'bridge',bridge,'rooms',coalesce((select jsonb_agg(marriage.family_room_json(actor,r) order by (r.status='closed'),r.created_at desc) from marriage.family_rooms r
  where r.id in(select rr.id from marriage.family_rooms rr where (cid is null or rr.connection_id=cid) and (actor in(rr.member_a,rr.member_b) or (exists(select 1 from marriage.family_room_participants p where p.room_id=rr.id and p.participant_key=actor) and (select count(*) from marriage.family_room_approvals where room_id=rr.id and member_key in(rr.member_a,rr.member_b))=2)) order by (rr.status='closed'),rr.created_at desc limit 50)),'[]'::jsonb));
 return result;
end $$;

create function marriage.family_command(actor text,command text,input jsonb) returns jsonb language plpgsql set search_path='' as $$
declare guardian boolean:=actor like 'family:%';uid uuid;peer text;cid text:=input->>'connectionId';token text;code text;attempts integer;inv marriage.family_link_invites;
 l marriage.family_links;r marriage.family_rooms;selected text[];pkey text;rid uuid;stamp timestamptz;prior marriage.family_messages;message_id uuid;output jsonb;
begin
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>6000 then raise exception 'طلب جسر الأهل غير صالح.' using errcode='22023';end if;
 if guardian then uid:=substring(actor from 8)::uuid;end if;
 -- Serialize one actor's invitation, link and message quota operations.
 perform pg_advisory_xact_lock(hashtextextended('family-actor:'||actor,0));
 if guardian and command not in('state','register') and not exists(select 1 from marriage.family_accounts where user_id=uid) then raise exception 'أنشئ حساب الأهل أولًا.' using errcode='42501';end if;
 if not guardian and command not in('state','export','revoke_link','revoke_invite','close_room') and not(command='consent' and input->'agree'='false'::jsonb) and not marriage.family_member_active(actor) then raise exception 'الحساب غير متاح لهذه الخطوة.' using errcode='42501';end if;
 if command='state' then return marriage.family_state(actor,cid);
 elsif command='register' then
  if not guardian or input->>'consentVersion' is distinct from 'family-v1' or input->'adult' is distinct from 'true'::jsonb or length(btrim(coalesce(input->>'displayName',''))) not between 2 and 60 then raise exception 'يلزم اسم صحيح وإقرار البلوغ والموافقة على جسر الأهل.' using errcode='22023';end if;
  if exists(select 1 from marriage.staff_accounts where user_id=uid) then raise exception 'استخدم حسابًا مستقلًا للأهل بدل الحساب الإداري.' using errcode='42501';end if;
  insert into marriage.family_accounts(user_id,display_name,consent_version) values(uid,btrim(input->>'displayName'),'family-v1') on conflict(user_id) do update set display_name=excluded.display_name;
  -- Auth's existing welcome trigger creates an empty matching draft for every
  -- user. Explicit family registration removes only that unused draft.
  delete from marriage.members m where m.id=uid and m.review_status='draft' and not exists(select 1 from marriage.profiles where member_id=m.id);
 elsif command='invite_link' then
  if guardian then raise exception 'الدعوة تبدأ من حساب العضو.' using errcode='42501';end if;
  if input->>'relationship' is null or input->>'relationship' not in('father','mother','brother','sister','relative') then raise exception 'اختر صلة القرابة.' using errcode='22023';end if;
  delete from marriage.family_link_invites where member_key=actor and expires_at<=now();
  if (select count(*) from marriage.family_links where member_key=actor)+(select count(*) from marriage.family_link_invites where member_key=actor)>=3 then raise exception 'يمكن ربط ثلاثة أشخاص من الأهل. ألغِ دعوة قديمة أولًا.' using errcode='22023';end if;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  code:=translate(upper(substr(encode(sha256((gen_random_uuid()::text||gen_random_uuid()::text)::bytea),'hex'),1,12)),'01','GH');
  insert into marriage.family_link_invites(member_key,member_id,test_actor,token_hash,code_hash,relationship) values(actor,
   case when actor like 'member:%' then substring(actor from 8)::uuid end,case when actor like 'test:%' then substring(actor from 6) end,sha256(token::bytea),sha256(code::bytea),input->>'relationship') returning * into inv;
  return jsonb_build_object('token',token,'code',code,'expiresAt',inv.expires_at,'inviteId',inv.id);
 elsif command='revoke_invite' then
  delete from marriage.family_link_invites where id=(input->>'inviteId')::uuid and member_key=actor;
 elsif command='claim_link' then
  if not guardian then raise exception 'الربط يبدأ من حساب الأهل.' using errcode='42501';end if;
  -- Return an error object for invalid guesses so the rate counter commits.
  update marriage.family_accounts set link_attempts=case when link_attempt_window<=now()-interval '15 minutes' then 1 else link_attempts+1 end,
   link_attempt_window=case when link_attempt_window<=now()-interval '15 minutes' then now() else link_attempt_window end where user_id=uid returning link_attempts into attempts;
  if attempts>10 then return jsonb_build_object('error','محاولات كثيرة. انتظر ١٥ دقيقة ثم أعد المحاولة.','code','rate_limited');end if;
  code:=regexp_replace(upper(coalesce(input->>'code','')),'[[:space:]-]','','g');
  token:=lower(coalesce(input->>'token',''));
  if code~'^[A-HJ-NP-Z2-9]{12}$' then select * into inv from marriage.family_link_invites where code_hash=sha256(code::bytea) and expires_at>now() for update;
  elsif token~'^[0-9a-f]{64}$' then select * into inv from marriage.family_link_invites where token_hash=sha256(token::bytea) and expires_at>now() for update;
  end if;
  if inv.id is null or not marriage.family_member_active(inv.member_key) then return jsonb_build_object('error','الرمز غير متاح أو انتهت صلاحيته.','code','invalid_invite');end if;
  if (select count(*) from marriage.family_links where family_id=uid)>=5 then raise exception 'وصلت إلى الحد الأقصى للروابط العائلية.' using errcode='22023';end if;
  insert into marriage.family_links(member_key,member_id,test_actor,family_id,relationship) values(inv.member_key,inv.member_id,inv.test_actor,uid,inv.relationship)
   on conflict(member_key,family_id) do nothing;
  delete from marriage.family_link_invites where id=inv.id;
 elsif command in('approve_link','revoke_link') then
  select * into l from marriage.family_links where id=(input->>'linkId')::uuid for update;
  if l.id is null or (l.member_key<>actor and ('family:'||l.family_id::text<>actor or command='approve_link')) then raise exception 'الرابط غير متاح.' using errcode='42501';end if;
  if command='approve_link' then update marriage.family_links set status='active',approved_at=clock_timestamp() where id=l.id;
  else delete from marriage.family_links where id=l.id;end if;
 elsif command in('consent','create_room') then
  if guardian then raise exception 'هذه الخطوة تحتاج موافقة العضوين.' using errcode='42501';end if;
  -- Same connection row lock used by closure/block triggers: no grant revival race.
  if actor like 'test:%' then perform 1 from nisfayn_test.room where id for share;
  else perform 1 from marriage.member_requests where id=cid::uuid for share;end if;
  perform pg_advisory_xact_lock(hashtextextended('family-connection:'||coalesce(cid,''),0));
  if command='consent' and input->'agree'='false'::jsonb then
   if actor like 'test:%' then
    if cid is distinct from 'tester-pair' then raise exception 'التعارف غير متاح.' using errcode='42501';end if;
   elsif not exists(select 1 from marriage.member_requests where id=cid::uuid and actor in('member:'||requester_id::text,'member:'||recipient_id::text)) then raise exception 'التعارف غير متاح.' using errcode='42501';end if;
   update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where connection_id=cid and status<>'closed';
   delete from marriage.family_bridge_consents where connection_id=cid;
   return marriage.family_state(actor,cid);
  end if;
  peer:=marriage.family_peer(actor,cid);
  if peer is null then raise exception 'يلزم تعارف مقبول ونشط بينكما.' using errcode='42501';end if;
  if command='consent' then
   if input->'agree'='true'::jsonb then insert into marriage.family_bridge_consents(connection_id,request_id,member_key) values(cid,case when actor like 'member:%' then cid::uuid end,actor) on conflict do nothing;
   elsif input->'agree'='false'::jsonb then
    update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where connection_id=cid and status<>'closed';
    delete from marriage.family_bridge_consents where connection_id=cid;
   else raise exception 'اختر الموافقة أو التراجع.' using errcode='22023';end if;
  else
   if not marriage.family_bridge_enabled(actor,cid) then raise exception 'ننتظر موافقة الطرفين على جسر الأهل.' using errcode='42501';end if;
   if length(btrim(coalesce(input->>'title',''))) not between 2 and 80 or jsonb_typeof(input->'participantIds') is distinct from 'array' then raise exception 'اختر اسم الغرفة والمشاركين.' using errcode='22023';end if;
   select array_agg(distinct value) into selected from jsonb_array_elements_text(input->'participantIds');
   if cardinality(selected) not between 2 and 6 or selected is null or array_position(selected,null) is not null or not exists(select 1 from unnest(selected)k where k like 'family:%') then raise exception 'اختر من شخصين إلى ستة، بينهم أحد الأهل.' using errcode='22023';end if;
   if (select count(*) from marriage.family_rooms where connection_id=cid and status<>'closed')>=6 then raise exception 'أغلق غرفة سابقة قبل إنشاء غرفة جديدة.' using errcode='22023';end if;
   foreach pkey in array selected loop
    if pkey not in(actor,peer) and not exists(select 1 from marriage.family_links where member_key in(actor,peer) and status='active' and 'family:'||family_id::text=pkey) then raise exception 'أحد المشاركين غير مرتبط أو غير معتمد.' using errcode='42501';end if;
   end loop;
   insert into marriage.family_rooms(connection_id,request_id,member_a,member_b,created_by,title) values(cid,case when actor like 'member:%' then cid::uuid end,actor,peer,actor,btrim(input->>'title')) returning id into rid;
   insert into marriage.family_room_approvals values(rid,actor,clock_timestamp());
   foreach pkey in array selected loop
    if pkey in(actor,peer) then insert into marriage.family_room_participants(room_id,participant_key,role,accepted_at) values(rid,pkey,'member',clock_timestamp());
    else
     select * into l from marriage.family_links where member_key in(actor,peer) and status='active' and 'family:'||family_id::text=pkey order by created_at limit 1;
     insert into marriage.family_room_participants(room_id,participant_key,role,family_id,link_id) values(rid,pkey,'family',l.family_id,l.id);
    end if;
   end loop;
  end if;
 elsif command in('approve_room','accept_room','close_room','messages','send','read') then
  select * into r from marriage.family_rooms where id=(input->>'roomId')::uuid for update;
  if r.id is null or (actor not in(r.member_a,r.member_b) and (not exists(select 1 from marriage.family_room_participants where room_id=r.id and participant_key=actor) or (select count(*) from marriage.family_room_approvals where room_id=r.id and member_key in(r.member_a,r.member_b))<>2)) then raise exception 'الغرفة غير متاحة.' using errcode='42501';end if;
  cid:=r.connection_id;
  if command='close_room' then update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where id=r.id;
  else
   if not marriage.family_room_live(r) then raise exception 'أُغلقت الغرفة أو انتهى إذن المشاركة.' using errcode='42501';end if;
   if command in('approve_room','accept_room') then
    if r.status<>'pending' then raise exception 'الغرفة ليست بانتظار الموافقة.' using errcode='22023';end if;
    if command='approve_room' and actor not in(r.member_a,r.member_b) then raise exception 'تحتاج هذه الموافقة أحد العضوين.' using errcode='42501';end if;
    if command='accept_room' and not exists(select 1 from marriage.family_room_participants where room_id=r.id and participant_key=actor and role='family') then raise exception 'دعوة الغرفة غير متاحة.' using errcode='42501';end if;
    if input->'agree'='false'::jsonb then update marriage.family_rooms set status='closed',closed_at=clock_timestamp() where id=r.id;
    elsif input->'agree'='true'::jsonb then
     if command='approve_room' then insert into marriage.family_room_approvals values(r.id,actor,clock_timestamp()) on conflict do nothing;
     else update marriage.family_room_participants set accepted_at=clock_timestamp() where room_id=r.id and participant_key=actor;end if;
     if (select count(*) from marriage.family_room_approvals where room_id=r.id and member_key in(r.member_a,r.member_b))=2 and not exists(select 1 from marriage.family_room_participants where room_id=r.id and accepted_at is null) then update marriage.family_rooms set status='active' where id=r.id;end if;
    else raise exception 'اختر قبول الدعوة أو رفضها.' using errcode='22023';end if;
   else
    if not marriage.family_room_can_read(actor,r) then raise exception 'المحادثة متاحة للمشاركين الموافقين فقط.' using errcode='42501';end if;
    if command='messages' then
     if input->>'beforeId' is not null then select * into prior from marriage.family_messages where id=(input->>'beforeId')::uuid and room_id=r.id;if prior.id is null then raise exception 'موضع الرسائل غير صالح.' using errcode='22023';end if;end if;
     select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'senderId',m.sender_key,'senderName',marriage.family_name(m.sender_key),'senderIsMe',m.sender_key=actor,'createdAt',m.created_at,'clientId',m.client_id) order by m.created_at,m.id),'[]'::jsonb) into output from
      (select * from marriage.family_messages where room_id=r.id and(prior.id is null or(created_at,id)<(prior.created_at,prior.id)) order by created_at desc,id desc limit 50)m;
     return output;
    elsif command='send' then
     select * into prior from marriage.family_messages where room_id=r.id and sender_key=actor and client_id=(input->>'clientId')::uuid;
     if prior.id is not null then return to_jsonb(prior.id);end if;
     if length(btrim(coalesce(input->>'body',''))) not between 1 and 1000 or input->>'clientId' is null then raise exception 'اكتب رسالة حتى ١٠٠٠ حرف.' using errcode='22023';end if;
     if (select count(*) from marriage.family_messages where sender_key=actor and created_at>now()-interval '1 minute')>=30 then raise exception 'تمهّل قليلًا قبل إرسال رسائل أخرى.' using errcode='22023';end if;
     insert into marriage.family_messages(room_id,sender_key,body,client_id) values(r.id,actor,btrim(input->>'body'),(input->>'clientId')::uuid) returning id into message_id;return to_jsonb(message_id);
    else
     select created_at into stamp from marriage.family_messages where id=(input->>'messageId')::uuid and room_id=r.id;
     if stamp is null then raise exception 'الرسالة غير متاحة.' using errcode='22023';end if;
     insert into marriage.family_reads values(r.id,actor,stamp) on conflict(room_id,participant_key) do update set read_at=greatest(marriage.family_reads.read_at,excluded.read_at);
    end if;
   end if;
  end if;
 elsif command='export' then
  return jsonb_build_object('exportedAt',now(),'familyBridge',jsonb_build_object('state',marriage.family_state(actor,null),'messages',coalesce((select jsonb_agg(jsonb_build_object('roomId',m.room_id,'id',m.id,'body',m.body,'senderName',marriage.family_name(m.sender_key),'senderIsMe',m.sender_key=actor,'createdAt',m.created_at) order by m.created_at) from marriage.family_messages m join marriage.family_rooms rr on rr.id=m.room_id where marriage.family_room_can_read(actor,rr)),'[]'::jsonb)));
 elsif command='delete_family' then
  if not guardian then raise exception 'هذا الخيار مخصص لحسابات الأهل.' using errcode='42501';end if;
  if exists(select 1 from marriage.members where id=uid) or exists(select 1 from marriage.staff_accounts where user_id=uid) then raise exception 'هذا الحساب مرتبط بعضوية أخرى. تواصل مع الدعم لحذف حساب الأهل.' using errcode='42501';end if;
  delete from marriage.family_links where family_id=uid;
  delete from auth.sessions where user_id=uid;
  delete from auth.users where id=uid;
  return '{"deleted":true}'::jsonb;
 else raise exception 'إجراء جسر الأهل غير متاح.' using errcode='22023';end if;
 return marriage.family_state(actor,cid);
end $$;

-- A family-only account has no member record, so existing private chat/profile RPCs
-- continue to reject it. No editable user_metadata is used to establish roles.
create function marriage.family(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();actor text;
begin
 if not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=uid and u.email_confirmed_at is not null and nullif(u.email,'') is not null and s.id=(auth.jwt()->>'session_id')::uuid and(s.not_after is null or s.not_after>now())) then raise exception 'يلزم حساب مسجل وجلسة فعّالة.' using errcode='42501';end if;
 actor:=case when not exists(select 1 from marriage.family_accounts where user_id=uid) and exists(select 1 from marriage.members m where m.id=uid and(m.review_status<>'draft' or exists(select 1 from marriage.profiles where member_id=m.id))) then 'member:' else 'family:' end||uid::text;
 if actor like 'family:%' and not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'guardian_account'='true') then raise exception 'أنشئ حساب الأهل من بوابة جسر الأهل.' using errcode='42501';end if;
 return marriage.family_command(actor,action,payload);
end $$;
create function public.marriage_family(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select marriage.family($1,$2)$$;

-- Credential provisioning is only callable by the dedicated guardian-access
-- service. Passwords remain entirely in managed Auth; no password is stored here.
create function marriage.family_access_limit(operation text,username_hash text,network_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare window_seconds integer;global_limit integer;user_limit integer;network_limit integer;bucket timestamptz;scope text;n integer;allowed boolean:=true;
begin
 if operation not in('register','login','recover') or username_hash is null or username_hash!~'^[a-f0-9]{64}$' or network_hash is null or network_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid rate scope' using errcode='22023';end if;
 window_seconds:=case operation when 'login' then 900 else 3600 end;
 global_limit:=case operation when 'register' then 50 when 'login' then 1000 else 100 end;
 user_limit:=case operation when 'register' then 3 when 'login' then 12 else 5 end;
 network_limit:=case operation when 'register' then 8 when 'login' then 80 else 20 end;
 bucket:=to_timestamp(floor(extract(epoch from now())/window_seconds)*window_seconds);
 perform pg_advisory_xact_lock(hashtextextended('family-access:'||operation,0));
 foreach scope in array array['global','user:'||username_hash,'network:'||network_hash] loop
  insert into marriage.family_access_windows(operation,scope_key,window_start) values(operation,scope,bucket)
   on conflict on constraint family_access_windows_pkey do update set attempts=marriage.family_access_windows.attempts+1 returning attempts into n;
  if n>(case when scope='global' then global_limit when scope like 'user:%' then user_limit else network_limit end) then allowed:=false;end if;
 end loop;
 return jsonb_build_object('allowed',allowed,'retryAfterSeconds',case when allowed then 0 else greatest(1,ceil(extract(epoch from(bucket+make_interval(secs=>window_seconds)-now())))::integer) end);
end $$;
create function public.family_access_limit(operation text,username_hash text,network_hash text) returns jsonb language sql security invoker set search_path='' as $$select marriage.family_access_limit($1,$2,$3)$$;

create function marriage.family_login_register(account_id uuid,username_hash text,recovery_hash text,display_name text) returns boolean language plpgsql security definer set search_path='' as $$
declare old marriage.family_login_accounts;
begin
 if username_hash is null or username_hash!~'^[a-f0-9]{64}$' or recovery_hash is null or recovery_hash!~'^[a-f0-9]{64}$' or length(btrim(coalesce(display_name,''))) not between 2 and 60 then raise exception 'Invalid guardian registration' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('family-login:'||username_hash,0));
 if not exists(select 1 from auth.users u where u.id=account_id and u.email=username_hash||'@guardian.nisfayn.invalid' and u.raw_app_meta_data->>'guardian_account'='true') or
   exists(select 1 from marriage.staff_accounts where user_id=account_id) or exists(select 1 from marriage.members m where id=account_id and(m.review_status<>'draft' or exists(select 1 from marriage.profiles where member_id=m.id))) then raise exception 'Guardian account unavailable' using errcode='42501';end if;
 select * into old from marriage.family_login_accounts where family_login_accounts.username_hash=family_login_register.username_hash;
 if old.user_id is not null then
  if old.user_id=account_id and old.recovery_hash=decode(recovery_hash,'hex') then return true;end if;
  raise exception 'Guardian registration conflicts' using errcode='23505';
 end if;
 insert into marriage.family_login_accounts(username_hash,user_id,recovery_hash) values(username_hash,account_id,decode(recovery_hash,'hex'));
 perform marriage.family_command('family:'||account_id::text,'register',jsonb_build_object('displayName',display_name,'adult',true,'consentVersion','family-v1'));
 return true;
end $$;
create function public.family_login_register(account_id uuid,username_hash text,recovery_hash text,display_name text) returns boolean language sql security invoker set search_path='' as $$select marriage.family_login_register($1,$2,$3,$4)$$;

create function marriage.family_recovery_prepare(username_hash text,recovery_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a marriage.family_login_accounts;claim uuid;
begin
 if username_hash is null or username_hash!~'^[a-f0-9]{64}$' or recovery_hash is null or recovery_hash!~'^[a-f0-9]{64}$' then raise exception 'Recovery unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('family-login:'||username_hash,0));
 select * into a from marriage.family_login_accounts where family_login_accounts.username_hash=family_recovery_prepare.username_hash for update;
 -- An uncertain managed-Auth outcome must never make the old recovery key reusable.
 -- Only a definite failure may abort; successful changes finalize idempotently.
 if a.user_id is null or a.recovery_hash<>decode(recovery_hash,'hex') or a.recovery_claim is not null or
 not exists(select 1 from auth.users where id=a.user_id and raw_app_meta_data->>'guardian_account'='true') or
 exists(select 1 from marriage.members where id=a.user_id) or exists(select 1 from marriage.staff_accounts where user_id=a.user_id) then raise exception 'Recovery unavailable' using errcode='42501';end if;
 claim:=gen_random_uuid();
 update marriage.family_login_accounts set recovery_claim=claim,recovery_claim_until=clock_timestamp()+interval '3 minutes' where user_id=a.user_id;
 -- Revoke before the external password change too: an ambiguous transport result
 -- cannot leave existing sessions authorized. Unresolved claims need operator
 -- reconciliation; expiry alone never re-enables their consumed recovery key.
 delete from auth.sessions where user_id=a.user_id;
 return jsonb_build_object('accountId',a.user_id,'claimId',claim);
end $$;
create function public.family_recovery_prepare(username_hash text,recovery_hash text) returns jsonb language sql security invoker set search_path='' as $$select marriage.family_recovery_prepare($1,$2)$$;

create function marriage.family_recovery_finish(claim_id uuid,new_recovery_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare a marriage.family_login_accounts;
begin
 if new_recovery_hash is null or new_recovery_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid recovery replacement' using errcode='22023';end if;
 select * into a from marriage.family_login_accounts where recovery_claim=claim_id for update;
 if a.user_id is null then return exists(select 1 from marriage.family_login_accounts where recovery_last_claim=claim_id and recovery_hash=decode(new_recovery_hash,'hex'));end if;
 update marriage.family_login_accounts set recovery_hash=decode(new_recovery_hash,'hex'),recovery_last_claim=claim_id,recovery_claim=null,recovery_claim_until=null where user_id=a.user_id;
 delete from auth.sessions where user_id=a.user_id;
 return true;
end $$;
create function public.family_recovery_finish(claim_id uuid,new_recovery_hash text) returns boolean language sql security invoker set search_path='' as $$select marriage.family_recovery_finish($1,$2)$$;
create function marriage.family_recovery_abort(claim_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update marriage.family_login_accounts set recovery_claim=null,recovery_claim_until=null where recovery_claim=claim_id;
 return found;
end $$;
create function public.family_recovery_abort(claim_id uuid) returns boolean language sql security invoker set search_path='' as $$select marriage.family_recovery_abort($1)$$;
create function marriage.family_recovery_rotate(account_id uuid,new_recovery_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare a marriage.family_login_accounts;
begin
 if new_recovery_hash is null or new_recovery_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid recovery replacement' using errcode='22023';end if;
 if not exists(select 1 from auth.users where id=account_id and raw_app_meta_data->>'guardian_account'='true') or exists(select 1 from marriage.staff_accounts where user_id=account_id) or exists(select 1 from marriage.members where id=account_id) then raise exception 'Guardian account unavailable' using errcode='42501';end if;
 select * into a from marriage.family_login_accounts where user_id=account_id for update;
 if a.user_id is null then return false;end if;
 if a.recovery_claim is not null then raise exception 'Recovery change is still pending' using errcode='55000';end if;
 update marriage.family_login_accounts set recovery_hash=decode(new_recovery_hash,'hex'),recovery_last_claim=null where user_id=account_id;
 return found;
end $$;
create function public.family_recovery_rotate(account_id uuid,new_recovery_hash text) returns boolean language sql security invoker set search_path='' as $$select marriage.family_recovery_rotate($1,$2)$$;

create function marriage.family_close_link_rooms() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where id in(select room_id from marriage.family_room_participants where link_id=old.id) and status<>'closed';
 return old;
end $$;
create trigger family_close_link_rooms before delete on marriage.family_links for each row execute function marriage.family_close_link_rooms();
create function marriage.family_close_connection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'accepted' then
  update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where request_id=new.id and status<>'closed';
  delete from marriage.family_bridge_consents where request_id=new.id;
 end if;return new;
end $$;
create trigger family_close_connection after update of status on marriage.member_requests for each row execute function marriage.family_close_connection();
create function nisfayn_test.family_close_connection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not coalesce((new.data->>'matched')::boolean,false) then
  update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where connection_id='tester-pair' and status<>'closed';
  delete from marriage.family_bridge_consents where connection_id='tester-pair';
 end if;return new;
end $$;
create trigger family_close_connection after update on nisfayn_test.room for each row execute function nisfayn_test.family_close_connection();
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_family;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare who text;
begin
 if action<>'family' then return nisfayn_test.rpc_before_family(action,session_token,payload);end if;
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
 return marriage.family_command('test:'||who,payload->>'action',payload-'action');
end $$;
alter function marriage.personal_data() rename to personal_data_before_family;
create function marriage.personal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin return marriage.personal_data_before_family()||jsonb_build_object('familyBridge',marriage.family_state('member:'||me::text,null));end $$;
alter function marriage.operations_cleanup() rename to operations_cleanup_before_family;
create function marriage.operations_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result:=marriage.operations_cleanup_before_family();
 delete from marriage.family_link_invites where expires_at<=now();
 delete from marriage.family_access_windows where window_start<now()-interval '2 days';
 delete from marriage.family_rooms where status='closed' and closed_at<now()-interval '30 days';
 return result;
end $$;

revoke all on function marriage.family_name(text),marriage.family_member_active(text),marriage.family_peer(text,text),marriage.family_bridge_enabled(text,text),
 marriage.family_room_live(marriage.family_rooms),marriage.family_room_can_read(text,marriage.family_rooms),marriage.family_room_json(text,marriage.family_rooms),
 marriage.family_state(text,text),marriage.family_command(text,text,jsonb),marriage.family(text,jsonb),public.marriage_family(text,jsonb),
 marriage.family_close_link_rooms(),marriage.family_close_connection(),nisfayn_test.family_close_connection(),
 nisfayn_test.rpc_before_family(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb),marriage.personal_data_before_family(),marriage.personal_data(),
 marriage.operations_cleanup_before_family(),marriage.operations_cleanup() from public,anon,authenticated,service_role;
grant execute on function marriage.family(text,jsonb),public.marriage_family(text,jsonb),marriage.personal_data() to authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb),marriage.operations_cleanup() to service_role;
revoke all on function marriage.family_access_limit(text,text,text),public.family_access_limit(text,text,text),
 marriage.family_login_register(uuid,text,text,text),public.family_login_register(uuid,text,text,text),
 marriage.family_recovery_prepare(text,text),public.family_recovery_prepare(text,text),marriage.family_recovery_finish(uuid,text),public.family_recovery_finish(uuid,text),
 marriage.family_recovery_abort(uuid),public.family_recovery_abort(uuid),marriage.family_recovery_rotate(uuid,text),public.family_recovery_rotate(uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function marriage.family_access_limit(text,text,text),public.family_access_limit(text,text,text),
 marriage.family_login_register(uuid,text,text,text),public.family_login_register(uuid,text,text,text),
 marriage.family_recovery_prepare(text,text),public.family_recovery_prepare(text,text),marriage.family_recovery_finish(uuid,text),public.family_recovery_finish(uuid,text),
 marriage.family_recovery_abort(uuid),public.family_recovery_abort(uuid),marriage.family_recovery_rotate(uuid,text),public.family_recovery_rotate(uuid,text) to service_role;
