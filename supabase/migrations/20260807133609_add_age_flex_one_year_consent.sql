alter table public.participants
  add column if not exists age_flex_one_year boolean;

comment on column public.participants.age_flex_one_year is
  'Participant consent to expand their preferred partner age range by one year when no suitable in-range match is available. NULL means unanswered or not applicable.';

-- Backfill only explicit answers. Legacy participants must remain NULL so the
-- matcher can preserve the previous behavior and request manual confirmation.
update public.participants
set age_flex_one_year = case lower(survey_data->'answers'->>'age_flex_one_year')
  when 'accept' then true
  when 'decline' then false
end
where age_flex_one_year is null
  and lower(survey_data->'answers'->>'age_flex_one_year') in ('accept', 'decline');
