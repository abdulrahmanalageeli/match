-- Keep swap-chain results in the same persistent lock source used by normal
-- clean-slate generation. Lock changes occur inside the swap transaction.

alter table public.match_swap_audits
  add column if not exists before_locks jsonb not null default '[]'::jsonb;

create or replace function public.sync_match_swap_locks()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pair jsonb;
begin
  if tg_op = 'INSERT' then
    -- Save the displaced locks for a conflict-safe swap undo.
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) order by l.id::text), '[]'::jsonb)
      into new.before_locks
    from public.locked_matches l
    where l.match_id = new.match_id
      and (
        l.participant1_number = any(new.affected_numbers)
        or l.participant2_number = any(new.affected_numbers)
      );

    -- Remove every old lock involving the affected people, including locks
    -- created under an earlier event that the generator would still consume.
    delete from public.locked_matches l
    where l.match_id = new.match_id
      and (
        l.participant1_number = any(new.affected_numbers)
        or l.participant2_number = any(new.affected_numbers)
      );

    -- Lock each resulting pair using the same table and fields as the regular UI.
    for v_pair in select value from pg_catalog.jsonb_array_elements(new.after_rows)
    loop
      if (v_pair ->> 'participant_a_number')::integer <> 9999
         and (v_pair ->> 'participant_b_number')::integer <> 9999 then
        insert into public.locked_matches (
          match_id,
          participant1_number,
          participant2_number,
          created_by,
          reason,
          original_compatibility_score,
          original_match_round,
          event_id
        ) values (
          new.match_id,
          (v_pair ->> 'participant_a_number')::integer,
          (v_pair ->> 'participant_b_number')::integer,
          'admin',
          'Match Control Center swap chain',
          (v_pair ->> 'compatibility_score')::numeric,
          new.round,
          new.event_id
        );
      end if;
    end loop;

    return new;
  end if;

  if tg_op = 'UPDATE' and old.undone_at is null and new.undone_at is not null then
    delete from public.locked_matches l
    where l.match_id = new.match_id
      and (
        l.participant1_number = any(new.affected_numbers)
        or l.participant2_number = any(new.affected_numbers)
      );

    insert into public.locked_matches
    select restored.*
    from pg_catalog.jsonb_populate_recordset(null::public.locked_matches, new.before_locks) restored;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_match_swap_locks_on_audit on public.match_swap_audits;
create trigger sync_match_swap_locks_on_audit
before insert or update of undone_at on public.match_swap_audits
for each row execute function public.sync_match_swap_locks();

revoke all on function public.sync_match_swap_locks() from public, anon, authenticated;
grant execute on function public.sync_match_swap_locks() to service_role;
