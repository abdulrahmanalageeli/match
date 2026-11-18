-- Preserve existing relationship decisions and give each pending invitation an identity.
alter table marriage.exclusive_consents add column proposal_id uuid not null default gen_random_uuid();
alter table marriage.stage_choices add column proposal_id uuid not null default gen_random_uuid();
update marriage.conversation_agreements set data=data||jsonb_build_object('familyProposalId',gen_random_uuid())
 where data->>'status'='family' or (data->'familyAgreed') @> '{"reham":true}' or (data->'familyAgreed') @> '{"abdulrahman":true}';

alter function marriage.agreement(uuid,text,jsonb) rename to agreement_before_revocation;
revoke all on function marriage.agreement_before_revocation(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function marriage.agreement(request_id uuid,action text default 'read',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb; mine text; other text; current_id text;
begin
 -- The existing reader authorizes the participant and locks the connection row until commit.
 if action in ('family','family_propose','family_accept','family_clear') then
  v:=marriage.agreement_before_revocation($1,'read','{}');
  mine:=v->>'actor'; other:=case mine when 'reham' then 'abdulrahman' else 'reham' end;
  current_id:=v->>'familyProposalId';
  if action='family' then raise exception 'حدّث التطبيق وراجع طلب التواصل العائلي.'; end if;
  if action='family_propose' and v->>'status'='accepted' and current_id is null and payload->'confirmed'='true'::jsonb then
   v:=v||jsonb_build_object('familyProposalId',gen_random_uuid(),'familyAgreed',jsonb_build_object(mine,true));
  elsif action='family_accept' and v->>'status'='accepted' and current_id is not null and payload->>'proposalId'=current_id and v#>>array['familyAgreed',other]='true' and payload->'confirmed'='true'::jsonb then
   v:=(v-'extension')||jsonb_build_object('familyAgreed',jsonb_build_object(mine,true,other,true),'status','family');
  elsif action='family_clear' and current_id is not null and payload->>'proposalId'=current_id then
   v:=(v-'familyProposalId'-'familyAgreed')||jsonb_build_object('status','accepted');
  else raise exception 'تغيّر طلب التواصل العائلي. راجع الحالة الحالية.'; end if;
  update marriage.conversation_agreements a set data=v-'actor'-'mineName'-'peerName' where a.request_id=$1;
 else
  v:=marriage.agreement_before_revocation($1,action,payload);
 end if;
 if v->>'status'='accepted' and (v->>'deadline')::timestamptz<=clock_timestamp() then v:=v||'{"status":"expired"}'; end if;
 return v;
end $$;
revoke all on function marriage.agreement(uuid,text,jsonb) from public,anon,service_role;
grant execute on function marriage.agreement(uuid,text,jsonb) to authenticated;

alter function marriage.progress_view(uuid) rename to progress_before_independent_steps;
revoke all on function marriage.progress_before_independent_steps(uuid) from public,anon,authenticated,service_role;
create function marriage.progress_view(request_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select p || marriage.progress_before_exclusivity($1) || jsonb_build_object(
  'exclusiveId',(select proposal_id from marriage.exclusive_consents where exclusive_consents.request_id=$1 order by agreed_at,member_id limit 1),
  'stepId',(select proposal_id from marriage.stage_choices where stage_choices.request_id=$1 and stage=least(2,(p->>'stage')::int+1) order by agreed_at,member_id limit 1))
 from marriage.progress_before_independent_steps($1) p
$$;
revoke all on function marriage.progress_view(uuid) from public,anon,service_role;
grant execute on function marriage.progress_view(uuid) to authenticated;

create function public.marriage_journey_choice(request_id uuid,topic text,action text,expected_id uuid default null,stage_number integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid:=marriage.progress_peer(me,$1); p jsonb; current_id uuid; current_stage int;
begin
 perform marriage.lock_member_pair(me,peer);
 perform marriage.progress_peer(me,$1);
 p:=marriage.progress_view($1); current_stage:=(p->>'stage')::int;
 if topic='exclusive' then
  current_id:=(p->>'exclusiveId')::uuid;
  if action='propose' and current_id is null and expected_id is null then
   insert into marriage.exclusive_consents(request_id,member_id) values($1,me);
  elsif action='accept' and current_id=expected_id and p->>'consentPeer'='true' and p->>'consentMine'='false' then
   insert into marriage.exclusive_consents(request_id,member_id,proposal_id) values($1,me,current_id);
   insert into marriage.exclusive_members(member_id,request_id) values(me,$1),(peer,$1);
   update marriage.member_requests r set status='closed',updated_at=now() where r.id<>$1 and r.status in('accepted','pending') and (r.requester_id in(me,peer) or r.recipient_id in(me,peer));
   update marriage.introductions i set closed_at=now() where i.closed_at is null and (i.member_a in(me,peer) or i.member_b in(me,peer));
   insert into marriage.activity_notifications(recipient_id,actor_id,kind,request_id,event_key) values
    (me,peer,'exclusive',$1,'exclusive:'||expected_id),(peer,me,'exclusive',$1,'exclusive:'||expected_id) on conflict do nothing;
  elsif action='clear' and current_id=expected_id then
   delete from marriage.exclusive_members e where e.request_id=$1;
   delete from marriage.exclusive_consents c where c.request_id=$1;
  else raise exception 'تغيّر طلب الحصرية. راجع الحالة الحالية.'; end if;
 elsif topic='step' and stage_number in(1,2) then
  current_id:=(p->>'stepId')::uuid;
  if action='clear' and current_id=expected_id and (stage_number=current_stage+1 or stage_number=2 and current_stage=2) then
   delete from marriage.stage_choices c where c.request_id=$1 and c.stage=stage_number;
  elsif stage_number=current_stage+1 and ((action='propose' and current_id is null and expected_id is null) or
   (action='accept' and current_id=expected_id and p->>'peer'='true' and p->>'mine'='false')) then
   insert into marriage.stage_choices(request_id,stage,member_id,proposal_id) values($1,stage_number,me,coalesce(current_id,gen_random_uuid()));
  else raise exception 'تغيّرت الخطوة. راجع الحالة الحالية.'; end if;
  delete from marriage.journey_rewinds r where r.request_id=$1;
 else raise exception 'خيار غير متاح.'; end if;
 perform realtime.send('{}','changed','marriage:member:'||me::text,true);
 perform realtime.send('{}','changed','marriage:member:'||peer::text,true);
 return marriage.progress_view($1);
end $$;
revoke all on function public.marriage_journey_choice(uuid,text,text,uuid,integer) from public,anon,service_role;
grant execute on function public.marriage_journey_choice(uuid,text,text,uuid,integer) to authenticated;

-- Older clients must reload before making decisions that now require a proposal ID.
create or replace function marriage.set_next_step(request_id uuid,stage_number integer,agree boolean,exclusive_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$ begin raise exception 'حدّث التطبيق لمراجعة المسار والموافقة على الطلب الحالي.'; end $$;

-- Rewinding a milestone no longer changes either member's exclusivity decision.
do $$ declare def text; updated text; begin
 def:=pg_get_functiondef('marriage.rewind_step(uuid,integer,boolean)'::regprocedure);
 updated:=regexp_replace(def,'if expected_stage=1 then delete from marriage.exclusive_members[^\n]*?end if;', '');
 if updated=def then raise exception 'Unexpected rewind function';end if;
 execute updated;
end $$;

-- The private two-account testing room uses the same versioned decisions through its existing gateway.
update nisfayn_test.room set data=data
 ||case when data->>'exclusive'='true' or data->'exclusiveConsent' @> '{"reham":true}' or data->'exclusiveConsent' @> '{"abdulrahman":true}' then jsonb_build_object('exclusiveId',gen_random_uuid()) else '{}'::jsonb end
 ||case when data->>'stage'='2' or data->'agree' @> '{"reham":true}' or data->'agree' @> '{"abdulrahman":true}' then jsonb_build_object('stepId',gen_random_uuid()) else '{}'::jsonb end
 where id;
update nisfayn_test.room set data=jsonb_set(data,'{seriousness,familyProposalId}',to_jsonb(gen_random_uuid()))
 where id and (data#>>'{seriousness,status}'='family' or data#>'{seriousness,familyAgreed}' @> '{"reham":true}' or data#>'{seriousness,familyAgreed}' @> '{"abdulrahman":true}');

alter function public.nisfayn_test_rpc(text,text,jsonb) rename to nisfayn_test_before_journey_choices;
revoke all on function public.nisfayn_test_before_journey_choices(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; s jsonb; a jsonb; who text; peer text; topic text:=payload->>'topic'; choice text:=payload->>'decision';
 id_key text; votes_key text; token text; current_stage int; target int;
begin
 if action not in('step','rewind','agreement_family','reset','close') then return public.nisfayn_test_before_journey_choices(action,session_token,payload); end if;
 if action in('reset','close') then
  s:=public.nisfayn_test_before_journey_choices(action,session_token,payload);
  update nisfayn_test.room set data=data-'exclusiveId'-'stepId' where id;
  return s-'exclusiveId'-'stepId';
 end if;
 select data into d from nisfayn_test.room where id for update;
 s:=public.nisfayn_test_before_journey_choices('state',session_token,'{}');
 if s->>'matched' is distinct from 'true' then raise exception 'التعارف غير متاح.';end if;
 select data into d from nisfayn_test.room where id;
 who:=s->>'actor';peer:=case who when 'reham' then 'abdulrahman' else 'reham' end;
 current_stage:=coalesce((d->>'stage')::int,0);
 if action='agreement_family' then
  a:=d->'seriousness';token:=a->>'familyProposalId';
  if choice='family_propose' and token is null and a->>'status' in('accepted','expired') and payload->'confirmed'='true'::jsonb then
   a:=a||jsonb_build_object('familyProposalId',gen_random_uuid(),'familyAgreed',jsonb_build_object(who,true));
  elsif choice='family_accept' and token=payload->>'proposalId' and a#>>array['familyAgreed',peer]='true' and payload->'confirmed'='true'::jsonb then
   a:=(a-'extension')||jsonb_build_object('status','family','familyAgreed',jsonb_build_object(who,true,peer,true));
  elsif choice='family_clear' and token=payload->>'proposalId' then
   a:=(a-'familyProposalId'-'familyAgreed'-'familyConfirmedAt')||jsonb_build_object('status','accepted');
  else raise exception 'تغيّر طلب التواصل العائلي.';end if;
  d:=jsonb_set(d,'{seriousness}',a);
 elsif action='rewind' then
  if current_stage not in(1,2) or (payload->>'stage')::int is distinct from current_stage then raise exception 'تغيّرت المرحلة.';end if;
  if payload->'agree'='false'::jsonb then d:=d-'rewind';
  elsif payload->'agree'='true'::jsonb and d#>>'{rewind,actor}'=peer then
   d:=(d-'stepId'-'rewind')||jsonb_build_object('stage',current_stage-1,'agree','{}'::jsonb);
  elsif payload->'agree'='true'::jsonb then d:=d||jsonb_build_object('rewind',jsonb_build_object('actor',who,'stage',current_stage));
  else raise exception 'خيار غير متاح.';end if;
 else
  if topic is null or topic not in('exclusive','step') then raise exception 'حدّث التطبيق لمراجعة المسار.';end if;
  id_key:=case topic when 'exclusive' then 'exclusiveId' else 'stepId' end;
  votes_key:=case topic when 'exclusive' then 'exclusiveConsent' else 'agree' end;
  target:=(payload->>'stage')::int;
  if topic='step' and (target is null or target not in(1,2) or (target<>current_stage+1 and not(choice='clear' and target=2 and current_stage=2))) then raise exception 'تغيّرت المرحلة.';end if;
  token:=d->>id_key;
  if choice='propose' and token is null and payload->>'expectedId' is null then
   d:=d||jsonb_build_object(id_key,gen_random_uuid(),votes_key,jsonb_build_object(who,true));
  elsif choice='accept' and token=payload->>'expectedId' and d#>>array[votes_key,peer]='true' and coalesce(d#>>array[votes_key,who],'false')<>'true' then
   if topic='exclusive' then d:=d||jsonb_build_object('exclusive',true,'retiredFictional',true,votes_key,jsonb_build_object(who,true,peer,true));
   else d:=d||jsonb_build_object('stage',target,votes_key,'{}'::jsonb);if target=1 then d:=d-id_key; end if;end if;
  elsif choice='clear' and token=payload->>'expectedId' then
   d:=(d-id_key)||jsonb_build_object(votes_key,'{}'::jsonb);
   if topic='exclusive' then d:=d||'{"exclusive":false}';elsif current_stage=2 then d:=d||'{"stage":1}';end if;
  else raise exception 'تغيّر الطلب. راجع الحالة الحالية.';end if;
  if topic='step' then d:=d-'rewind';end if;
 end if;
 update nisfayn_test.room set data=d||jsonb_build_object('journeyUpdatedAt',clock_timestamp()) where id;
 return public.nisfayn_test_before_journey_choices('state',session_token,'{}');
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
