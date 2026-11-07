-- Use the existing private member/connected-peer invalidation channel. Broadcasts
-- contain no verification kind, decision, evidence identifiers, or document text.
create function marriage.manual_verification_notify() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.member_id is not null then perform marriage.portrait_notify(new.member_id);end if;
 return new;
end $$;
create trigger manual_verification_private_refresh after update of status,is_test on marriage.manual_verification_requests
 for each row when(old.status is distinct from new.status or old.is_test is distinct from new.is_test)
 execute function marriage.manual_verification_notify();

-- Export the member's full request history and consent timestamps, without
-- embedding documents or private Storage paths in the downloadable JSON.
alter function marriage.personal_data() rename to personal_data_before_manual_verification;
create function marriage.personal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();result jsonb;
begin
 result:=marriage.personal_data_before_manual_verification();
 return result||jsonb_build_object('manualVerification',jsonb_build_object(
  'requests',coalesce((select jsonb_agg(marriage.manual_verification_item(r.id)||jsonb_build_object('consentVersion',r.consent_version,'consentedAt',r.consented_at) order by r.created_at) from marriage.manual_verification_requests r where r.member_id=me),'[]'),
  'claims',marriage.manual_verification_claims(me::text),
  'events',coalesce((select jsonb_agg(jsonb_build_object('requestId',e.request_id,'action',e.action,'createdAt',e.created_at) order by e.id) from marriage.manual_verification_events e join marriage.manual_verification_requests r on r.id=e.request_id where r.member_id=me),'[]')));
end $$;
revoke all on function marriage.manual_verification_notify(),marriage.personal_data_before_manual_verification(),marriage.personal_data() from public,anon,authenticated,service_role;
grant execute on function marriage.personal_data() to authenticated;
