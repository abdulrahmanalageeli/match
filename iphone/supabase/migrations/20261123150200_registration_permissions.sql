-- The historical profile consent version describes its existing processing contract.
-- The separate entry version attests the new purposes and never upgrades older sessions.
create function marriage.current_entry_receipt(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce($1 @> '{"version":"2026-11-07-privacy","registrationVersion":"wudayn-entry-2026-11-23","adult":true,"terms":true,"privacy":true,"assessment":true,"sensitiveProfile":true,"transcript":true}'::jsonb
    and jsonb_typeof($1->'sensitivePublication')='boolean' and jsonb_typeof($1->'photo')='boolean' and not ($1 ? 'withdrawnAt'),false)
$$;
alter table marriage.interview_sessions add column review_entry_version text
 check (review_entry_version='wudayn-entry-2026-11-23');
alter table marriage.interview_sessions add column review_receipt_at text;
create table marriage.interview_choice_dialogue (
 id bigint generated always as identity primary key,
 owner_key text not null references marriage.interview_sessions(owner_key) on delete cascade,
 question text not null check(char_length(question) between 1 and 600),
 member_message text not null check(char_length(member_message) between 1 and 1200),
 reply text not null check(char_length(reply) between 1 and 3600),
 created_at timestamptz not null default now()
);
create index interview_choice_dialogue_session on marriage.interview_choice_dialogue(owner_key,id);
alter table marriage.interview_choice_dialogue enable row level security;
revoke all on marriage.interview_choice_dialogue from public,anon,authenticated,service_role;

create function marriage.mark_interview_review_basis() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from auth.users u where u.id=new.member_id and marriage.current_entry_receipt(u.raw_app_meta_data->'signupConsent')) then
   new.review_entry_version:='wudayn-entry-2026-11-23';
   select raw_app_meta_data#>>'{signupConsent,recordedAt}' into new.review_receipt_at from auth.users where id=new.member_id;
 end if;
 return new;
end $$;
create trigger interview_review_basis before insert on marriage.interview_sessions
 for each row execute function marriage.mark_interview_review_basis();

-- The scoring contract canonicalizes the optional next-step question. Preserve any
-- accompanying reply the member actually answered, separate from scoring and drafts.
alter table marriage.interview_sessions add column review_prompt_context jsonb not null default '{}';
create function marriage.keep_interview_prompt_context() returns trigger language plpgsql set search_path='' as $$
declare last_turn jsonb; rendered text:=old.document#>>'{currentQuestion,text}';
begin
 if new.review_entry_version is not null and jsonb_array_length(new.document->'turns')>jsonb_array_length(old.document->'turns') then
  last_turn:=new.document->'turns'->-1;
  if rendered is not null and rendered<>(last_turn->>'question') and strpos(rendered,last_turn->>'question')>0 then
   new.review_prompt_context:=new.review_prompt_context||jsonb_build_object(last_turn->>'id',rendered);
  end if;
 end if;
 return new;
end $$;
create trigger keep_interview_prompt_context before update of document on marriage.interview_sessions
 for each row execute function marriage.keep_interview_prompt_context();
revoke all on function marriage.keep_interview_prompt_context() from public,anon,authenticated,service_role;

create function marriage.entry_agreements(command text,receipt jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); saved jsonb;
begin
 if command='accept' then
  if not marriage.current_entry_receipt(receipt) then raise exception 'راجع موافقات التسجيل.' using errcode='22023'; end if;
  select jsonb_object_agg(k,receipt->k) into saved from unnest(array['version','registrationVersion','adult','terms','privacy','assessment','sensitiveProfile','sensitivePublication','photo','transcript','safetyTextReview']) k;
  saved:=saved || jsonb_build_object('recordedAt',now());
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||jsonb_build_object('signupConsent',saved) where id=me;
 elsif command in ('withdrawSafety','allowSafety') then
  if not exists(select 1 from auth.users where id=me and jsonb_typeof(raw_app_meta_data->'signupConsent')='object') then
    raise exception 'راجع موافقات التسجيل.' using errcode='22023'; end if;
  update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{signupConsent}',
   (raw_app_meta_data->'signupConsent')||jsonb_build_object('safetyTextReview',command='allowSafety','safetyRecordedAt',now(),
   'safetyVersion','wudayn-reported-text-v1')) where id=me;
 elsif command='withdraw' then
  update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{signupConsent,withdrawnAt}',to_jsonb(now()))
    where id=me and marriage.current_entry_receipt(raw_app_meta_data->'signupConsent');
  delete from marriage.interview_choice_dialogue where owner_key='member:'||me::text;
  update marriage.interview_sessions set review_entry_version=null,review_receipt_at=null,review_prompt_context='{}' where member_id=me;
 elsif command is distinct from 'read' then raise exception 'طلب غير صالح.' using errcode='22023'; end if;
 return (select raw_app_meta_data->'signupConsent' from auth.users where id=me);
