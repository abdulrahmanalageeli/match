alter table public.event3_cohost_notes
  drop constraint if exists event3_cohost_notes_round_check,
  drop constraint if exists event3_cohost_notes_scope_shape;

alter table public.event3_cohost_notes
  add constraint event3_cohost_notes_round_check
    check (round in (1, 2, 3, 20, 30, 40)),
  add constraint event3_cohost_notes_scope_shape check (
    (
      scope_type = 'event'
      and round is null
      and table_number is null
      and participant_number is null
      and participant2_number is null
    )
    or (
      scope_type = 'table'
      and round is not null
      and table_number is not null
      and participant_number is null
      and participant2_number is null
    )
    or (
      scope_type = 'participant'
      and round is null
      and table_number is null
      and participant_number is not null
      and participant2_number is null
    )
    or (
      scope_type = 'pair'
      and round in (20, 30, 40)
      and table_number is null
      and participant_number is not null
      and participant2_number is not null
      and participant_number < participant2_number
    )
  );
