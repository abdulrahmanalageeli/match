-- Discovery pause is not a relationship termination. Public edits remain reviewed,
-- with a server-enforced rolling 30-day allowance after a profile is approved.
alter table marriage.members add column last_public_profile_edit_at timestamptz;
alter table marriage.members add column profile_review_pending boolean not null default false;
alter table marriage.members add column approved_profile_snapshot jsonb;

create function marriage.relationship_member_allowed(target uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.members m where m.id=$1 and not m.suspended
  and (m.review_status='approved' or (m.review_status='pending' and m.profile_review_pending)))
$$;
create function marriage.relationship_open(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
 select a<>b and marriage.relationship_member_allowed(a) and marriage.relationship_member_allowed(b)
 and not exists(select 1 from marriage.blocks where (member_id=a and blocked_id=b) or (member_id=b and blocked_id=a))
 and (exists(select 1 from marriage.member_requests r where r.status='accepted'
   and a in(r.requester_id,r.recipient_id) and b in(r.requester_id,r.recipient_id))
  or exists(select 1 from marriage.introductions i where i.closed_at is null and a in(i.member_a,i.member_b) and b in(i.member_a,i.member_b)
   and (select count(*) from marriage.introduction_decisions d where d.introduction_id=i.id and d.member_id in(a,b))=2))
$$;
create function marriage.relationship_eligible(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
 select marriage.relationship_open(a,b) and marriage.is_paid(a) and marriage.is_paid(b)
$$;
create function marriage.require_communication_member() returns uuid
language plpgsql stable set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 if not marriage.relationship_member_allowed(me) or not marriage.is_paid(me) then
  raise exception 'يلزم حساب معتمد وأن يكون الاشتراك ساريًا للمحادثات.' using errcode='42501';end if;
 return me;
end $$;

create or replace function marriage.close_member_requests() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.suspended and not old.suspended)
  or (old.review_status='approved' and new.review_status<>'approved' and not new.profile_review_pending) then
  update marriage.member_requests set status='closed',updated_at=now()
   where new.id in(requester_id,recipient_id) and status in('pending','accepted');
 elsif (new.paused and not old.paused) or (old.review_status='approved' and new.review_status<>'approved') then
  update marriage.member_requests set status='closed',updated_at=now()
   where new.id in(requester_id,recipient_id) and status='pending';
 end if;
 return new;
end $$;
create or replace function marriage.set_pause(paused boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 if paused is null then raise exception 'اختر حالة البحث.' using errcode='22023';end if;
 update marriage.members set paused=$1 where id=me;
 if paused then update marriage.introductions i set closed_at=now() where closed_at is null and me in(member_a,member_b)
  and (select count(*) from marriage.introduction_decisions d where d.introduction_id=i.id)<2;end if;
 return marriage.member_state(me);
end $$;

-- Keep the established authenticated/paid/block checks at every conversation
-- entry point. This explicit allowlist cannot change discovery or new requests.
do $gates$ declare name text; definition text;begin
 foreach name in array array['chat_peer','thread','thread_page','message_changes','message','reply_message',
  'mark_thread_read','unread_count','progress_peer','progress_view','progress_before_exclusivity',
  'progress_before_rewind','next_step_before_rewind','set_next_step','set_next_step_before_exclusivity',
  'rewind_step','photo_state','photo_share','photo_can_read','call_start','voice_allowed'] loop
  for definition in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='marriage' and p.proname=name and p.prokind='f' loop
   execute replace(replace(definition,'marriage.require_discovery_member()','marriage.require_communication_member()'),
    'marriage.compatible(','marriage.relationship_eligible(');
  end loop;
 end loop;
end $gates$;

create or replace function marriage.inbox() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_communication_member();begin
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'createdAt',r.created_at,'updatedAt',r.updated_at,
  'direction',case when r.requester_id=me then 'outgoing' else 'incoming' end,'person',marriage.member_card(me,p.peer),
  'unreadCount',case when r.status='accepted' then marriage.thread_unread(r.id,p.peer,s.through_created_at,s.through_id) else 0 end,
  'lastMessage',case when last.id is not null then jsonb_build_object('body',last.body,'senderIsMe',last.sender_id=me,'createdAt',last.created_at) end)
  order by greatest(r.updated_at,last.created_at) desc,r.id),'[]'::jsonb)
 from marriage.member_requests r cross join lateral (select case when r.requester_id=me then r.recipient_id else r.requester_id end peer) p
 left join marriage.thread_read_positions s on s.request_id=r.id and s.reader_id=me
 left join lateral (select t.id,t.sender_id,t.body,t.created_at from marriage.thread_messages t where t.request_id=r.id and r.status='accepted' order by t.created_at desc,t.id desc limit 1) last on true
 where me in(r.requester_id,r.recipient_id) and ((r.status='accepted' and marriage.relationship_eligible(me,p.peer))
  or (r.status='pending' and marriage.is_paid(p.peer) and marriage.compatible(me,p.peer))));