end $$;
create function public.wudayn_registration_agreements(command text,receipt jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$ select marriage.entry_agreements($1,$2) $$;

create function marriage.review_interview_transcript(target uuid, purpose text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']); s marriage.interview_sessions;
begin
 if purpose is null or char_length(trim(purpose)) not between 10 and 240 then raise exception 'وضّح سبب مراجعة طلب العضوية.' using errcode='22023'; end if;
 select i.* into s from marriage.interview_sessions i join auth.users u on u.id=i.member_id
  where i.member_id=target and i.expires_at>now() and i.review_entry_version='wudayn-entry-2026-11-23'
    and i.review_receipt_at=u.raw_app_meta_data#>>'{signupConsent,recordedAt}'
    and marriage.current_entry_receipt(u.raw_app_meta_data->'signupConsent');
 if not found then return null; end if;
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
   values(staff.user_id,staff.display_name,staff.role,'luna_transcript_reviewed','member',target,trim(purpose));
 return jsonb_build_object('turns',(select coalesce(jsonb_agg(jsonb_build_object('question',coalesce(s.review_prompt_context->>(value->>'id'),value->>'question'),'answer',value->'answer','skipped',value->'skipped') order by ord),'[]')
   from jsonb_array_elements(s.document->'turns') with ordinality t(value,ord)),
   'help',(select coalesce(jsonb_agg(jsonb_build_object('question',h.question,'member',h.member_message,'reply',h.reply) order by h.id),'[]')
     from marriage.interview_choice_dialogue h where h.owner_key=s.owner_key),
   'currentQuestion',s.document#>>'{currentQuestion,text}','updatedAt',s.updated_at,'expiresAt',s.expires_at);
end $$;
create function public.wudayn_review_interview_transcript(member uuid,purpose text) returns jsonb
language sql security invoker set search_path='' as $$select marriage.review_interview_transcript($1,$2)$$;

revoke all on function marriage.current_entry_receipt(jsonb),marriage.mark_interview_review_basis(),marriage.entry_agreements(text,jsonb),public.wudayn_registration_agreements(text,jsonb),marriage.review_interview_transcript(uuid,text),public.wudayn_review_interview_transcript(uuid,text) from public,anon,authenticated,service_role;
grant execute on function marriage.entry_agreements(text,jsonb),public.wudayn_registration_agreements(text,jsonb),marriage.review_interview_transcript(uuid,text),public.wudayn_review_interview_transcript(uuid,text) to authenticated;

-- Keep the private matching answer independent of its optional publication for this entry version.
do $migration$
declare old_body text; new_body text; guard text; replacement text;
begin
 old_body:=pg_get_functiondef('marriage.apply_profile_before_answer_provenance(jsonb)'::regprocedure);
 guard:=$src$or payload #> '{signupConsents,sensitivePublication}' is distinct from 'true'::jsonb$src$;
 replacement:=guard||$src$ and not exists(select 1 from auth.users u where u.id=me and marriage.current_entry_receipt(u.raw_app_meta_data->'signupConsent'))$src$;
 new_body:=replace(old_body,guard,replacement);
 if new_body=old_body then raise exception 'Missing registration consent guard'; end if;
 execute new_body;
 old_body:=pg_get_functiondef('marriage.registration_review_reasons(uuid)'::regprocedure);
 guard:=$src$"sensitivePublication":true,$src$;
 new_body:=replace(old_body,guard,'');
 if new_body=old_body then raise exception 'Missing admission consent guard'; end if;
 new_body:=replace(new_body,$src$or profile->>'gender'='man'$src$,$src$or (consent->'sensitivePublication' is distinct from 'true'::jsonb and not exists(select 1 from auth.users u where u.id=target and marriage.current_entry_receipt(u.raw_app_meta_data->'signupConsent')))
      or profile->>'gender'='man'$src$);
 execute new_body;
end $migration$;

-- OAuth creates the Auth identity first; require the same server-validated entry choices
-- when completing SMS onboarding. Completed historical social accounts are untouched.
do $migration$
declare old_body text:=pg_get_functiondef('marriage.complete_social_onboarding(text,text,jsonb)'::regprocedure);
 new_body text;
begin
 new_body:=replace(old_body,$src$if consent->>'version' is distinct from '2026-11-07-privacy'$src$,
   $src$if not marriage.current_entry_receipt(consent) or consent->>'version' is distinct from '2026-11-07-privacy'$src$);
 if new_body=old_body then raise exception 'Missing social registration consent guard'; end if;
 execute new_body;
end $migration$;

-- Only an authenticated server-generated helper reply is recorded. Use the original
-- session creation time so an in-flight reply cannot be attached to a restarted session.
create function marriage.luna_help_session() returns timestamptz language sql stable security definer set search_path='' as $$
 select s.consented_at from marriage.interview_sessions s join auth.users u on u.id=s.member_id
 where s.member_id=marriage.require_member() and s.expires_at>now() and s.review_entry_version='wudayn-entry-2026-11-23'
 and s.review_receipt_at=u.raw_app_meta_data#>>'{signupConsent,recordedAt}' and marriage.current_entry_receipt(u.raw_app_meta_data->'signupConsent')
$$;
revoke all on function marriage.luna_help_session() from public,anon,authenticated,service_role;
grant execute on function marriage.luna_help_session() to authenticated;
create or replace function public.marriage_interview(command text,payload jsonb default '{}',test_token text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=nisfayn_ai.interview($1,$2,$3);
 if command='reserve' and coalesce(test_token,'')='' and result->>'status'='allowed' then
   result:=result||jsonb_build_object('reviewSession',marriage.luna_help_session());
 elsif command in ('load','start','save') and coalesce(test_token,'')='' and jsonb_typeof(result->'document')='object' then
   result:=result||jsonb_build_object('transcriptReviewAuthorized',marriage.luna_help_session() is not null);
 end if;
 return result;
end $$;
create function public.wudayn_record_luna_help(member uuid,session_started timestamptz,question text,member_message text,reply text)
returns void language plpgsql security definer set search_path='' as $$
declare session_key text;
begin
 select s.owner_key into session_key from marriage.interview_sessions s join auth.users u on u.id=s.member_id
 where s.member_id=$1 and s.consented_at=$2 and s.expires_at>now() and s.review_entry_version='wudayn-entry-2026-11-23'
 and s.review_receipt_at=u.raw_app_meta_data#>>'{signupConsent,recordedAt}' and marriage.current_entry_receipt(u.raw_app_meta_data->'signupConsent')
 for update of s;
 if session_key is not null then
  insert into marriage.interview_choice_dialogue(owner_key,question,member_message,reply) values(session_key,$3,$4,$5);
 end if;
end $$;
revoke all on function public.wudayn_record_luna_help(uuid,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.wudayn_record_luna_help(uuid,timestamptz,text,text,text) to service_role;
alter function marriage.personal_data() rename to personal_data_before_entry_review;
create function marriage.personal_data() returns jsonb language sql stable security definer set search_path='' as $$
 select marriage.personal_data_before_entry_review()||jsonb_build_object('lunaQuestionContext',(
 select s.review_prompt_context from marriage.interview_sessions s where s.member_id=marriage.require_member() and s.expires_at>now()),
 'lunaQuestionHelp',(
 select coalesce(jsonb_agg(jsonb_build_object('question',h.question,'message',h.member_message,'reply',h.reply,'sentAt',h.created_at) order by h.id),'[]')
 from marriage.interview_choice_dialogue h join marriage.interview_sessions s using(owner_key)
 where s.member_id=marriage.require_member() and s.expires_at>now()))
$$;
revoke all on function marriage.personal_data(),marriage.personal_data_before_entry_review() from public,anon,authenticated,service_role;
grant execute on function marriage.personal_data() to authenticated;

-- Only the reporter can select a single incoming message for processor-assisted triage.
-- The queue stores its evidence reference, scope version and decision, never a copy of the text.
create table marriage.report_text_triage(
 incident_id uuid primary key references marriage.report_evidence(report_id) on delete cascade,
 version text not null default 'wudayn-reported-text-v1' check(version='wudayn-reported-text-v1'),
 created_at timestamptz not null default now(), lease uuid unique, lease_until timestamptz,
 result text check(result in('routine','priority')), classified_at timestamptz
);
alter table marriage.report_text_triage enable row level security;
revoke all on marriage.report_text_triage from public,anon,authenticated,service_role;
create index report_text_triage_next on marriage.report_text_triage(created_at) where result is null;
create function marriage.allowed_report_text(target uuid,sent_at timestamptz) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=target and u.raw_app_meta_data#>'{signupConsent,safetyTextReview}'='true'::jsonb
  and (u.raw_app_meta_data#>>'{signupConsent,registrationVersion}'='wudayn-entry-2026-11-23'
       or u.raw_app_meta_data#>>'{signupConsent,safetyVersion}'='wudayn-reported-text-v1')
  and greatest((u.raw_app_meta_data#>>'{signupConsent,recordedAt}')::timestamptz,(u.raw_app_meta_data#>>'{signupConsent,safetyRecordedAt}')::timestamptz) <= $2)
$$;
create function marriage.report_review_message(request_id uuid,message_id uuid,reason text,submission_id uuid,context_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); incident uuid;
begin
 if cardinality(context_ids)>0 then incident:=marriage.report_incident_context($1,$2,$3,$4,$5,true);
 else incident:=marriage.report_incident_with_screen($1,$2,$3,$4); end if;
 insert into marriage.report_text_triage(incident_id)
 select r.id from marriage.reports r join marriage.report_evidence e on e.report_id=r.id
 where r.id=incident and r.member_id=me and e.message_id=$2 and e.kind is null and length(trim(e.excerpt))>0
 and r.resolved_at is null and e.expires_at>now() and marriage.allowed_report_text(r.reported_id,e.sent_at)
 on conflict(incident_id) do nothing;
 return incident;
end $$;
create function public.wudayn_report_review_message(request_id uuid,message_id uuid,reason text,submission_id uuid,context_ids uuid[] default '{}')
returns uuid language sql security invoker set search_path='' as $$ select marriage.report_review_message($1,$2,$3,$4,$5) $$;
revoke all on function marriage.allowed_report_text(uuid,timestamptz),marriage.report_review_message(uuid,uuid,text,uuid,uuid[]),public.wudayn_report_review_message(uuid,uuid,text,uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function marriage.report_review_message(uuid,uuid,text,uuid,uuid[]),public.wudayn_report_review_message(uuid,uuid,text,uuid,uuid[]) to authenticated;

create function public.wudayn_report_text_triage(command text,ticket uuid,decision text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job marriage.report_text_triage; snippet text;
begin
 if ticket is null or command not in ('claim','finish') or command is null then raise exception 'Invalid triage request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('reported-text:'||ticket,0));
 if command='claim' then
  select q.* into job from marriage.report_text_triage q join marriage.reports r on r.id=q.incident_id
   join marriage.report_evidence e on e.report_id=r.id where q.result is null and r.resolved_at is null and e.expires_at>now()
   and marriage.allowed_report_text(r.reported_id,e.sent_at) and (q.lease=ticket or q.lease_until is null or q.lease_until<=now())
   and (q.lease=ticket or not exists(select 1 from marriage.report_text_triage existing where existing.lease=ticket))
   order by (q.lease=ticket) desc nulls last,q.created_at,q.incident_id limit 1 for update of q skip locked;
  if not found then return null; end if;
  update marriage.report_text_triage set lease=ticket,lease_until=now()+interval '2 minutes' where incident_id=job.incident_id;
  select left(e.excerpt,800) into snippet from marriage.report_evidence e where e.report_id=job.incident_id;
  return jsonb_build_object('excerpt',snippet);
 end if;
 if decision is null or decision not in ('routine','priority') then raise exception 'Invalid triage result'; end if;
 update marriage.report_text_triage q set result=decision,classified_at=now()
 from marriage.reports r join marriage.report_evidence e on e.report_id=r.id
 where q.lease=ticket and q.lease_until>now() and q.result is null and q.incident_id=r.id and r.resolved_at is null and e.expires_at>now()
 and marriage.allowed_report_text(r.reported_id,e.sent_at);
 return jsonb_build_object('recorded',found);
end $$;
revoke all on function public.wudayn_report_text_triage(text,uuid,text) from public,anon,authenticated;
grant execute on function public.wudayn_report_text_triage(text,uuid,text) to service_role;
do $migration$
declare old_body text:=pg_get_functiondef('marriage.admin_reports(text,uuid)'::regprocedure); new_body text;
begin
 new_body:=replace(old_body,'or exists(select 1 from marriage.conduct_screenings sc where sc.incident_id=c.id)',
  'or exists(select 1 from marriage.conduct_screenings sc where sc.incident_id=c.id) or exists(select 1 from marriage.report_text_triage tx where tx.incident_id=c.id and tx.result=''priority'')');
 if old_body=new_body then raise exception 'Missing report priority projection'; end if;
 execute new_body;
end $migration$;
