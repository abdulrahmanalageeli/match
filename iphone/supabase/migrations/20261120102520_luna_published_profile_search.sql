-- Keep the existing comparisons for legacy directory choices. Every new
-- comparison reads the projection already authorized for this viewer.
alter function marriage.luna_score(jsonb,jsonb) rename to luna_score_legacy;

create function marriage.luna_score(card jsonb, plan jsonb) returns integer
language plpgsql stable set search_path='' as $$
declare
  criterion jsonb;
  field text;
  kind text;
  terms jsonb;
  published_value text;
  hit boolean;
  score integer := 0;
  prose text[];
begin
  if plan is null then return 0; end if;
  if jsonb_typeof(plan) <> 'array' or jsonb_array_length(plan) > 10 or length(plan::text) > 14000 then
    raise exception 'Invalid search plan' using errcode='22023';
  end if;
  for criterion in select jsonb_array_elements(plan) loop
    field := criterion->>'field';
    kind := criterion->>'kind';
    terms := criterion->'terms';
    if kind is null or kind not in ('must','exclude','prefer') or jsonb_typeof(terms) is distinct from 'array'
      or jsonb_array_length(terms) not between 1 and 8 or exists (
        select 1 from jsonb_array_elements(terms) t where jsonb_typeof(t)<>'string'
          or length(trim(t#>>'{}')) not between 1 and 80
      ) then raise exception 'Invalid search criterion' using errcode='22023'; end if;

    if field='unsupported' then return -1; end if;
    if field='profileText' or (field is null and kind='prefer') then
      if prose is null then
        prose := array[card->>'alias',card->>'bio',card->>'occupation',card->>'education',card->>'city',
          card->>'lookingFor',card->>'valuesStatement',card->>'lifeTogether',card->>'marriageIntent',
          card->>'familyPreference',card#>>'{beenaStory,text}'] ||
          array(select jsonb_array_elements_text(coalesce(nullif(card->'interests','null'),'[]')));
      end if;
      -- Absence in prose cannot prove a negative. The planner can look for
      -- an explicitly negative phrase using a positive mention condition.
      if kind='exclude' then return -1; end if;
      select exists(select 1 from unnest(prose) p cross join jsonb_array_elements_text(terms) t
        where length(marriage.luna_normalize(trim(t)))>=2 and strpos(marriage.luna_normalize(p),marriage.luna_normalize(trim(t)))>0) into hit;
    elsif field='verificationBadge' then
      if jsonb_typeof(card->'manualVerifications') is distinct from 'array' then
        if kind='prefer' then continue; end if;
        return -1;
      end if;
      select exists(select 1 from jsonb_array_elements(card->'manualVerifications') badge
        where terms ? (badge->>'kind')) into hit;
    elsif field in ('interest','language','education','profession','city','smoking','maritalStatus','spokenLanguages') then
      if field='spokenLanguages' then criterion := criterion || '{"field":"language"}'; end if;
      if kind='prefer' then criterion := criterion || '{"kind":"must"}'; end if;
      hit := marriage.luna_score_legacy(card,jsonb_build_array(criterion)) >= 0;
      if kind='exclude' then
        if not hit then return -1; end if;
        continue;
      end if;
    else
      published_value := case
        when field='compatibility' then card#>>'{fit,percentage}'
        when field='available' and jsonb_typeof(card->'atCapacity')='boolean' then (not (card->>'atCapacity')::boolean)::text
        when field in ('alias','familyPreference','age','online','membershipTier') then card->>field
        when field in ('nationality','originCity','preferredLanguage','languageOpenness','tribalBackground',
          'tribeName','religiousAffiliation','prayerPractice','polygynyPreference','marriageTimeline',
          'meetingPreference','dressStyle','dressFlexibility','skinTone','heightCm','weightKg','childrenCount',
          'currentWives','weddingStyle','childrenTiming','housingPlan','expenseSharing') then card#>>array['marriageBasics',field]
        end;
      if nullif(trim(published_value),'') is null or published_value in ('private','prefer_not_to_say') then
        if kind='prefer' then continue; end if;
        return -1;
      end if;
      if field in ('compatibility','age','heightCm','weightKg','childrenCount','currentWives') then
        if published_value !~ '^[0-9]{1,4}$' or exists(select 1 from jsonb_array_elements_text(terms) t
          where t !~ '^[0-9]{1,4}([.][.][0-9]{1,4})?$') then return -1; end if;
        select exists(select 1 from jsonb_array_elements_text(terms) t where published_value::int between
          split_part(t,'..',1)::int and coalesce(nullif(split_part(t,'..',2),''),t)::int) into hit;
      else
        select exists(select 1 from jsonb_array_elements_text(terms) t where
          case when field='nationality' then marriage.normalize_nationality(published_value)=marriage.normalize_nationality(t)
               else marriage.luna_normalize(published_value)=marriage.luna_normalize(trim(t)) end) into hit;
      end if;
    end if;
    if (kind='must' and not hit) or (kind='exclude' and hit) then return -1; end if;
    if kind='prefer' and hit then score:=score+1; end if;
  end loop;
  return score;
end $$;
revoke all on function marriage.luna_score(jsonb,jsonb) from public,anon,authenticated,service_role;
