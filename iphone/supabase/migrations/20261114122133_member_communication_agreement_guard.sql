-- Enforce the existing seriousness gate for real members as well as the private
-- tester flow. History, agreement negotiation and cleanup remain available.
create function marriage.agreement_allows_communication(request_id uuid) returns boolean
language plpgsql stable set search_path='' as $$
declare agreement jsonb; deadline timestamptz;
begin
 select data into agreement from marriage.conversation_agreements where conversation_agreements.request_id=$1;
 if agreement->>'status'='family' then return true;end if;
 if agreement->>'status' is distinct from 'accepted' then return false;end if;
 begin deadline:=(agreement->>'deadline')::timestamptz;
 exception when invalid_datetime_format or datetime_field_overflow then return false;end;
 return coalesce(isfinite(deadline) and deadline>now(),false);
end $$;
create function marriage.require_communication_agreement(request_id uuid) returns void
language plpgsql stable set search_path='' as $$
begin
 if not marriage.agreement_allows_communication($1) then
  raise exception 'أكملا اتفاق الجدية والمدة قبل بدء التواصل.' using errcode='42501';
 end if;
end $$;
revoke all on function marriage.agreement_allows_communication(uuid),marriage.require_communication_agreement(uuid) from public,anon,authenticated,service_role;

-- Patch the existing checked operations in place, preserving membership, pair
-- locks, idempotency, and grants. Unexpected definitions abort the migration.
do $$
declare definition text; original text;
begin
 original:=pg_get_functiondef('marriage.message(uuid,text,uuid)'::regprocedure);
 definition:=replace(original,'if client_id is null or length',
  'perform marriage.require_communication_agreement($1);' || E'\n  if client_id is null or length');
 if definition=original then raise exception 'Unexpected member message definition';end if;
 execute definition;

 original:=pg_get_functiondef('marriage.react_to_message(uuid,uuid,text)'::regprocedure);
 definition:=replace(original,'if reaction is not null and reaction not in',
  'if reaction is not null then perform marriage.require_communication_agreement($1);end if;' || E'\n if reaction is not null and reaction not in');
 if definition=original then raise exception 'Unexpected member reaction definition';end if;
 execute definition;

 original:=pg_get_functiondef('marriage.set_typing(uuid,boolean)'::regprocedure);
 definition:=replace(original,'if active is null then',
  'if active then perform marriage.require_communication_agreement($1);end if;' || E'\n if active is null then');
 if definition=original then raise exception 'Unexpected member typing definition';end if;
 execute definition;

 original:=pg_get_functiondef('marriage.voice_allowed(uuid,uuid,uuid)'::regprocedure);
 definition:=replace(original,'select exists(select 1 from marriage.member_requests',
  'select marriage.agreement_allows_communication($1) and exists(select 1 from marriage.member_requests');
 if definition=original then raise exception 'Unexpected member voice definition';end if;
 execute definition;
end $$;
