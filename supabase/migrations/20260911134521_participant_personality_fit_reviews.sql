-- Persist admin-only human reviews of the transparent participant event-fit score.
create table if not exists public.participant_personality_fit_reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  participant_number integer not null,
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'approved', 'needs_review', 'not_suitable')),
  dimension_reviews jsonb not null default '{}'::jsonb
    check (jsonb_typeof(dimension_reviews) = 'object'),
  review_notes text,
  fit_model_version text not null,
  fit_score_snapshot smallint
    check (fit_score_snapshot is null or fit_score_snapshot between 0 and 100),
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_personality_fit_reviews_unique unique (match_id, participant_number),
  constraint participant_personality_fit_reviews_participant_fk
    foreign key (participant_number) references public.participants(assigned_number) on delete cascade
);

create index if not exists participant_personality_fit_reviews_status_idx
  on public.participant_personality_fit_reviews (match_id, review_status, updated_at desc);

create index if not exists participant_personality_fit_reviews_participant_idx
  on public.participant_personality_fit_reviews (participant_number);

alter table public.participant_personality_fit_reviews enable row level security;

revoke all on table public.participant_personality_fit_reviews from anon, authenticated;
grant all on table public.participant_personality_fit_reviews to service_role;

comment on table public.participant_personality_fit_reviews is
  'Admin-only manual decisions and dimension checks for the transparent personality event-fit assessment.';

comment on column public.participant_personality_fit_reviews.fit_score_snapshot is
  'Audit snapshot only. The current score is always recalculated from the participant survey.';
