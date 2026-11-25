-- Place the analysis notice in the chat at the moment its current state began,
-- instead of rendering it as a permanent footer below every later message.
alter table marriage.deep_analyses
 add column status_at timestamptz;

update marriage.deep_analyses
set status_at=created_at
where status_at is null;

alter table marriage.deep_analyses
 alter column status_at set default clock_timestamp(),
 alter column status_at set not null;

create function marriage.mark_deep_analysis_status_at() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.status is distinct from old.status then
  new.status_at:=clock_timestamp();
 end if;
 return new;
end $$;

create trigger mark_deep_analysis_status_at
before update of status on marriage.deep_analyses
for each row execute function marriage.mark_deep_analysis_status_at();

create or replace function marriage.deep_view(item marriage.deep_analyses,viewer uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare own_side text:=case when viewer=item.requester_id then 'a' else 'b' end;
 view_status text:=coalesce(item.status,'none'); reviews jsonb:='[]'; findings jsonb:='[]'; can_request boolean;
begin
 if item.id is not null and (item.expires_at<=now() or (item.snapshot is not null and item.fingerprint is distinct from md5(jsonb_build_object('a',marriage.deep_evidence(item.requester_id),'b',marriage.deep_evidence(item.recipient_id))::text))) then view_status:='stale';end if;
 can_request:=marriage.is_serious(viewer) and view_status in('none','declined','cancelled','stale')
  and (select count(*) from marriage.deep_analyses where requester_id=viewer and created_at>now()-interval '1 day')<3;
 if view_status='review' then
  select coalesce(jsonb_agg(jsonb_build_object('id',f->>'id','section',f->>'section','ownInterpretation',f->'reviewText'->>own_side,'ownEvidence',(
   select coalesce(jsonb_agg(jsonb_build_object('key',e->>'key','label',(e->>'question')||case e->>'provenance'
    when 'inferred' then ' (تفضيل مقترح من إجابتك عن نفسك)'
    when 'unverified' then ' (تفضيل محفوظ، مصدره غير مؤكد)' else '' end,'value',e->>'answer')),'[]')
   from jsonb_array_elements(item.snapshot->own_side->'entries') e where exists(select 1 from jsonb_array_elements(f->'evidence') ref where ref->>'side'=own_side and ref->>'key'=e->>'key')
  ))),'[]') into reviews from jsonb_array_elements(item.report->'findings') f;
 elsif view_status='shared' then
  select coalesce(jsonb_agg(f-'evidence'-'reviewText'),'[]') into findings from jsonb_array_elements(item.report->'findings') f
   where item.a_decisions->>(f->>'id')='true' and item.b_decisions->>(f->>'id')='true';
 end if;
 return jsonb_build_object('id',item.id,'status',view_status,'createdAt',item.created_at,'eventAt',item.status_at,'canRequest',can_request,
 'requestedByMe',coalesce(viewer=item.requester_id,false),'myReviewed',case own_side when 'a' then item.a_decisions is not null else item.b_decisions is not null end,
 'peerReviewed',case own_side when 'a' then item.b_decisions is not null else item.a_decisions is not null end,
 'canGenerate',view_status in('ready','failed') and item.attempts<3 or (view_status='generating' and item.leased_until<now() and item.attempts<3),
 'review',reviews,'findings',findings);
end $$;

revoke all on function marriage.mark_deep_analysis_status_at() from public,anon,authenticated,service_role;
revoke all on function marriage.deep_view(marriage.deep_analyses,uuid) from public,anon,authenticated,service_role;
