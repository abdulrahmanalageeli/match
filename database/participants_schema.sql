create table public.participants (
  id uuid not null default gen_random_uuid (),
  assigned_number integer not null,
  match_id uuid null,
  is_host boolean null default false,
  summary text null,
  created_at timestamp with time zone null default now(),
  table_number integer null,
  secure_token text null default encode(extensions.gen_random_bytes (6), 'hex'::text),
  group_number integer null,
  survey_data jsonb null,
  mbti_personality_type character varying(4) null,
  attachment_style character varying(50) null,
  communication_style character varying(50) null,
  name text null,
  gender text null,
  phone_number text null,
  age integer null,
  same_gender_preference boolean null default false,
  "PAID" boolean null default false,
  "PAID_DONE" boolean null default false,
  signup_for_next_event boolean null default false,
  next_event_signup_timestamp timestamp with time zone null,
  event_id integer not null default 1,
  ai_personality_analysis text null,
  constraint participants_pkey primary key (id),
  constraint unique_participant_number_per_match unique (assigned_number, match_id),
  constraint unique_secure_token unique (secure_token),
  constraint participants_assigned_number_key unique (assigned_number),
  constraint check_event_id_positive check ((event_id > 0)),
  constraint check_mbti_type_valid check (
    (
      (mbti_personality_type is null)
      or (
        (length((mbti_personality_type)::text) = 4)
        and (
          "substring" ((mbti_personality_type)::text, 1, 1) = any (array['E'::text, 'I'::text])
        )
        and (
          "substring" ((mbti_personality_type)::text, 2, 1) = any (array['S'::text, 'N'::text])
        )
        and (
          "substring" ((mbti_personality_type)::text, 3, 1) = any (array['T'::text, 'F'::text])
        )
        and (
          "substring" ((mbti_personality_type)::text, 4, 1) = any (array['J'::text, 'P'::text])
        )
      )
    )
  ),
  constraint check_same_gender_preference_valid check ((same_gender_preference is not null)),
  constraint check_survey_data_valid check (
    (
      (survey_data is null)
      or (jsonb_typeof(survey_data) = 'object'::text)
    )
  ),
  constraint participants_gender_check check (
    (
      (
        gender = any (array['male'::text, 'female'::text])
      )
      or (gender is null)
    )
  ),
  constraint check_age_valid check (
    (
      (age is null)
      or (
        (age >= 18)
        and (age <= 65)
      )
    )
  ),
  constraint valid_communication_style check (
    (
      (communication_style is null)
      or (
        (communication_style)::text = any (
          (
            array[
              'Assertive'::character varying,
              'Passive'::character varying,
              'Aggressive'::character varying,
              'Passive-Aggressive'::character varying
            ]
          )::text[]
        )
      )
    )
  ),
  constraint check_ai_analysis_not_empty check (
    (
      (ai_personality_analysis is null)
      or (
        length(
          TRIM(
            both
            from
              ai_personality_analysis
          )
        ) > 0
      )
    )
  ),
  constraint check_attachment_style_valid check (
    (
      (attachment_style is null)
      or (
        (attachment_style)::text = any (
          (
            array[
              'Secure'::character varying,
              'Anxious'::character varying,
              'Avoidant'::character varying,
              'Fearful'::character varying
            ]
          )::text[]
        )
      )
      or ((attachment_style)::text ~~ 'Mixed (%'::text)
    )
  ),
  constraint check_core_values_format check (
    (
      ((survey_data -> 'coreValues'::text) is null)
      or (
        ((survey_data -> 'coreValues'::text))::text ~ '^"[أبج],[أبج],[أبج],[أبج],[أبج]"$'::text
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_participants_survey_data on public.participants using gin (survey_data) TABLESPACE pg_default;

create index IF not exists idx_participants_mbti_type on public.participants using btree (mbti_personality_type) TABLESPACE pg_default;

create index IF not exists idx_participants_mbti_type_not_null on public.participants using btree (mbti_personality_type) TABLESPACE pg_default
where
  (mbti_personality_type is not null);

create index IF not exists idx_participants_mbti_ei on public.participants using btree ("substring" ((mbti_personality_type)::text, 1, 1)) TABLESPACE pg_default
where
  (mbti_personality_type is not null);

create index IF not exists idx_participants_mbti_sn on public.participants using btree ("substring" ((mbti_personality_type)::text, 2, 1)) TABLESPACE pg_default
where
  (mbti_personality_type is not null);

create index IF not exists idx_participants_mbti_tf on public.participants using btree ("substring" ((mbti_personality_type)::text, 3, 1)) TABLESPACE pg_default
where
  (mbti_personality_type is not null);

create index IF not exists idx_participants_mbti_jp on public.participants using btree ("substring" ((mbti_personality_type)::text, 4, 1)) TABLESPACE pg_default
where
  (mbti_personality_type is not null);

create index IF not exists idx_participants_attachment_style on public.participants using btree (attachment_style) TABLESPACE pg_default;

create index IF not exists idx_participants_attachment_style_not_null on public.participants using btree (attachment_style) TABLESPACE pg_default
where
  (attachment_style is not null);

create index IF not exists idx_participants_communication_style on public.participants using btree (communication_style) TABLESPACE pg_default;

create index IF not exists idx_participants_lifestyle on public.participants using gin (((survey_data -> 'lifestylePreferences'::text))) TABLESPACE pg_default;

create index IF not exists idx_participants_personality_types on public.participants using gin (
  ((survey_data -> 'mbtiType'::text)),
  ((survey_data -> 'attachmentStyle'::text)),
  ((survey_data -> 'communicationStyle'::text)),
  ((survey_data -> 'lifestylePreferences'::text))
) TABLESPACE pg_default;

create index IF not exists idx_participants_core_values on public.participants using gin (((survey_data -> 'coreValues'::text))) TABLESPACE pg_default;

create index IF not exists idx_participants_name on public.participants using btree (name) TABLESPACE pg_default;

create index IF not exists idx_participants_gender on public.participants using btree (gender) TABLESPACE pg_default;

create index IF not exists idx_participants_phone on public.participants using btree (phone_number) TABLESPACE pg_default;

create index IF not exists idx_participants_age on public.participants using btree (age) TABLESPACE pg_default;

create index IF not exists idx_participants_age_not_null on public.participants using btree (age) TABLESPACE pg_default
where
  (age is not null);

create index IF not exists idx_participants_same_gender_preference on public.participants using btree (same_gender_preference) TABLESPACE pg_default;

create index IF not exists idx_participants_gender_same_preference on public.participants using btree (gender, same_gender_preference) TABLESPACE pg_default
where
  (gender is not null);

create index IF not exists idx_participants_next_event_signup on public.participants using btree (signup_for_next_event) TABLESPACE pg_default
where
  (signup_for_next_event = true);

create index IF not exists idx_participants_event_id on public.participants using btree (event_id) TABLESPACE pg_default;

create index IF not exists idx_participants_event_match on public.participants using btree (event_id, match_id) TABLESPACE pg_default;

create index IF not exists idx_participants_event_number on public.participants using btree (event_id, assigned_number) TABLESPACE pg_default;

create index IF not exists idx_participants_ai_analysis on public.participants using btree (ai_personality_analysis) TABLESPACE pg_default
where
  (ai_personality_analysis is not null);

create index IF not exists idx_participants_analysis_ready on public.participants using btree (event_id, ai_personality_analysis) TABLESPACE pg_default
where
  (
    (ai_personality_analysis is not null)
    and (survey_data is not null)
  );

create trigger trigger_sync_communication_style BEFORE INSERT
or
update on participants for EACH row
execute FUNCTION sync_communication_style_from_json ();

create trigger trigger_update_personality_types BEFORE INSERT
or
update on participants for EACH row
execute FUNCTION update_personality_types_from_survey_data ();