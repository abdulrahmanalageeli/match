-- Add groups_locked flag to control Groups page visibility for non-confirmed users
alter table if exists public.event_state
  add column if not exists groups_locked boolean null default false;
