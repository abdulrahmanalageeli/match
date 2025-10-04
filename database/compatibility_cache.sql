create table public.compatibility_cache (
  id uuid not null default gen_random_uuid (),
  participant_a_number integer not null,
  participant_b_number integer not null,
  vibe_content_hash text not null,
  mbti_hash text not null,
  ai_vibe_score numeric(5, 2) not null,
  mbti_score numeric(5, 2) not null,
  attachment_score numeric(5, 2) not null,
  communication_score numeric(5, 2) not null,
  lifestyle_score numeric(5, 2) not null,
  core_values_score numeric(5, 2) not null,
  total_compatibility_score numeric(5, 2) not null,
  created_at timestamp with time zone null default now(),
  last_used timestamp with time zone null default now(),
  use_count integer null default 1,
  combined_content_hash text not null default ''::text,
  attachment_hash text not null default ''::text,
  communication_hash text not null default ''::text,
  lifestyle_hash text not null default ''::text,
  core_values_hash text not null default ''::text,
  constraint compatibility_cache_pkey primary key (id),
  constraint cache_unique unique (
    participant_a_number,
    participant_b_number,
    combined_content_hash
  ),
  constraint cache_ordered check ((participant_a_number < participant_b_number))
) TABLESPACE pg_default;

create index IF not exists idx_cache_participants on public.compatibility_cache using btree (participant_a_number, participant_b_number) TABLESPACE pg_default;

create index IF not exists idx_cache_hash on public.compatibility_cache using btree (vibe_content_hash, mbti_hash) TABLESPACE pg_default;

create index IF not exists idx_cache_usage on public.compatibility_cache using btree (last_used desc) TABLESPACE pg_default;

create index IF not exists idx_cache_combined_hash on public.compatibility_cache using btree (combined_content_hash) TABLESPACE pg_default;