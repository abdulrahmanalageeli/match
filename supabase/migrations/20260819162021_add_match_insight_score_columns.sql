alter table public.match_results
  add column if not exists disagreement_style_score numeric not null default 0,
  add column if not exists current_life_overlap_score numeric not null default 0,
  add column if not exists similarity_preference_score numeric not null default 0,
  add column if not exists attachment_pace_score numeric not null default 0;

notify pgrst, 'reload schema';
