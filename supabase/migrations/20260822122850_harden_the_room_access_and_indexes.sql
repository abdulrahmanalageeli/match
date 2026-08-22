-- Explicit service-only policies keep browser roles denied while documenting the
-- sole intended database access path for The Room's server API.
create policy the_room_events_service_only
  on public.the_room_events for all to service_role
  using (true) with check (true);

create policy the_room_attendees_service_only
  on public.the_room_attendees for all to service_role
  using (true) with check (true);

create policy the_room_payment_ledger_service_only
  on public.the_room_payment_ledger for all to service_role
  using (true) with check (true);

create policy the_room_schedule_runs_service_only
  on public.the_room_schedule_runs for all to service_role
  using (true) with check (true);

create policy the_room_seats_service_only
  on public.the_room_seats for all to service_role
  using (true) with check (true);

-- Cover composite foreign-key lookups in their declared column order.
create index the_room_payment_ledger_attendee_event_idx
  on public.the_room_payment_ledger(attendee_id, event_id);

create index the_room_seats_attendee_event_idx
  on public.the_room_seats(attendee_id, event_id);

create index the_room_seats_run_event_idx
  on public.the_room_seats(schedule_run_id, event_id);
