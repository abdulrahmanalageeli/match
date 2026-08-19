alter table public.match_results
  alter column disagreement_style_score drop not null,
  alter column current_life_overlap_score drop not null,
  alter column similarity_preference_score drop not null,
  alter column attachment_pace_score drop not null;

notify pgrst, 'reload schema';
