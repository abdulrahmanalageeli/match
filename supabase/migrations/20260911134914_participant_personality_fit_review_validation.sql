-- Keep direct database writes within the same audit limits enforced by the admin API.
alter table public.participant_personality_fit_reviews
  add constraint participant_personality_fit_reviews_notes_length
    check (review_notes is null or char_length(review_notes) <= 2000),
  add constraint participant_personality_fit_reviews_not_suitable_reason
    check (
      review_status <> 'not_suitable'
      or char_length(btrim(coalesce(review_notes, ''))) >= 10
    ),
  add constraint participant_personality_fit_reviews_model_version_length
    check (char_length(fit_model_version) between 1 and 80);
