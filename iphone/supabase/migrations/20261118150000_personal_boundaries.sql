-- All new member email registrations require the same phone ownership proof.
update marriage.signup_sms_settings set required=true where id;
create or replace function marriage.queue_social_onboarding() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.raw_app_meta_data->>'provider' in ('google','apple','email')
   and new.raw_app_meta_data->'guardian_account' is distinct from 'true'::jsonb
   and not exists(select 1 from marriage.signup_phone_verifications where user_id=new.id) then
  insert into marriage.social_onboarding(user_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;

-- One rule for both directions, including consumers outside discovery.
create function marriage.permanent_boundary(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.blocks where (member_id=a and blocked_id=b) or (member_id=b and blocked_id=a))
 or exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(a,b)
 and greatest(r.requester_id,r.recipient_id)=greatest(a,b)
 and r.status in ('declined','closed','cancelled') and marriage.request_suppresses_discovery(r))
 or exists(select 1 from marriage.introductions where member_a=least(a,b) and member_b=greatest(a,b) and closed_at is not null)
$$;
revoke all on function marriage.permanent_boundary(uuid,uuid) from public,anon,authenticated;

-- Store the name visible at the time of a block. Never refresh it from later profile edits.
create function marriage.closure_alias(subject uuid) returns text language sql stable set search_path='' as $$
 select case when m.review_status='approved' then p.display_name
   when m.profile_review_pending then m.approved_profile_snapshot#>>'{card,alias}' end
 from marriage.members m left join marriage.profiles p on p.member_id=m.id where m.id=subject
$$;
revoke all on function marriage.closure_alias(uuid) from public,anon,authenticated;
alter table marriage.blocks add column blocked_alias text;
-- Recover historical names only from the existing closure records.
update marriage.blocks b set blocked_alias=(
 select case when r.requester_id=b.member_id then r.closed_recipient_alias else r.closed_requester_alias end
 from marriage.member_requests r where b.member_id in(r.requester_id,r.recipient_id)
  and b.blocked_id in(r.requester_id,r.recipient_id) and r.closed_at is not null
 order by r.closed_at desc,r.id limit 1
);
create function marriage.freeze_block_alias() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if marriage.permanent_boundary(new.member_id,new.blocked_id) then
  select case when r.requester_id=new.member_id then r.closed_recipient_alias else r.closed_requester_alias end into new.blocked_alias
  from marriage.member_requests r where new.member_id in(r.requester_id,r.recipient_id) and new.blocked_id in(r.requester_id,r.recipient_id)
   and r.closed_at is not null order by r.closed_at desc limit 1;
 else
  new.blocked_alias:=marriage.closure_alias(new.blocked_id);
 end if;
 return new;
end $$;
revoke all on function marriage.freeze_block_alias() from public,anon,authenticated;
create trigger freeze_block_alias before insert on marriage.blocks for each row execute function marriage.freeze_block_alias();

