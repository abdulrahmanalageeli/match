-- Remember which optional filters came from a member-confirmed interview
-- selection so resuming a registration can distinguish a default from an edit.
do $migration$
declare definition text := pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
        anchor text := 'insert into marriage.onboarding_drafts';
begin
 if strpos(definition,anchor)=0 then raise exception 'Unexpected draft save definition'; end if;
 definition := replace(definition,anchor,$fields$
 if permissions->'assessment'='true'::jsonb then
   -- Old clients omit this private bookkeeping. Preserve prior markers only
   -- for the same draft; the reader compares against the actual current value.
   declare marks jsonb := payload->'lunaFields';
   begin
     if marks is null then
       select d.document->'lunaFields' into marks from marriage.onboarding_drafts d
        where d.member_id=me and d.expires_at>now() and d.document->>'baseline'=baseline;
     end if;
     if marks is not null then
       if jsonb_typeof(marks) is distinct from 'object' then raise exception 'Invalid draft field markers' using errcode='22023'; end if;
       if exists (select 1 from jsonb_each(marks) e where
         e.key not in ('preferredMinAge','preferredMaxAge','partnerCriteria.height','marriageBasics.marriageTimeline')
         or jsonb_typeof(e.value) <> 'string' or
         (e.value#>>'{}') !~ ('^(manual|[a-f0-9-]{36}[|]' || case
           when e.key in ('preferredMinAge','preferredMaxAge') then 'value:[0-9]{2,3}'
           when e.key='partnerCriteria.height' then '(any|(prefer|require):[0-9]{0,3}:[0-9]{0,3})'
           else 'value:(within_3_months|three_to_six_months|six_to_twelve_months|over_a_year|when_ready)' end || ')$')
       ) then raise exception 'Invalid draft field markers' using errcode='22023'; end if;
       doc := doc||jsonb_build_object('lunaFields',marks);
     end if;
   end;
 end if;
 $fields$||anchor);
 execute definition;
end $migration$;
