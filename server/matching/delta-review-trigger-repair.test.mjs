import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const originalMigrationUrl = new URL('../../supabase/migrations/20260903133544_add_delta_review_acknowledgements.sql', import.meta.url)
const repairMigrationUrl = new URL('../../supabase/migrations/20260905124116_fix_delta_review_survey_trigger_and_backfill.sql', import.meta.url)

test('normal survey updates enqueue immediately and previously missed edits are backfilled', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(`
      create table public.participants (
        id uuid primary key,
        assigned_number integer not null unique,
        match_id uuid not null,
        name text,
        survey_data jsonb,
        survey_data_updated_at timestamptz,
        next_event_signup_timestamp timestamptz,
        event_enrolled_at timestamptz,
        created_at timestamptz not null default pg_catalog.now()
      );

      create function public.update_survey_data_timestamp()
      returns trigger
      language plpgsql
      as $$
      begin
        if new.survey_data is distinct from old.survey_data then
          new.survey_data_updated_at = pg_catalog.clock_timestamp();
        end if;
        return new;
      end;
      $$;

      create trigger trigger_set_survey_data_updated_at
      before update on public.participants
      for each row
      execute function public.update_survey_data_timestamp();

      insert into public.participants (
        id,
        assigned_number,
        match_id,
        name,
        survey_data,
        survey_data_updated_at,
        created_at
      ) values (
        '00000000-0000-0000-0000-000000000580',
        580,
        '00000000-0000-0000-0000-000000000000',
        'Submitted participant',
        '{"answers":{"name":"Submitted participant","choice":"old"}}',
        '2026-08-01T08:00:00Z',
        '2026-08-01T08:00:00Z'
      );
    `)

    await db.exec(await readFile(originalMigrationUrl, 'utf8'))
    await db.exec(`
      update public.participants
      set survey_data = '{"answers":{"name":"Submitted participant","choice":"missed"}}'
      where assigned_number = 580;
    `)

    let rows = await db.query(`
      select activity_at, survey_updated, acknowledged_at
      from public.delta_review_items
      where participant_id = '00000000-0000-0000-0000-000000000580'
    `)
    assert.equal(rows.rows.length, 0, 'the original UPDATE OF trigger reproduces the missed enqueue')

    await db.exec(await readFile(repairMigrationUrl, 'utf8'))
    rows = await db.query(`
      select activity_at, survey_updated, acknowledged_at
      from public.delta_review_items
      where participant_id = '00000000-0000-0000-0000-000000000580'
    `)
    assert.equal(rows.rows.length, 1)
    assert.equal(rows.rows[0].survey_updated, true)
    assert.equal(rows.rows[0].acknowledged_at, null)

    await db.exec(`
      update public.delta_review_items
      set acknowledged_at = pg_catalog.clock_timestamp()
      where participant_id = '00000000-0000-0000-0000-000000000580';

      update public.participants
      set survey_data = '{"answers":{"name":"Submitted participant","choice":"new"}}'
      where assigned_number = 580;
    `)
    rows = await db.query(`
      select
        review.activity_at,
        participant.survey_data_updated_at,
        review.survey_updated,
        review.acknowledged_at
      from public.delta_review_items as review
      join public.participants as participant on participant.id = review.participant_id
      where participant.assigned_number = 580
    `)
    assert.equal(rows.rows.length, 1)
    assert.equal(rows.rows[0].survey_updated, true)
    assert.equal(rows.rows[0].acknowledged_at, null)
    assert.equal(
      new Date(rows.rows[0].activity_at).toISOString(),
      new Date(rows.rows[0].survey_data_updated_at).toISOString(),
    )
  } finally {
    await db.close()
  }
})
