-- Cover participant deletion checks on the review foreign key.
create index if not exists participant_personality_fit_reviews_participant_idx
  on public.participant_personality_fit_reviews (participant_number);
