-- Member consent and administrative review are independent. Neither grants
-- access to a private couple conversation or bypasses exact room consent.
alter table marriage.family_links
 add column admin_review text not null default 'pending' check(admin_review in('pending','approved','rejected')),
 add column admin_reviewed_at timestamptz,
 add column admin_reviewed_by uuid references marriage.staff_accounts(user_id) on delete set null,
 add column admin_reason text check(length(btrim(admin_reason)) between 3 and 500),
 add column admin_revision bigint not null default 0;
create index family_links_admin_queue on marriage.family_links(admin_review,created_at desc,id desc);
alter table marriage.staff_audit drop constraint staff_audit_target_type_check;
alter table marriage.staff_audit add constraint staff_audit_target_type_check
 check(target_type in('member','report','staff','staff_invitation','family_link'));
-- Preserve only already-approved member links present when this change lands.
-- This inserts no synthetic audit records when there are no existing links.
update marriage.family_links set admin_review='approved',admin_reviewed_at=now(),admin_revision=1,
 admin_reason='Existing active family link preserved during review rollout' where status='active';
insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
 select null,'Database migration','database','family_link_grandfathered','family_link',id,admin_reason
 from marriage.family_links where admin_review='approved';

create function marriage.family_close_reviewed_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.admin_review='approved' and new.admin_review<>'approved' then
  update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp())
   where status<>'closed' and id in(select room_id from marriage.family_room_participants where link_id=new.id);
 end if;
 return new;
end $$;
create trigger family_close_reviewed_link after update of admin_review on marriage.family_links
 for each row execute function marriage.family_close_reviewed_link();

create function marriage.admin_family_revision(target uuid) returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_array(l.status,l.approved_at,l.admin_review,l.admin_revision)::text)
 from marriage.family_links l where l.id=target
$$;
create function marriage.admin_family_item(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'guardianId',l.family_id,'guardianName',a.display_name,
 'memberId',l.member_id,'memberName',marriage.family_name(l.member_key),'relationship',l.relationship,
 'memberStatus',l.status,'adminReview',l.admin_review,'submittedAt',l.created_at,'memberApprovedAt',l.approved_at,
 'reviewedAt',l.admin_reviewed_at,'reviewedByName',s.display_name,'reason',l.admin_reason,'revision',marriage.admin_family_revision(l.id))
 from marriage.family_links l join marriage.family_accounts a on a.user_id=l.family_id
 left join marriage.staff_accounts s on s.user_id=l.admin_reviewed_by where l.id=target