end $$;

do $alerts$ declare definition text;begin
 definition:=pg_get_functiondef('marriage.notifications()'::regprocedure);
 definition:=replace(definition,'marriage.require_discovery_member()','marriage.require_communication_member()');
 execute replace(definition,'marriage.compatible(me,actor_id)','(marriage.compatible(me,actor_id) or marriage.relationship_eligible(me,actor_id))');
 definition:=pg_get_functiondef('marriage.push_allowed(marriage.push_outbox)'::regprocedure);
 execute replace(definition,'marriage.compatible(r.requester_id,r.recipient_id)',
  '(case when job.kind=''request'' then marriage.compatible(r.requester_id,r.recipient_id) else marriage.relationship_eligible(r.requester_id,r.recipient_id) end)');
end $alerts$;

-- Existing family rooms/readiness grants follow the accepted connection, not
-- directory availability. Test-account administration keeps its separate gates.
do $family$ declare definition text;needle text;begin
 definition:=pg_get_functiondef('marriage.readiness_peer(text,text)'::regprocedure);
 needle:='if (select count(*) from marriage.members where id in(r.requester_id,r.recipient_id) and not suspended and not paused and review_status=''approved'')<>2 then return null;end if;';
 if position(needle in definition)=0 then raise exception 'Unexpected readiness member gate';end if;
 execute replace(definition,needle,'if not marriage.relationship_eligible(r.requester_id,r.recipient_id) then return null;end if;');
 definition:=pg_get_functiondef('marriage.family_member_active(text)'::regprocedure);
 needle:='exists(select 1 from marriage.members where id=substring(actor from 8)::uuid and review_status=''approved'' and not suspended and not paused)';
 if position(needle in definition)=0 then raise exception 'Unexpected family member gate';end if;
 execute replace(definition,needle,'(marriage.relationship_member_allowed(substring(actor from 8)::uuid) and marriage.is_paid(substring(actor from 8)::uuid))');
end $family$;

create or replace function marriage.can_renew_relationship(target uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.introductions j where target in(j.member_a,j.member_b) and j.closed_at is null
  and (marriage.compatible(target,case when target=j.member_a then j.member_b else j.member_a end)
   or marriage.relationship_open(target,case when target=j.member_a then j.member_b else j.member_a end)))
 or exists(select 1 from marriage.member_requests r where target in(r.requester_id,r.recipient_id)
  and ((r.status='pending' and marriage.compatible(r.requester_id,r.recipient_id))
   or (r.status='accepted' and marriage.relationship_open(r.requester_id,r.recipient_id))))
$$;

