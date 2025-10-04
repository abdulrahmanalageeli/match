create table public.match_results (
  id uuid not null default gen_random_uuid (),
  participant_a_id uuid null,
  participant_b_id uuid null,
  match_type text null,
  reason text null,
  match_id uuid null,
  created_at timestamp with time zone null default now(),
  compatibility_score integer null,
  participant_a_number integer null,
  participant_b_number integer null,
  round smallint null,
  table_number smallint null,
  participant_c_number integer null,
  participant_d_number integer null,
  group_number integer null,
  conversation_start_time timestamp with time zone null,
  conversation_duration integer null default 1800,
  conversation_status text null default 'pending'::text,
  participant_a_mbti_type character varying(4) null,
  participant_b_mbti_type character varying(4) null,
  participant_a_attachment_style character varying(50) null,
  participant_b_attachment_style character varying(50) null,
  participant_a_communication_style character varying(50) null,
  participant_b_communication_style character varying(50) null,
  participant_a_lifestyle_preferences text null,
  participant_b_lifestyle_preferences text null,
  participant_a_core_values text null,
  participant_b_core_values text null,
  participant_a_vibe_description text null,
  participant_b_vibe_description text null,
  participant_a_ideal_person_description text null,
  participant_b_ideal_person_description text null,
  mbti_compatibility_score numeric(5, 2) null default 0,
  attachment_compatibility_score numeric(5, 2) null default 0,
  communication_compatibility_score numeric(5, 2) null default 0,
  lifestyle_compatibility_score numeric(5, 2) null default 0,
  core_values_compatibility_score numeric(5, 2) null default 0,
  vibe_compatibility_score numeric(5, 2) null default 0,
  is_repeat_match boolean null default false,
  participant_e_number integer null,
  participant_f_number integer null,
  mutual_match boolean null default false,
  participant_a_wants_match boolean null,
  participant_b_wants_match boolean null,
  event_id integer not null default 1,
  event_finished boolean not null default false,
  ai_personality_analysis text null,
  constraint match_results_pkey primary key (id),
  constraint fk_match_results_participant_a foreign KEY (participant_a_number, match_id) references participants (assigned_number, match_id) on update CASCADE on delete CASCADE,
  constraint fk_match_results_participant_b foreign KEY (participant_b_number, match_id) references participants (assigned_number, match_id) on update CASCADE on delete CASCADE,
  constraint fk_match_results_participant_e foreign KEY (participant_e_number) references participants (assigned_number) deferrable initially DEFERRED,
  constraint fk_match_results_participant_f foreign KEY (participant_f_number) references participants (assigned_number) deferrable initially DEFERRED,
  constraint match_results_participant_a_id_fkey foreign KEY (participant_a_id) references participants (id) on delete CASCADE,
  constraint match_results_participant_b_id_fkey foreign KEY (participant_b_id) references participants (id) on delete CASCADE,
  constraint check_participant_f_positive check (
    (
      (participant_f_number is null)
      or (participant_f_number > 0)
    )
  ),
  constraint check_event_finished_boolean check (
    (
      (event_finished is null)
      or (event_finished = true)
      or (event_finished = false)
    )
  ),
  constraint match_results_conversation_status_check check (
    (
      conversation_status = any (
        array['pending'::text, 'active'::text, 'finished'::text]
      )
    )
  ),
  constraint match_results_match_type_check check (
    (
      match_type = any (
        array['توأم روح'::text, 'محايد'::text, 'عدو لدود'::text]
      )
    )
  ),
  constraint check_event_id_positive check ((event_id > 0)),
  constraint check_group_participant_order check (
    (
      (
        (participant_e_number is null)
        or (
          (participant_a_number is not null)
          and (participant_b_number is not null)
          and (participant_c_number is not null)
          and (participant_d_number is not null)
        )
      )
      and (
        (participant_f_number is null)
        or (
          (participant_a_number is not null)
          and (participant_b_number is not null)
          and (participant_c_number is not null)
          and (participant_d_number is not null)
          and (participant_e_number is not null)
        )
      )
    )
  ),
  constraint check_mutual_match_boolean check (
    (
      (mutual_match is null)
      or (mutual_match = true)
      or (mutual_match = false)
    )
  ),
  constraint check_participant_a_wants_match_boolean check (
    (
      (participant_a_wants_match is null)
      or (participant_a_wants_match = true)
      or (participant_a_wants_match = false)
    )
  ),
  constraint check_participant_b_wants_match_boolean check (
    (
      (participant_b_wants_match is null)
      or (participant_b_wants_match = true)
      or (participant_b_wants_match = false)
    )
  ),
  constraint check_participant_e_positive check (
    (
      (participant_e_number is null)
      or (participant_e_number > 0)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_match_results_conversation_status on public.match_results using btree (conversation_status) TABLESPACE pg_default;

create index IF not exists idx_match_results_conversation_start_time on public.match_results using btree (conversation_start_time) TABLESPACE pg_default;

create index IF not exists idx_match_results_participant_a_mbti on public.match_results using btree (participant_a_mbti_type) TABLESPACE pg_default;

create index IF not exists idx_match_results_participant_b_mbti on public.match_results using btree (participant_b_mbti_type) TABLESPACE pg_default;

create index IF not exists idx_match_results_participant_a_attachment on public.match_results using btree (participant_a_attachment_style) TABLESPACE pg_default;

create index IF not exists idx_match_results_participant_b_attachment on public.match_results using btree (participant_b_attachment_style) TABLESPACE pg_default;

create index IF not exists idx_match_results_participant_a_communication on public.match_results using btree (participant_a_communication_style) TABLESPACE pg_default;

create index IF not exists idx_match_results_participant_b_communication on public.match_results using btree (participant_b_communication_style) TABLESPACE pg_default;

create index IF not exists idx_match_results_mbti_score on public.match_results using btree (mbti_compatibility_score) TABLESPACE pg_default;

create index IF not exists idx_match_results_attachment_score on public.match_results using btree (attachment_compatibility_score) TABLESPACE pg_default;

create index IF not exists idx_match_results_communication_score on public.match_results using btree (communication_compatibility_score) TABLESPACE pg_default;

create index IF not exists idx_match_results_lifestyle_score on public.match_results using btree (lifestyle_compatibility_score) TABLESPACE pg_default;

create index IF not exists idx_match_results_core_values_score on public.match_results using btree (core_values_compatibility_score) TABLESPACE pg_default;

create index IF not exists idx_match_results_vibe_score on public.match_results using btree (vibe_compatibility_score) TABLESPACE pg_default;

create index IF not exists idx_match_results_participant_e_number on public.match_results using btree (participant_e_number) TABLESPACE pg_default
where
  (participant_e_number is not null);

create index IF not exists idx_match_results_participant_f_number on public.match_results using btree (participant_f_number) TABLESPACE pg_default
where
  (participant_f_number is not null);

create index IF not exists idx_match_results_all_participants on public.match_results using btree (
  participant_a_number,
  participant_b_number,
  participant_c_number,
  participant_d_number,
  participant_e_number,
  participant_f_number,
  round,
  match_id
) TABLESPACE pg_default
where
  (round = 0);

create index IF not exists idx_match_results_mutual_match on public.match_results using btree (mutual_match) TABLESPACE pg_default;

create index IF not exists idx_match_results_mutual_match_true on public.match_results using btree (mutual_match) TABLESPACE pg_default
where
  (mutual_match = true);

create index IF not exists idx_match_results_participant_a_wants_match on public.match_results using btree (participant_a_wants_match) TABLESPACE pg_default;

create index IF not exists idx_match_results_participant_b_wants_match on public.match_results using btree (participant_b_wants_match) TABLESPACE pg_default;

create index IF not exists idx_match_results_participants_and_match on public.match_results using btree (
  match_id,
  participant_a_number,
  participant_b_number
) TABLESPACE pg_default;

create index IF not exists idx_match_results_event_id on public.match_results using btree (event_id) TABLESPACE pg_default;

create index IF not exists idx_match_results_event_finished on public.match_results using btree (event_finished) TABLESPACE pg_default;

create index IF not exists idx_match_results_event_id_finished on public.match_results using btree (event_id, event_finished) TABLESPACE pg_default;

create trigger trigger_validate_participant_numbers BEFORE INSERT
or
update on match_results for EACH row
execute FUNCTION validate_participant_numbers ();