-- Privacy-minimized export for scripts/train-personalized-compatibility.py.
-- The result still contains pseudonymous survey answers. Keep the exported JSON
-- local and delete it after training; never commit it.
with selected_events(match_id, event_id) as (
  values
    ('00000000-0000-0000-0000-000000000003'::uuid, 26),
    ('00000000-0000-0000-0000-000000000003'::uuid, 27)
),
roster as (
  select ep.match_id, ep.event_id, ep.participant_number
  from public.event3_participants ep
  join selected_events using (match_id, event_id)
),
last_rank as (
  select rankings.match_id,
         rankings.event_id,
         rankings.ranker_number,
         max(rankings.submitted_at) as at
  from public.participant_rankings rankings
  join selected_events using (match_id, event_id)
  group by rankings.match_id, rankings.event_id, rankings.ranker_number
),
profiles as (
  select roster.event_id,
         participant.assigned_number,
         jsonb_strip_nulls(jsonb_build_object(
           'match_disagreement_style', answers -> 'match_disagreement_style',
           'match_similarity_preference', answers -> 'match_similarity_preference',
           'match_current_focus', answers -> 'match_current_focus',
           'humor_banter_style', coalesce(answers -> 'humor_banter_style', to_jsonb(participant.humor_banter_style)),
           'early_openness_comfort', coalesce(answers -> 'early_openness_comfort', to_jsonb(participant.early_openness_comfort)),
           'conversation_initiative_preference', answers -> 'conversation_initiative_preference',
           'expression_language', coalesce(answers -> 'expression_language', to_jsonb(participant.expression_language)),
           'minimum_partner_religious_commitment', coalesce(answers -> 'minimum_partner_religious_commitment', to_jsonb(participant.minimum_partner_religious_commitment)),
           'social_relationship_style', coalesce(answers -> 'social_relationship_style', to_jsonb(participant.social_relationship_style)),
           'attachment_1', answers -> 'attachment_1',
           'attachment_3', answers -> 'attachment_3',
           'attachment_4', answers -> 'attachment_4',
           'lifestyle_1', answers -> 'lifestyle_1',
           'lifestyle_2', answers -> 'lifestyle_2',
           'lifestyle_3', answers -> 'lifestyle_3',
           'lifestyle_4', answers -> 'lifestyle_4',
           'lifestyle_5', answers -> 'lifestyle_5',
           'core_values_1', answers -> 'core_values_1',
           'core_values_2', answers -> 'core_values_2',
           'core_values_3', answers -> 'core_values_3',
           'core_values_4', answers -> 'core_values_4',
           'core_values_5', answers -> 'core_values_5',
           'communication_1', answers -> 'communication_1',
           'communication_2', answers -> 'communication_2',
           'communication_3', answers -> 'communication_3',
           'communication_4', answers -> 'communication_4',
           'communication_5', answers -> 'communication_5',
           'conversational_role', coalesce(answers -> 'conversational_role', to_jsonb(participant.conversational_role)),
           'conversation_depth_pref', coalesce(answers -> 'conversation_depth_pref', to_jsonb(participant.conversation_depth_pref)),
           'social_battery', coalesce(answers -> 'social_battery', to_jsonb(participant.social_battery)),
           'humor_subtype', coalesce(answers -> 'humor_subtype', to_jsonb(participant.humor_subtype)),
           'curiosity_style', coalesce(answers -> 'curiosity_style', to_jsonb(participant.curiosity_style)),
           'intent_goal', coalesce(answers -> 'intent_goal', to_jsonb(participant.intent_goal)),
           'silence_comfort', coalesce(answers -> 'silence_comfort', to_jsonb(participant.silence_comfort))
         )) as answers,
         history.changed_at as reconstructed_from_change_at
  from roster
  join public.participants participant
    on participant.assigned_number = roster.participant_number
  left join last_rank
    on last_rank.match_id = roster.match_id
   and last_rank.event_id = roster.event_id
   and last_rank.ranker_number = roster.participant_number
  left join lateral (
    select min(earliest.changed_at) as changed_at,
           coalesce(jsonb_object_agg(earliest.key, earliest.value), '{}'::jsonb) as previous_answers
    from (
      select distinct on (entry.key)
             changes.changed_at,
             entry.key,
             entry.value
      from public.survey_change_history changes
      cross join lateral jsonb_each(coalesce(changes.previous_answers, '{}'::jsonb)) entry(key, value)
      where changes.participant_number = participant.assigned_number
        and last_rank.at is not null
        and changes.changed_at > last_rank.at
      order by entry.key, changes.changed_at asc
    ) earliest
  ) history on true
  cross join lateral (
    select coalesce(participant.survey_data -> 'answers', '{}'::jsonb)
           || coalesce(history.previous_answers, '{}'::jsonb) as answers
  ) merged
),
group_assignments as (
  select assignments.match_id,
         assignments.event_id,
         assignments.round,
         assignments.table_number,
         assignments.participant_id
  from public.session_assignments assignments
  join selected_events using (match_id, event_id)
  where assignments.round between 1 and 3
),
exposures as (
  select distinct left_side.match_id,
         left_side.event_id,
         left_side.participant_id as ranker_number,
         right_side.participant_id as ranked_number
  from group_assignments left_side
  join group_assignments right_side
    on right_side.match_id = left_side.match_id
   and right_side.event_id = left_side.event_id
   and right_side.round = left_side.round
   and right_side.table_number = left_side.table_number
   and right_side.participant_id <> left_side.participant_id
),
rankings as (
  select saved.event_id,
         saved.ranker_number,
         saved.ranked_number,
         saved.rank,
         saved.auto_saved
  from public.participant_rankings saved
  join exposures using (match_id, event_id, ranker_number, ranked_number)
)
select jsonb_build_object(
  'event_ids', jsonb_build_array(26, 27),
  'profiles', (
    select jsonb_agg(to_jsonb(profile) order by event_id, assigned_number)
    from profiles profile
  ),
  'rankings', (
    select jsonb_agg(to_jsonb(ranking) order by event_id, ranker_number, rank)
    from rankings ranking
  )
) as payload;