-- Existing implementations keep their ACLs. Abort if an upstream definition changes.
do $migration$
declare patch record; original text;
begin
 for patch in select * from (values
 ('marriage.matching_exclusions()','coalesce(p.display_name,','coalesce(b.blocked_alias,'),
 ('marriage.matching_exclusions()',' left join marriage.profiles p on p.member_id=b.blocked_id',''),
 ('marriage.stamp_request_closure()',$s$marriage.member_card(new.recipient_id,new.requester_id)->>'alias'$s$,'marriage.closure_alias(new.requester_id)'),
 ('marriage.stamp_request_closure()',$s$marriage.member_card(new.requester_id,new.recipient_id)->>'alias'$s$,'marriage.closure_alias(new.recipient_id)'),
 ('marriage.compatible(uuid,uuid)','select marriage.compatible_before_exclusivity','select not marriage.permanent_boundary(a,b) and marriage.compatible_before_exclusivity'),
 ('marriage.relationship_open(uuid,uuid)','select a<>b and','select a<>b and not marriage.permanent_boundary(a,b) and'),
 ('marriage.act_request(uuid,text,text)','if not marriage.relationship_member_allowed(me) or not marriage.relationship_member_allowed(peer) or not marriage.compatible(me,peer) then',
  'if action not in (''decline'',''cancel'') and (not marriage.relationship_member_allowed(me) or not marriage.relationship_member_allowed(peer) or not marriage.compatible(me,peer)) then'),
 ('marriage.act_request(uuid,text,text)',$s$if not exists(select 1 from marriage.reports p where p.member_id=me and p.reported_id=peer) then
        insert into marriage.reports(member_id,reported_id,reason) values(me,peer,btrim(reason));
      end if;$s$,'insert into marriage.reports(member_id,reported_id,reason) values(me,peer,btrim(reason));'),
 ('marriage.respond(uuid,text,text)','on conflict(member_id,reported_id) do nothing',''),
 ('marriage.discovery_action(uuid,text,text)',$s$if not exists(select 1 from marriage.reports where reports.member_id=me and reported_id=$1) then
    insert into marriage.reports(member_id,reported_id,reason) values(me,$1,btrim($3));end if;$s$,'insert into marriage.reports(member_id,reported_id,reason) values(me,$1,btrim($3));'),
 ('marriage.discovery_action(uuid,text,text)','me uuid:=marriage.require_discovery_member()', 'me uuid:=marriage.require_member()'),
 ('marriage.discovery_action(uuid,text,text)','if not marriage.relationship_member_allowed($1)', $s$if action='report' and exists(select 1 from marriage.blocks b where b.member_id=me and b.blocked_id=$1) then
    if length(btrim(coalesce(reason,''))) not between 3 and 500 then raise exception 'اختر سبب البلاغ.' using errcode='22023';end if;
    insert into marriage.reports(member_id,reported_id,reason) values(me,$1,btrim($3));return;
  end if;
  if action not in ('block','report') then perform marriage.require_discovery_member(); end if;
  if (action not in ('block','report') and not marriage.relationship_member_allowed($1))$s$),
 ('marriage.discovery_action(uuid,text,text)',$s$elsif action in('dismiss','report') then$s$,$s$elsif action in('dismiss','report','block') then
   if action='block' then insert into marriage.blocks(member_id,blocked_id) values(me,$1) on conflict do nothing; end if;$s$),
 ('marriage.discovery_action(uuid,text,text)',$s$if action in('interest','report') then perform realtime.send$s$,
  $s$if action in('interest','report','block') then perform realtime.send$s$)
 ) as changes(proc,needle,replacement) loop
  original:=replace(pg_get_functiondef(patch.proc::regprocedure),chr(13),'');
  patch.needle:=replace(patch.needle,chr(13),'');
  if strpos(original,patch.needle)=0 then raise exception 'Unexpected safety migration definition: %',patch.proc; end if;
  execute replace(original,patch.needle,patch.replacement);
 end loop;
end $migration$;
alter table marriage.reports drop constraint reports_member_id_reported_id_key;

-- A member can reach older closed cases from Settings after their subscription ends.
create function marriage.request_history_page(before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); cursor_at timestamptz;
begin
 perform marriage.expire_my_requests();
 if before_id is not null then
  select coalesce(closed_at,updated_at) into cursor_at from marriage.member_requests
   where id=before_id and me in(requester_id,recipient_id) and status in('closed','cancelled','declined');
  if not found then return '[]'; end if;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,
   'alias',coalesce(case when r.requester_id=me then r.closed_recipient_alias else r.closed_requester_alias end,'عضو'),
   'direction',case when r.requester_id=me then 'outgoing' else 'incoming' end,
   'createdAt',r.created_at,'closedAt',r.closed_at,'outcome',coalesce(r.closure_outcome,'closed'))
   order by r.sort_at desc,r.id),'[]') from (
   select *,coalesce(closed_at,updated_at) sort_at from marriage.member_requests
   where me in(requester_id,recipient_id) and status in('closed','cancelled','declined')
    and (before_id is null or coalesce(closed_at,updated_at)<cursor_at or (coalesce(closed_at,updated_at)=cursor_at and id>before_id))
   order by sort_at desc,id limit 50) r);
end $$;
create or replace function marriage.request_history() returns jsonb language sql security definer set search_path='' as $$select marriage.request_history_page(null)$$;
create function public.marriage_request_history_page(before_id uuid) returns jsonb language sql security invoker set search_path='' as $$select marriage.request_history_page($1)$$;
revoke all on function marriage.request_history_page(uuid),public.marriage_request_history_page(uuid) from public,anon;
grant execute on function marriage.request_history_page(uuid),public.marriage_request_history_page(uuid) to authenticated;

-- The public declaration is independently selected and can be withdrawn.
alter table marriage.members add column directory_work_choice text check(directory_work_choice in ('A','B','C'));
create function marriage.directory_work(choice text, writing boolean) returns text
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if writing then update marriage.members set directory_work_choice=choice where id=me; end if;
 return (select directory_work_choice from marriage.members where id=me);
