-- Allow an explicit directory-only expansion. Legacy clients, weekly picks, and
-- Luna keep their eligibility gate. Private discovery boundaries always apply.
do $migration$
declare
  definition text := replace(pg_get_functiondef('marriage.browse(jsonb)'::regprocedure), chr(13), '');
  patch record;
begin
 for patch in select * from (values
  ($old$maximum integer; begin$old$, $new$maximum integer;
  include_ineligible boolean := coalesce(options->>'mode'='all' and options->'includeIneligible'='true'::jsonb
    and options->'eligibleOnly' is distinct from 'true'::jsonb and not (options ? 'luna'), false);
  begin$new$),
  ($old$select p.member_id,p.age, f.fit,$old$, $new$select p.member_id,p.age, f.fit, eligibility.can_request,$new$),
  ($old$where p.member_id<>me and (options->>'subjectId' is null or p.member_id=(options->>'subjectId')::uuid) and (not exists(select 1 from marriage.member_requests established where established.status='accepted' and least(established.requester_id,established.recipient_id)=least(me,p.member_id) and greatest(established.requester_id,established.recipient_id)=greatest(me,p.member_id)) or marriage.new_pair_requirements(me,p.member_id))$old$,
   $new$cross join lateral (select marriage.compatible(me,p.member_id)
     and (not exists(select 1 from marriage.member_requests established where established.status='accepted'
       and least(established.requester_id,established.recipient_id)=least(me,p.member_id)
       and greatest(established.requester_id,established.recipient_id)=greatest(me,p.member_id))
       or marriage.new_pair_requirements(me,p.member_id)) as can_request) eligibility
  where p.member_id<>me and (options->>'subjectId' is null or p.member_id=(options->>'subjectId')::uuid)$new$),
  ($old$and marriage.relationship_member_allowed(p.member_id) and marriage.compatible(me,p.member_id)$old$,
   $new$and marriage.relationship_member_allowed(p.member_id)
   and (eligibility.can_request or (include_ineligible
     and exists(select 1 from marriage.members directory_member where directory_member.id=p.member_id
       and directory_member.review_status='approved'
       and not (directory_member.paused or directory_member.suspended or directory_member.is_dummy))
     and p.gender<>(select own.gender from marriage.profiles own where own.member_id=me)
     and not marriage.permanent_boundary(me,p.member_id)))$new$),
  ($old$marriage.discovery_card(me,member_id,coalesce(options->>'mode','all')='recommended') order by$old$,
   $new$(case when can_request then marriage.discovery_card(me,member_id,coalesce(options->>'mode','all')='recommended')
      else marriage.discovery_card(me,member_id,false)-array['portrait','beenaStory'] end)
      ||jsonb_build_object('eligible',can_request) order by$new$)
 ) as changes(needle,replacement) loop
  if strpos(definition,patch.needle)=0 then raise exception 'Unexpected directory eligibility definition'; end if;
  definition:=replace(definition,patch.needle,patch.replacement);
 end loop;
 execute definition;
end $migration$;
