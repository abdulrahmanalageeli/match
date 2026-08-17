-- Revert the participant-snapshot Delta Cache experiment. Delta Cache returns
-- to its established timestamp-based survey/enrollment detection.

drop function if exists public.record_cache_session_with_participants(
  uuid,
  integer,
  integer[],
  integer,
  integer,
  integer,
  integer,
  numeric,
  text
);

drop table if exists public.cache_participant_snapshots;