end $$;
create function public.marriage_directory_work(choice text default null,writing boolean default false) returns text
language sql security invoker set search_path='' as $$select marriage.directory_work(choice,writing)$$;
revoke all on function marriage.directory_work(text,boolean),public.marriage_directory_work(text,boolean) from public,anon;
grant execute on function marriage.directory_work(text,boolean),public.marriage_directory_work(text,boolean) to authenticated;

create table marriage.safety_usage (
 member_id uuid references marriage.members on delete cascade, purpose text, window_start timestamptz,
 hits integer not null, primary key(member_id,purpose,window_start)
);
alter table marriage.safety_usage enable row level security;
revoke all on marriage.safety_usage from public,anon,authenticated;
create function marriage.consume_safety_budget(actor uuid,purpose text,period interval,maximum integer) returns void
language plpgsql set search_path='' as $$
declare n integer;
begin
 insert into marriage.safety_usage values(actor,purpose,date_bin(period,statement_timestamp(),'2020-01-01 UTC'::timestamptz),1)
 on conflict on constraint safety_usage_pkey do update set hits=marriage.safety_usage.hits+1 returning hits into n;
 if n>maximum then raise exception 'تمهّل قليلًا قبل المحاولة مجددًا.' using errcode='P0001'; end if;
end $$;
revoke all on function marriage.consume_safety_budget(uuid,text,interval,integer) from public,anon,authenticated;

do $migration$
declare d text; patch record;
begin
 for patch in select * from (values
 ('marriage.browse(jsonb)',$s$exists(select 1 from marriage.member_answers where member_id=p.member_id and question_code='wife_work' and option_code=options->>'work')$s$,
  $s$exists(select 1 from marriage.members m where m.id=p.member_id and m.directory_work_choice=options->>'work')$s$),
 ('marriage.browse(jsonb)','if skip<0',$s$perform marriage.consume_safety_budget(me,'browse','1 minute',30);
 perform marriage.consume_safety_budget(me,'browse_day','1 day',250); if skip<0$s$),
 ('marriage.discover(integer,integer,text,uuid)','perform marriage.ensure_week',$s$perform marriage.consume_safety_budget(me,'browse','1 minute',30);
 perform marriage.consume_safety_budget(me,'browse_day','1 day',250); perform marriage.ensure_week$s$)
 ) as changes(proc,needle,replacement) loop
 d:=pg_get_functiondef(patch.proc::regprocedure);
 if strpos(d,patch.needle)=0 then raise exception 'Unexpected directory definition: %',patch.proc; end if;
 execute replace(d,patch.needle,patch.replacement);
 end loop;
end $migration$;

