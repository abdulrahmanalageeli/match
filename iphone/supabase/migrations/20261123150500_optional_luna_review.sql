-- Membership review can use the submitted application without access to raw Luna messages.
create or replace function marriage.current_entry_receipt(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce($1 @> '{"version":"2026-11-07-privacy","adult":true,"terms":true,"privacy":true,"assessment":true,"sensitiveProfile":true}'::jsonb
   and ( $1->>'registrationVersion'='wudayn-entry-2026-11-23-v2'
       or ($1->>'registrationVersion'='wudayn-entry-2026-11-23' and $1->'transcript'='true'::jsonb))
   and jsonb_typeof($1->'transcript')='boolean'
   and jsonb_typeof($1->'sensitivePublication')='boolean'
   and jsonb_typeof($1->'photo')='boolean', false)
$$;
create function marriage.luna_review_receipt(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select marriage.current_entry_receipt($1) and $1->'transcript'='true'::jsonb and not ($1 ? 'withdrawnAt')
$$;
revoke all on function marriage.luna_review_receipt(jsonb) from public,anon,authenticated,service_role;

alter table marriage.interview_sessions drop constraint interview_sessions_review_entry_version_check;
alter table marriage.interview_sessions add constraint interview_sessions_review_entry_version_check
  check(review_entry_version in ('wudayn-entry-2026-11-23','wudayn-entry-2026-11-23-v2'));

create or replace function marriage.mark_interview_review_basis() returns trigger
language plpgsql security definer set search_path='' as $$
declare receipt jsonb;
begin
 select raw_app_meta_data->'signupConsent' into receipt from auth.users where id=new.member_id;
 if marriage.luna_review_receipt(receipt) then
   new.review_entry_version:=receipt->>'registrationVersion';
   new.review_receipt_at:=receipt->>'recordedAt';
 end if;
 return new;
end $$;

-- Each path that reads or records staff-reviewable content checks the same purpose,
-- the version in effect when the conversation started, and its exact receipt time.
do $migration$
declare signature regprocedure; definition text; updated text; session_alias text;
begin
 foreach signature in array array['marriage.review_interview_transcript(uuid,text)'::regprocedure,
   'marriage.luna_help_session()'::regprocedure,
   'public.wudayn_record_luna_help(uuid,timestamptz,text,text,text)'::regprocedure] loop
  definition:=pg_get_functiondef(signature);
  session_alias:=case when signature='marriage.review_interview_transcript(uuid,text)'::regprocedure then 'i' else 's' end;
  updated:=replace(definition,session_alias||$from$.review_entry_version='wudayn-entry-2026-11-23'$from$,
     session_alias||$to$.review_entry_version=u.raw_app_meta_data#>>'{signupConsent,registrationVersion}'$to$);
  if updated=definition or strpos(updated,'marriage.current_entry_receipt(')=0 then
    raise exception 'Luna permission guard changed for %',signature;
  end if;
  execute replace(updated,'marriage.current_entry_receipt(','marriage.luna_review_receipt(');
 end loop;
end $migration$;

create or replace function marriage.allowed_report_text(target uuid,sent_at timestamptz) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=target and u.raw_app_meta_data#>'{signupConsent,safetyTextReview}'='true'::jsonb
  and (u.raw_app_meta_data#>>'{signupConsent,registrationVersion}' in ('wudayn-entry-2026-11-23','wudayn-entry-2026-11-23-v2')
       or u.raw_app_meta_data#>>'{signupConsent,safetyVersion}'='wudayn-reported-text-v1')
  and greatest((u.raw_app_meta_data#>>'{signupConsent,recordedAt}')::timestamptz,(u.raw_app_meta_data#>>'{signupConsent,safetyRecordedAt}')::timestamptz) <= $2)
$$;