$$;
create function marriage.admin_family(status_filter text,query text,before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']);
 needle text:=lower(btrim(coalesce(query,'')));cursor_at timestamptz;items jsonb;counts jsonb;next_cursor text;
begin
 if status_filter is null or status_filter not in('pending','approved','rejected','all') or length(needle)>80 then raise exception 'اختر تصفية وبحثًا صالحين.' using errcode='22023';end if;
 if before_id is not null then select created_at into cursor_at from marriage.family_links where id=before_id;
  if cursor_at is null then raise exception 'حدّث قائمة طلبات الأهل.' using errcode='22023';end if;end if;
 select jsonb_build_object('pending',count(*) filter(where admin_review='pending'),'approved',count(*) filter(where admin_review='approved'),'rejected',count(*) filter(where admin_review='rejected')) into counts from marriage.family_links;
 select coalesce(jsonb_agg(marriage.admin_family_item(q.id) order by q.created_at desc,q.id desc),'[]'::jsonb) into items from
 (select l.id,l.created_at from marriage.family_links l join marriage.family_accounts a on a.user_id=l.family_id
  where(status_filter='all' or l.admin_review=status_filter) and(before_id is null or(l.created_at,l.id)<(cursor_at,before_id))
  and(needle='' or position(needle in lower(a.display_name))>0 or position(needle in lower(marriage.family_name(l.member_key)))>0)
  order by l.created_at desc,l.id desc limit 51)q;
 if jsonb_array_length(items)>50 then items:=items-50;next_cursor:=items->49->>'id';end if;
 return jsonb_build_object('items',items,'counts',counts,'nextCursor',next_cursor);
end $$;
create function public.marriage_admin_family(status_filter text default 'pending',query text default '',before_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select marriage.admin_family($1,$2,$3)$$;

create function marriage.admin_family_review(target uuid,decision text,expected_revision text,note text,operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']);l marriage.family_links;
 prior marriage.staff_audit;fingerprint text;result jsonb;event text;
begin
 if decision is null or decision not in('approve','reject','revoke') or operation_id is null or expected_revision is null
 or length(btrim(coalesce(note,''))) not between 3 and 500 then raise exception 'أدخل قرارًا وسببًا صالحين وحدّث الطلب.' using errcode='22023';end if;
 event:=case decision when 'approve' then 'family_link_approved' when 'reject' then 'family_link_rejected' else 'family_link_revoked' end;
 fingerprint:=md5(jsonb_build_array(target,decision,expected_revision,btrim(note))::text);
 perform pg_advisory_xact_lock(hashtextextended(staff.user_id::text||operation_id::text,0));
 select * into prior from marriage.staff_audit where actor_id=staff.user_id and request_id=operation_id;
 if found then
  if prior.action<>event or prior.target_type<>'family_link' or prior.request_fingerprint<>fingerprint then raise exception 'أعيد استخدام معرّف إجراء مختلف.' using errcode='22023';end if;
  return prior.result;
 end if;
 select * into l from marriage.family_links where id=target for update;
 if not found then raise exception 'طلب الأهل غير متاح.' using errcode='P0002';end if;
 if staff.user_id=l.family_id or staff.user_id=l.member_id then raise exception 'لا يمكنك مراجعة طلبك الشخصي.' using errcode='42501';end if;
 if marriage.admin_family_revision(target) is distinct from expected_revision then raise exception 'تغيّر الطلب. حدّث القائمة قبل القرار.' using errcode='40001';end if;
 if(decision='approve' and l.admin_review='approved') or(decision='reject' and l.admin_review<>'pending') or(decision='revoke' and l.admin_review<>'approved') then raise exception 'الطلب ليس في حالة تسمح بهذا القرار.' using errcode='22023';end if;
 update marriage.family_links set admin_review=case when decision='approve' then 'approved' else 'rejected' end,
  admin_reviewed_at=clock_timestamp(),admin_reviewed_by=staff.user_id,admin_reason=btrim(note),admin_revision=admin_revision+1 where id=target;
 result:=marriage.admin_family_item(target);
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
  values(staff.user_id,staff.display_name,staff.role,event,'family_link',target,btrim(note),operation_id,fingerprint,result);
 return result;
end $$;
create function public.marriage_admin_family_review(link_id uuid,action text,expected_revision text,reason text,request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select marriage.admin_family_review($1,$2,$3,$4,$5)$$;

revoke all on function marriage.family_close_reviewed_link(),marriage.admin_family_revision(uuid),marriage.admin_family_item(uuid),
 marriage.admin_family(text,text,uuid),marriage.admin_family_review(uuid,text,text,text,uuid),
 public.marriage_admin_family(text,text,uuid),public.marriage_admin_family_review(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.admin_family(text,text,uuid),marriage.admin_family_review(uuid,text,text,text,uuid),
 public.marriage_admin_family(text,text,uuid),public.marriage_admin_family_review(uuid,text,text,text,uuid) to authenticated;


create or replace function marriage.family_room_live(r marriage.family_rooms) returns boolean language sql stable set search_path='' as $$
 select r.status<>'closed' and marriage.family_bridge_enabled(r.member_a,r.connection_id) and
 not exists(select 1 from marriage.family_room_participants p where p.room_id=r.id and p.role='family' and
   not exists(select 1 from marriage.family_links l join marriage.family_accounts a on a.user_id=l.family_id
    where l.id=p.link_id and l.family_id=p.family_id and l.status='active' and l.admin_review='approved' and l.member_key in(r.member_a,r.member_b)))
$$;

create or replace function marriage.family_state(actor text,cid text default null) returns jsonb language plpgsql stable set search_path='' as $$
declare guardian boolean:=actor like 'family:%';peer text;bridge jsonb:=null;result jsonb;
begin
 if not guardian and cid is not null then
  peer:=marriage.family_peer(actor,cid);
  if peer is not null then bridge:=jsonb_build_object('connectionId',cid,
   'mine',exists(select 1 from marriage.family_bridge_consents where connection_id=cid and member_key=actor),
   'peer',exists(select 1 from marriage.family_bridge_consents where connection_id=cid and member_key=peer),
   'enabled',marriage.family_bridge_enabled(actor,cid),'memberIds',jsonb_build_array(actor,peer),
   'participants',(select jsonb_agg(jsonb_build_object('id',x.key,'name',marriage.family_name(x.key),'role',x.role) order by x.role desc,x.key)
    from (select actor key,'member' role union all select peer,'member' union select 'family:'||l.family_id::text,'family' from marriage.family_links l where l.member_key in(actor,peer) and l.status='active' and l.admin_review='approved' and marriage.family_bridge_enabled(actor,cid))x));end if;
 end if;
 result:=jsonb_build_object('role',case when guardian then 'guardian' else 'member' end,'participantId',actor,
 'account',case when guardian then(select jsonb_build_object('displayName',display_name) from marriage.family_accounts where user_id=substring(actor from 8)::uuid) else null end,
 'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'memberName',case when guardian and l.status='pending' then 'بانتظار موافقة العضو' else marriage.family_name(l.member_key) end,'familyName',marriage.family_name('family:'||l.family_id::text),
  'relationship',l.relationship,'status',l.status,'adminReview',l.admin_review,'owner',l.member_key=actor) order by l.created_at) from marriage.family_links l where l.member_key=actor or 'family:'||l.family_id::text=actor),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'relationship',i.relationship,'expiresAt',i.expires_at) order by i.created_at) from marriage.family_link_invites i where i.member_key=actor and i.expires_at>now()),'[]'::jsonb),
 'bridge',bridge,'rooms',coalesce((select jsonb_agg(marriage.family_room_json(actor,r) order by (r.status='closed'),r.created_at desc) from marriage.family_rooms r
  where r.id in(select rr.id from marriage.family_rooms rr where (cid is null or rr.connection_id=cid) and (actor in(rr.member_a,rr.member_b) or (exists(select 1 from marriage.family_room_participants p where p.room_id=rr.id and p.participant_key=actor) and (select count(*) from marriage.family_room_approvals where room_id=rr.id and member_key in(rr.member_a,rr.member_b))=2)) order by (rr.status='closed'),rr.created_at desc limit 50)),'[]'::jsonb));
 return result;
end $$;

create or replace function marriage.family_command(actor text,command text,input jsonb) returns jsonb language plpgsql set search_path='' as $$
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
    if pkey not in(actor,peer) and not exists(select 1 from marriage.family_links where member_key in(actor,peer) and status='active' and admin_review='approved' and 'family:'||family_id::text=pkey) then raise exception 'أحد المشاركين غير مرتبط أو غير معتمد.' using errcode='42501';end if;
   end loop;
   insert into marriage.family_rooms(connection_id,request_id,member_a,member_b,created_by,title) values(cid,case when actor like 'member:%' then cid::uuid end,actor,peer,actor,btrim(input->>'title')) returning id into rid;
   insert into marriage.family_room_approvals values(rid,actor,clock_timestamp());
   foreach pkey in array selected loop
    if pkey in(actor,peer) then insert into marriage.family_room_participants(room_id,participant_key,role,accepted_at) values(rid,pkey,'member',clock_timestamp());
    else
     select * into l from marriage.family_links where member_key in(actor,peer) and status='active' and admin_review='approved' and 'family:'||family_id::text=pkey order by created_at limit 1 for share;
     if not found then raise exception 'أحد المشاركين غير مرتبط أو غير معتمد.' using errcode='42501';end if;
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