create function marriage.before_mutual_fit(fit jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare summary jsonb;
begin
  select coalesce(jsonb_object_agg(key,value),'{}') into summary from jsonb_each(coalesce(nullif(fit,'null'),'{}'))
   where key in('version','band','percentage','assessmentComplete','provisional','covered','total');
  if jsonb_typeof(fit->'personality')='object' then
   summary:=summary||jsonb_build_object('personality',(select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(fit->'personality')
     where key in('version','complete','covered','total','percentage'))||jsonb_build_object('similarities','[]'::jsonb,'differences','[]'::jsonb));
  end if;
  return summary||jsonb_build_object('strengths','[]'::jsonb,'discussion','[]'::jsonb,'missing','[]'::jsonb);
end $$;
revoke all on function marriage.before_mutual_fit(jsonb) from public,anon,authenticated;

-- All public card projections use this function, including historic notifications.
alter function marriage.member_card(uuid,uuid) rename to member_card_before_boundaries;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare card jsonb;
begin
 if viewer<>subject and marriage.permanent_boundary(viewer,subject) then return '{}'::jsonb; end if;
 card:=marriage.member_card_before_boundaries(viewer,subject);
 if viewer is not null and viewer<>subject and not marriage.relationship_open(viewer,subject) and card?'fit' then
  card:=jsonb_set(card,'{fit}',marriage.before_mutual_fit(card->'fit'))||jsonb_build_object('reasons','[]'::jsonb);
 end if;
 return card;
end $$;
revoke all on function marriage.member_card(uuid,uuid),marriage.member_card_before_boundaries(uuid,uuid) from public,anon,authenticated;

-- Legacy curated introductions also carry a fit projection outside the member card.
alter function marriage.member_state(uuid) rename to member_state_before_boundaries;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_boundaries(target); intro jsonb:=result->'introduction';
begin
 if jsonb_typeof(intro)='object' and intro->>'status' is distinct from 'mutual' then
  intro:=intro||jsonb_build_object('contact',null,'reasons','[]'::jsonb);
  if jsonb_typeof(intro->'fit')='object' then intro:=jsonb_set(intro,'{fit}',marriage.before_mutual_fit(intro->'fit')); end if;
  result:=jsonb_set(result,'{introduction}',intro);
 end if;
 return result;
end $$;
revoke all on function marriage.member_state(uuid),marriage.member_state_before_boundaries(uuid) from public,anon,authenticated;

-- Revalidate a card already on screen without returning any peer data.
create function marriage.profile_visible(subject uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 return marriage.relationship_eligible(me,subject) or (marriage.relationship_member_allowed(me) and marriage.relationship_member_allowed(subject)
   and marriage.compatible(me,subject) and marriage.new_pair_requirements(me,subject) and not exists(select 1 from marriage.discovery_choices d where d.member_id=me and d.subject_id=subject and d.hidden));
end $$;
create function public.marriage_profile_visible(subject uuid) returns boolean language sql stable security invoker set search_path='' as $$select marriage.profile_visible($1)$$;
revoke all on function marriage.profile_visible(uuid),public.marriage_profile_visible(uuid) from public,anon;
grant execute on function marriage.profile_visible(uuid),public.marriage_profile_visible(uuid) to authenticated;

-- Charge actual changes only, not retries, initial signup, or resaving the same answers.
alter function marriage.apply_profile(jsonb) rename to apply_profile_before_safety;
revoke all on function marriage.apply_profile_before_safety(jsonb) from public,anon,authenticated;
create function marriage.apply_profile(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); prior jsonb; result jsonb; after_answers jsonb;
begin
 perform 1 from marriage.members where id=me for update;
 prior:=marriage.signup_assessment_snapshot(marriage.profile_json(me));
 result:=marriage.apply_profile_before_safety(payload);
 after_answers:=marriage.signup_assessment_snapshot(marriage.profile_json(me));
 if prior is distinct from after_answers then
  -- Withdrawal remains available even when the editing budget has been used.
  if coalesce(after_answers,'{}')<>'{}' and payload#>'{signupConsents,assessment}' is distinct from 'false'::jsonb
    and (coalesce(prior,'{}')<>'{}' or exists(select 1 from marriage.safety_usage where member_id=me and purpose in('assessment_seen','assessment'))) then
   perform marriage.consume_safety_budget(me,'assessment','1 day',3);
  end if;
  insert into marriage.safety_usage values(me,'assessment_seen',date_bin('1 day',statement_timestamp(),'2020-01-01 UTC'::timestamptz),1)
    on conflict do nothing;
 end if;
 return result;
end $$;
revoke all on function marriage.apply_profile(jsonb) from public,anon;
grant execute on function marriage.apply_profile(jsonb) to authenticated;

create function marriage.chat_flood_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform marriage.consume_safety_budget(new.sender_id,'send','1 minute',30);
 perform marriage.consume_safety_budget(new.sender_id,'chat:'||new.request_id,'1 minute',12);
 return new;
end $$;
revoke all on function marriage.chat_flood_guard() from public,anon,authenticated;
create trigger chat_flood_guard after insert on marriage.thread_messages for each row execute function marriage.chat_flood_guard();

-- Remove the legacy state decorator as well as its private photo reader.
do $migration$
declare d text; first_pos int; last_pos int;
begin
 d:=pg_get_functiondef('nisfayn_test.rpc_before_chat_privacy(text,text,jsonb)'::regprocedure);
 first_pos:=strpos(d,' if result->>''actor''=''abdulrahman'' and jsonb_typeof(result#>''{profiles,reham}'')=''object''');
 if first_pos>0 then
  last_pos:=strpos(substr(d,first_pos),' return result;');
  if last_pos=0 then raise exception 'Unexpected tester portrait projection'; end if;
  execute substr(d,1,first_pos-1)||substr(d,first_pos+last_pos-1);
 end if;
end $migration$;
drop function if exists public.nisfayn_test_live_reham_portrait(text,uuid);
drop function if exists nisfayn_test.live_reham_portrait(text,uuid);
