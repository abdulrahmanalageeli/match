-- New account entry acknowledges the human report-review terms and records two
-- matching purposes. Optional purposes are granted separately in their features.
create function marriage.new_entry_choices(receipt jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(receipt @> '{"version":"2026-11-07-privacy","registrationVersion":"wudayn-entry-2026-11-23-v3","adult":true,"terms":true,"privacy":true,"sensitiveProfile":true,"assessment":true,"sensitivePublication":false,"photo":false,"transcript":false,"safetyTextReview":false}'::jsonb,false)
$$;

create function marriage.required_signup_receipt(receipt jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
begin
 if not marriage.new_entry_choices(receipt) then raise exception 'أكمل الموافقات المطلوبة.' using errcode='22023'; end if;
 return jsonb_build_object('version','2026-11-07-privacy','registrationVersion','wudayn-entry-2026-11-23-v3',
   'membershipTermsVersion','wudayn-membership-safety-v1','recordedAt',now(),
   'adult',true,'terms',true,'privacy',true,'sensitiveProfile',true,'assessment',true,
   'sensitivePublication',false,'photo',false,'transcript',false,'safetyTextReview',false);
end $$;
revoke all on function marriage.new_entry_choices(jsonb),marriage.required_signup_receipt(jsonb) from public,anon,authenticated,service_role;

create or replace function marriage.current_entry_receipt(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(value @> '{"version":"2026-11-07-privacy","adult":true,"terms":true,"privacy":true,"assessment":true,"sensitiveProfile":true}'::jsonb
   and ((value->>'registrationVersion'='wudayn-entry-2026-11-23-v3'
         and value->>'membershipTermsVersion'='wudayn-membership-safety-v1' and jsonb_typeof(value->'recordedAt')='string')
       or value->>'registrationVersion'='wudayn-entry-2026-11-23-v2'
       or (value->>'registrationVersion'='wudayn-entry-2026-11-23' and value->'transcript'='true'::jsonb))
   and jsonb_typeof(value->'transcript')='boolean' and jsonb_typeof(value->'sensitivePublication')='boolean'
   and jsonb_typeof(value->'photo')='boolean',false)
$$;
create or replace function marriage.luna_review_receipt(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select marriage.current_entry_receipt(value) and value->'transcript'='true'::jsonb and not (value ? 'withdrawnAt')
    and (value->>'registrationVersion'<>'wudayn-entry-2026-11-23-v3'
         or (value->>'transcriptVersion'='wudayn-luna-review-v1' and jsonb_typeof(value->'transcriptRecordedAt')='string'))
$$;

create or replace function marriage.entry_agreements(command text,receipt jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); saved jsonb;
begin
 if command='read' then return (select raw_app_meta_data->'signupConsent' from auth.users where id=me); end if;
 select raw_app_meta_data->'signupConsent' into saved from auth.users where id=me for update;
 case command
 when 'accept' then
  if not marriage.new_entry_choices(receipt) then raise exception 'أكمل الموافقات المطلوبة.' using errcode='22023'; end if;
  if marriage.current_entry_receipt(saved) then return saved; end if;
  saved:=marriage.required_signup_receipt(receipt);
 when 'allowTranscript' then
  if not marriage.current_entry_receipt(saved) then raise exception 'أكمل موافقات التسجيل.' using errcode='22023'; end if;
  if marriage.luna_review_receipt(saved) then return saved; end if;
  saved:=(saved-'withdrawnAt')||jsonb_build_object('transcript',true,'transcriptVersion','wudayn-luna-review-v1','transcriptRecordedAt',now());
 when 'withdraw' then
  if not marriage.luna_review_receipt(saved) then return saved; end if;
  saved:=saved||jsonb_build_object('withdrawnAt',now());
  delete from marriage.interview_choice_dialogue where owner_key='member:'||me::text;
  update marriage.interview_sessions set review_entry_version=null,review_receipt_at=null,review_prompt_context='{}' where member_id=me;
 when 'allowSafety','withdrawSafety' then
  if jsonb_typeof(saved) is distinct from 'object' then raise exception 'أكمل موافقات التسجيل.' using errcode='22023'; end if;
  if (saved->'safetyTextReview'='true'::jsonb) is not distinct from (command='allowSafety') then return saved; end if;
  saved:=saved||jsonb_build_object('safetyTextReview',command='allowSafety','safetyRecordedAt',now(),'safetyVersion','wudayn-reported-text-v1');
 else raise exception 'طلب غير صالح.' using errcode='22023';
 end case;
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||jsonb_build_object('signupConsent',saved) where id=me;
 return saved;
end $$;

alter table marriage.interview_sessions drop constraint interview_sessions_review_entry_version_check;
alter table marriage.interview_sessions add constraint interview_sessions_review_entry_version_check
  check(review_entry_version in ('wudayn-entry-2026-11-23','wudayn-entry-2026-11-23-v2','wudayn-entry-2026-11-23-v3'));

create or replace function marriage.mark_interview_review_basis() returns trigger
language plpgsql security definer set search_path='' as $$
declare receipt jsonb;
begin
 select raw_app_meta_data->'signupConsent' into receipt from auth.users where id=new.member_id;
 if marriage.luna_review_receipt(receipt) then
   new.review_entry_version:=receipt->>'registrationVersion';
   new.review_receipt_at:=coalesce(receipt->>'transcriptRecordedAt',receipt->>'recordedAt');
 end if;
 return new;
end $$;

do $migration$
declare signature regprocedure; definition text; updated text;
begin
 foreach signature in array array['marriage.review_interview_transcript(uuid,text)'::regprocedure,
   'marriage.luna_help_session()'::regprocedure,
   'public.wudayn_record_luna_help(uuid,timestamptz,text,text,text)'::regprocedure] loop
  definition:=pg_get_functiondef(signature);
  updated:=replace(definition,$from$review_receipt_at=u.raw_app_meta_data#>>'{signupConsent,recordedAt}'$from$,
    $to$review_receipt_at=coalesce(u.raw_app_meta_data#>>'{signupConsent,transcriptRecordedAt}',u.raw_app_meta_data#>>'{signupConsent,recordedAt}')$to$);
  if updated=definition then raise exception 'Missing Luna grant-time guard: %',signature; end if;
  execute updated;
 end loop;

 definition:=pg_get_functiondef('marriage.complete_social_onboarding(text,text,jsonb)'::regprocedure);
 updated:=replace(definition,'not marriage.current_entry_receipt(consent)','not marriage.new_entry_choices(consent)');
 if updated=definition then raise exception 'Missing social entry consent guard'; end if;
 definition:=updated;
 updated:=replace(definition,$from$'signupConsent',consent||jsonb_build_object('recordedAt',now())$from$,
    $to$'signupConsent',marriage.required_signup_receipt(consent)||jsonb_build_object('sms',true)$to$);
 if updated=definition then raise exception 'Missing social entry receipt writer'; end if;
 execute updated;
end $migration$;
