alter table public.participants
  add column if not exists expression_language smallint,
  add column if not exists minimum_partner_religious_commitment smallint,
  add column if not exists social_relationship_style smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.participants'::regclass
      and conname = 'participants_expression_language_check'
  ) then
    alter table public.participants
      add constraint participants_expression_language_check
      check (expression_language is null or expression_language between 1 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.participants'::regclass
      and conname = 'participants_minimum_partner_religious_commitment_check'
  ) then
    alter table public.participants
      add constraint participants_minimum_partner_religious_commitment_check
      check (minimum_partner_religious_commitment is null or minimum_partner_religious_commitment between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.participants'::regclass
      and conname = 'participants_social_relationship_style_check'
  ) then
    alter table public.participants
      add constraint participants_social_relationship_style_check
      check (social_relationship_style is null or social_relationship_style between 1 and 4);
  end if;
end
$$;

update public.participants
set expression_language = (survey_data -> 'answers' ->> 'expression_language')::smallint
where expression_language is null
  and survey_data -> 'answers' ->> 'expression_language' in ('1', '2', '3', '4', '5');

update public.participants
set minimum_partner_religious_commitment = (survey_data -> 'answers' ->> 'minimum_partner_religious_commitment')::smallint
where minimum_partner_religious_commitment is null
  and survey_data -> 'answers' ->> 'minimum_partner_religious_commitment' in ('1', '2', '3', '4');

update public.participants
set social_relationship_style = (survey_data -> 'answers' ->> 'social_relationship_style')::smallint
where social_relationship_style is null
  and survey_data -> 'answers' ->> 'social_relationship_style' in ('1', '2', '3', '4');

comment on column public.participants.expression_language is
  'Unscored profile data: language in which the participant expresses themselves best (1-5).';
comment on column public.participants.minimum_partner_religious_commitment is
  'Unscored profile data: minimum desired religious commitment in a partner (1-4).';
comment on column public.participants.social_relationship_style is
  'Unscored profile data: participant social relationship orientation (1-4).';
