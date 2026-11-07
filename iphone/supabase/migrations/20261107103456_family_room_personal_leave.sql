-- Personal withdrawal retains the approved roster and message history. It never
-- grants a new person old history or withdraws either member's bridge consent.
alter table marriage.family_room_participants add column left_at timestamptz;
alter table marriage.family_room_participants add constraint family_left_after_acceptance check(left_at is null or accepted_at is not null);

create or replace function marriage.family_room_live(r marriage.family_rooms) returns boolean language sql stable set search_path='' as $$
 select r.status<>'closed' and marriage.family_bridge_enabled(r.member_a,r.connection_id) and
 not exists(select 1 from marriage.family_room_participants p where p.room_id=r.id and p.role='family' and p.left_at is null and
   not exists(select 1 from marriage.family_links l join marriage.family_accounts a on a.user_id=l.family_id
    where l.id=p.link_id and l.family_id=p.family_id and l.status='active' and l.admin_review='approved' and l.member_key in(r.member_a,r.member_b)))
$$;
create or replace function marriage.family_room_can_read(actor text,r marriage.family_rooms) returns boolean language sql stable set search_path='' as $$
 select r.status='active' and marriage.family_room_live(r) and exists(select 1 from marriage.family_room_participants where room_id=r.id and participant_key=actor and accepted_at is not null and left_at is null)
$$;
create or replace function marriage.family_room_json(actor text,r marriage.family_rooms) returns jsonb language plpgsql stable set search_path='' as $$
declare live boolean:=marriage.family_room_live(r); readable boolean:=marriage.family_room_can_read(actor,r);
begin
 return jsonb_build_object('id',r.id,'title',r.title,'status',case when live then r.status else 'closed' end,'connectionId',r.connection_id,'createdAt',r.created_at,
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.participant_key,'name',marriage.family_name(p.participant_key),'role',p.role,'accepted',p.accepted_at is not null,'left',p.left_at is not null) order by p.role desc,p.participant_key) from marriage.family_room_participants p where p.room_id=r.id),'[]'::jsonb),
 'leftByMe',exists(select 1 from marriage.family_room_participants where room_id=r.id and participant_key=actor and left_at is not null),
 'needsApproval',live and r.status='pending' and actor in(r.member_a,r.member_b) and not exists(select 1 from marriage.family_room_approvals where room_id=r.id and member_key=actor),
 'needsAcceptance',live and r.status='pending' and (select count(*) from marriage.family_room_approvals where room_id=r.id and member_key in(r.member_a,r.member_b))=2 and exists(select 1 from marriage.family_room_participants where room_id=r.id and participant_key=actor and role='family' and accepted_at is null and left_at is null),
 'canRead',readable,'canSend',readable,'unread',case when readable then (select count(*) from marriage.family_messages m where m.room_id=r.id and m.sender_key<>actor and m.created_at>coalesce((select read_at from marriage.family_reads where room_id=r.id and participant_key=actor),'-infinity'::timestamptz)) else 0 end);
end $$;

-- Only current family participants depend on a live link. A departed person's
-- later unlink/deletion/review change cannot close other participants' room.
create or replace function marriage.family_close_link_rooms() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp()) where id in(select room_id from marriage.family_room_participants where link_id=old.id and left_at is null) and status<>'closed';
 return old;
end $$;
create or replace function marriage.family_close_reviewed_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.admin_review='approved' and new.admin_review<>'approved' then
  update marriage.family_rooms set status='closed',closed_at=coalesce(closed_at,clock_timestamp())
   where status<>'closed' and id in(select room_id from marriage.family_room_participants where link_id=new.id and left_at is null);
 end if;
 return new;
end $$;

alter function marriage.family_command(text,text,jsonb) rename to family_command_before_personal_leave;
create function marriage.family_command(actor text,command text,input jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r marriage.family_rooms;p marriage.family_room_participants;
begin
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>6000 then raise exception 'طلب جسر الأهل غير صالح.' using errcode='22023';end if;
 if command in('leave_room','approve_room','accept_room','close_room','messages','send','read') then
  -- Match existing mutation lock order; an in-flight close/send cannot race a
  -- completed personal withdrawal and recover the departed actor's access.
  perform pg_advisory_xact_lock(hashtextextended('family-actor:'||actor,0));
  select * into r from marriage.family_rooms where id=(input->>'roomId')::uuid for update;
  select * into p from marriage.family_room_participants where room_id=r.id and participant_key=actor;
  if command='leave_room' then
   if p.participant_key is null or p.accepted_at is null then raise exception 'المغادرة متاحة للمشاركين الموافقين فقط.' using errcode='42501';end if;
   if p.left_at is not null then return marriage.family_state(actor,r.connection_id);end if;
   if r.status<>'active' or not marriage.family_room_live(r) then raise exception 'المساحة غير متاحة للمغادرة.' using errcode='42501';end if;
   update marriage.family_room_participants set left_at=clock_timestamp() where room_id=r.id and participant_key=actor;
   if not exists(select 1 from marriage.family_room_participants where room_id=r.id and left_at is null) then
    update marriage.family_rooms set status='closed',closed_at=clock_timestamp() where id=r.id;
   end if;
   return marriage.family_state(actor,r.connection_id);
  elsif p.left_at is not null then
   raise exception 'غادرت هذه المساحة. العودة تحتاج مساحة جديدة بموافقات جديدة.' using errcode='42501';
  end if;
 end if;
 return marriage.family_command_before_personal_leave(actor,command,input);
end $$;
-- Authenticated entrypoints still derive the actor from the live session.
revoke all on function marriage.family_command(text,text,jsonb),marriage.family_command_before_personal_leave(text,text,jsonb) from public,anon,authenticated,service_role;