-- Snapshots contain approved public text only. No clear portrait, private
-- assessment answers, or new unreviewed text is returned to peers during review.
alter function marriage.member_card(uuid,uuid) rename to member_card_before_profile_lifecycle;
create function marriage.public_profile_snapshot(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('card',marriage.member_card_before_profile_lifecycle(null,target)
  -array['fit','reasons','atCapacity','viewerAtCapacity','connectionId','connectionStatus','exclusive','online','interested','manualVerifications','portrait'],
  'contact',(select contact_value from marriage.contacts where member_id=target))
$$;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare m marriage.members;card jsonb;begin
 select * into m from marriage.members where id=subject;
 if viewer<>subject and m.profile_review_pending and m.review_status='pending' then
  card:=marriage.public_sensitive_fields(m.approved_profile_snapshot->'card',marriage.sensitive_publication_allowed(subject));
  if marriage.beena_shared_story(marriage.beena_json(subject)) is null then card:=card-'beenaStory';end if;
  return card||jsonb_build_object('portrait',null,'reasons','[]'::jsonb);
 end if;
 if viewer<>subject and m.review_status<>'approved' then
  return jsonb_build_object('id',subject,'alias','عضو','age',0,'city','','occupation','','bio','',
   'interests','[]'::jsonb,'reasons','[]'::jsonb,'portrait',null);
 end if;
 return marriage.member_card_before_profile_lifecycle(viewer,subject);
end $$;

create function marriage.enforce_public_edit_interval(last_edit timestamptz) returns void language plpgsql stable set search_path='' as $$
begin
 if last_edit is not null and last_edit+interval '30 days'>now() then
  raise exception 'يمكن تعديل الملف العام مرة كل ٣٠ يومًا. الموعد التالي: % بتوقيت السعودية.',
   to_char((last_edit+interval '30 days') at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI') using errcode='P0001';
 end if;
end $$;

-- Only the self-service writer sets profile_review_pending. An administrator's
-- suspension/re-review must never inherit this communication exception.
alter function marriage.apply_profile(jsonb) rename to apply_profile_before_lifecycle;
create function marriage.apply_profile(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();m marriage.members;before_public jsonb;after_public jsonb;privacy_projection jsonb;result jsonb;changed boolean;privacy_only boolean;
begin
 select * into strict m from marriage.members where id=me for update;
 if m.suspended then raise exception 'الحساب قيد مراجعة البلاغات.' using errcode='42501';end if;
 before_public:=marriage.public_profile_snapshot(me);
 if m.review_status='approved' then
  update marriage.members set profile_review_pending=true,approved_profile_snapshot=before_public where id=me;
 end if;
 result:=marriage.apply_profile_before_lifecycle(payload);
 after_public:=marriage.public_profile_snapshot(me);
 changed:=before_public is distinct from after_public;
 -- Withdrawing publication/assessment consent or a shared story cannot be
 -- locked behind the public-edit allowance. No unrelated public edit may ride
 -- along: the result must exactly equal the approved card with only that data removed.
 privacy_projection:=before_public;
 if jsonb_typeof(privacy_projection->'card')='object' and (payload#>'{signupConsents,sensitiveProfile}'='false'::jsonb or payload#>'{signupConsents,sensitivePublication}'='false'::jsonb) then
  privacy_projection:=jsonb_set(privacy_projection,'{card}',marriage.public_sensitive_fields(privacy_projection->'card',false));
 end if;
 if payload#>'{signupConsents,assessment}'='false'::jsonb or payload->'beena'='null'::jsonb or payload#>'{beena,story,share}'='false'::jsonb then
  privacy_projection:=privacy_projection#-'{card,beenaStory}';
 end if;
 privacy_only:=after_public=privacy_projection and (privacy_projection is distinct from before_public
  or payload#>'{signupConsents,photo}'='false'::jsonb);
 if m.review_status='approved' then
  if privacy_only then
   update marriage.members set review_status='approved',profile_review_pending=false,approved_profile_snapshot=null where id=me;
  elsif changed or (select review_status='pending' from marriage.members where id=me) then
   perform marriage.enforce_public_edit_interval(m.last_public_profile_edit_at);
   update marriage.members set review_status='pending',last_public_profile_edit_at=now() where id=me;
   if result#>>'{user,applicationStatus}'='approved' then insert into marriage.reviews(member_id,action) values(me,'submit');end if;
  else update marriage.members set profile_review_pending=false,approved_profile_snapshot=null where id=me;end if;
 end if;
 -- Withdrawals also redact an already-pending approved snapshot immediately;
 -- a later re-grant cannot resurrect the removed disclosure without review.
 if not marriage.sensitive_publication_allowed(me) then
  update marriage.members set approved_profile_snapshot=jsonb_set(approved_profile_snapshot,'{card}',
   marriage.public_sensitive_fields(approved_profile_snapshot->'card',false))
   where id=me and profile_review_pending and jsonb_typeof(approved_profile_snapshot->'card')='object';
 end if;
 if marriage.beena_shared_story(marriage.beena_json(me)) is null then
  update marriage.members set approved_profile_snapshot=approved_profile_snapshot#-'{card,beenaStory}' where id=me and profile_review_pending;
 end if;
 return marriage.member_state(me);
end $$;

-- The older writer may close unaccepted nominations after a changed preference,
-- but must not terminate a mutually accepted introduction on a public edit.
do $writer$ declare definition text;needle text;begin
 definition:=pg_get_functiondef('marriage.apply_profile_before_onboarding_consent(jsonb)'::regprocedure);
 needle:='(review_change or not marriage.compatible(me,case when member_a=me then member_b else member_a end));';
 if position(needle in definition)=0 then raise exception 'Unexpected profile introduction closure';end if;
 execute replace(definition,needle,'(review_change or not marriage.compatible(me,case when member_a=me then member_b else member_a end)) and (select count(*) from marriage.introduction_decisions d where d.introduction_id=i.id)<2;');
 definition:=pg_get_functiondef('marriage.review_member(uuid,text)'::regprocedure);
 execute replace(replace(definition,'set review_status=''approved'',suspended=false','set review_status=''approved'',suspended=false,profile_review_pending=false,approved_profile_snapshot=null'),
  'suspended=true where id=target','suspended=true,profile_review_pending=false,approved_profile_snapshot=null where id=target');
 definition:=pg_get_functiondef('marriage.member_state_base(uuid)'::regprocedure);
 execute replace(definition,'marriage.compatible(target,p.member_id)',
  '(marriage.compatible(target,p.member_id) or (me.member_id is not null and them.member_id is not null and marriage.relationship_eligible(target,p.member_id)))');
end $writer$;

alter function marriage.member_state(uuid) rename to member_state_before_profile_lifecycle;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_profile_lifecycle(target);m marriage.members;peer uuid;snapshot jsonb;card jsonb;begin
 select * into m from marriage.members where id=target;
 result:=jsonb_set(result,'{user}',(result->'user')||jsonb_build_object('profileReviewPending',m.profile_review_pending and not m.suspended,
  'nextPublicProfileEditAt',case when m.last_public_profile_edit_at+interval '30 days'>now() then m.last_public_profile_edit_at+interval '30 days' end));
 if jsonb_typeof(result->'introduction')='object' then
  select case when member_a=target then member_b else member_a end into peer from marriage.introductions where id=(result#>>'{introduction,id}')::uuid;
  select approved_profile_snapshot into snapshot from marriage.members where id=peer and profile_review_pending and review_status='pending';
  if snapshot is not null then
   card:=snapshot->'card';
   result:=jsonb_set(result,'{introduction,person}',jsonb_build_object('displayName',card->'alias','age',card->'age','city',card->'city',
    'profession',card->'occupation','bio',card->'bio','familyPreference',card->'familyPreference','interests',card->'interests'));
   result:=jsonb_set(result,'{introduction,contact}',coalesce(snapshot->'contact','null'::jsonb));
   result:=jsonb_set(result,'{introduction}',(result->'introduction')-'fit'||jsonb_build_object('reasons','[]'::jsonb));
  end if;
 end if;
 return result;
end $$;

alter function marriage.family_name(text) rename to family_name_before_profile_lifecycle;
create function marriage.family_name(actor text) returns text language sql stable set search_path='' as $$
 select coalesce((select approved_profile_snapshot#>>'{card,alias}' from marriage.members where 'member:'||id::text=actor
  and profile_review_pending and review_status='pending'),marriage.family_name_before_profile_lifecycle(actor))
$$;

-- Replacement photos follow the same monthly/public-review policy. Draft and
-- pending corrections are unrestricted. Removing a photo/restricting its reveal
-- remains available immediately and never consumes an editing allowance.
alter function marriage.portrait_commit(uuid) rename to portrait_commit_before_profile_lifecycle;
create function marriage.portrait_commit(photo_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();m marriage.members;result jsonb;before_photo jsonb;begin
 select * into strict m from marriage.members where id=me for update;
 before_photo:=marriage.portrait_json(me);
 if m.review_status='approved' and (before_photo->>'id') is distinct from photo_id::text then
  perform marriage.enforce_public_edit_interval(m.last_public_profile_edit_at);
  update marriage.members set profile_review_pending=true,approved_profile_snapshot=marriage.public_profile_snapshot(me) where id=me;
 end if;
 result:=marriage.portrait_commit_before_profile_lifecycle(photo_id);
 if m.review_status='approved' and before_photo is distinct from result then
  update marriage.members set review_status='pending',last_public_profile_edit_at=now() where id=me;
  insert into marriage.reviews(member_id,action) values(me,'submit');
 end if;
 return result;
end $$;

create or replace function marriage.gallery_access(target uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 if me=target then return true;end if;
 perform marriage.require_communication_member();
 -- Never expose a newly uploaded profile/gallery photo during pending review.
 return exists(select 1 from marriage.members where id=target and review_status='approved' and not suspended)
  and marriage.is_paid(target) and (marriage.compatible(me,target) or marriage.relationship_eligible(me,target));
end $$;

alter function marriage.gallery(text,uuid,uuid) rename to gallery_before_profile_lifecycle;
create function marriage.gallery(action text,photo_id uuid default null,subject uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();m marriage.members;p marriage.profile_gallery;result jsonb;new_photo boolean:=false;begin
 if action in('prepare','commit') then
  select * into strict m from marriage.members where id=me for update;
  if m.suspended then raise exception 'الحساب قيد مراجعة البلاغات.' using errcode='42501';end if;
  if action='prepare' and m.review_status='approved' then perform marriage.enforce_public_edit_interval(m.last_public_profile_edit_at);end if;
  if action='commit' then
   select * into p from marriage.profile_gallery where id=photo_id and member_id=me;
   new_photo:=p.id is not null and not p.ready;
   if m.review_status='approved' and new_photo then
    perform marriage.enforce_public_edit_interval(m.last_public_profile_edit_at);
    update marriage.members set profile_review_pending=true,approved_profile_snapshot=marriage.public_profile_snapshot(me) where id=me;
   end if;
  end if;
 end if;
 result:=marriage.gallery_before_profile_lifecycle(action,photo_id,subject);
 if action='commit' and m.review_status='approved' and new_photo then
  update marriage.members set review_status='pending',last_public_profile_edit_at=now() where id=me;
  insert into marriage.reviews(member_id,action) values(me,'submit');
 end if;
 return result;
end $$;
do $portrait$ declare definition text;begin
 definition:=pg_get_functiondef('marriage.portrait_revealed(uuid,uuid,text)'::regprocedure);
 execute replace(definition,'marriage.compatible(viewer,subject)','marriage.relationship_eligible(viewer,subject)');
end $portrait$;

revoke all on function marriage.relationship_member_allowed(uuid),marriage.relationship_open(uuid,uuid),marriage.relationship_eligible(uuid,uuid),
 marriage.require_communication_member(),marriage.public_profile_snapshot(uuid),marriage.enforce_public_edit_interval(timestamptz),
 marriage.member_card_before_profile_lifecycle(uuid,uuid),marriage.member_card(uuid,uuid),marriage.apply_profile_before_lifecycle(jsonb),
 marriage.apply_profile(jsonb),marriage.member_state_before_profile_lifecycle(uuid),marriage.member_state(uuid),
 marriage.family_name_before_profile_lifecycle(text),marriage.family_name(text),marriage.portrait_commit_before_profile_lifecycle(uuid),
 marriage.portrait_commit(uuid),marriage.gallery_before_profile_lifecycle(text,uuid,uuid),marriage.gallery(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.apply_profile(jsonb),marriage.portrait_commit(uuid),marriage.gallery(text,uuid,uuid) to authenticated;
