import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../../supabase/migrations/20260903133544_add_delta_review_acknowledgements.sql', import.meta.url)

test('delta review queue is persistent, activity-driven, and server-only', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(`
      create table public.participants (
        id uuid primary key,
        assigned_number integer not null unique,
        survey_data_updated_at timestamptz,
        next_event_signup_timestamp timestamptz,
        event_enrolled_at timestamptz,
        created_at timestamptz not null default pg_catalog.now()
      );

      insert into public.participants (
        id,
        assigned_number,
        survey_data_updated_at,
        created_at
      ) values (
        '00000000-0000-0000-0000-000000000001',
        1,
        '2026-09-03T08:00:00Z',
        '2026-08-01T08:00:00Z'
      );
    `)
    await db.exec(await readFile(migrationUrl, 'utf8'))

    let rows = await db.query(`
      select activity_at, survey_updated, newly_enrolled, acknowledged_at
      from public.delta_review_items
      where participant_id = '00000000-0000-0000-0000-000000000001'
    `)
    assert.equal(rows.rows.length, 1)
    assert.equal(rows.rows[0].survey_updated, true)
    assert.equal(rows.rows[0].newly_enrolled, false)
    assert.equal(rows.rows[0].acknowledged_at, null)

    await db.exec(`
      update public.delta_review_items
      set acknowledged_at = '2026-09-03T09:00:00Z'
      where participant_id = '00000000-0000-0000-0000-000000000001';

      grant select, update on public.participants to authenticated;
      set role authenticated;
      update public.participants
      set next_event_signup_timestamp = '2026-09-03T10:00:00Z'
      where assigned_number = 1;
      reset role;
    `)
    rows = await db.query(`
      select activity_at, survey_updated, newly_enrolled, acknowledged_at
      from public.delta_review_items
      where participant_id = '00000000-0000-0000-0000-000000000001'
    `)
    assert.equal(rows.rows.length, 1)
    assert.equal(rows.rows[0].survey_updated, false)
    assert.equal(rows.rows[0].newly_enrolled, true)
    assert.equal(rows.rows[0].acknowledged_at, null)

    await db.exec(`
      update public.participants
      set survey_data_updated_at = '2026-09-03T11:00:00Z'
      where assigned_number = 1;
    `)
    rows = await db.query(`
      select survey_updated, newly_enrolled
      from public.delta_review_items
      where participant_id = '00000000-0000-0000-0000-000000000001'
    `)
    assert.equal(rows.rows[0].survey_updated, true)
    assert.equal(rows.rows[0].newly_enrolled, true)

    const grants = await db.query(`
      select
        has_table_privilege('anon', 'public.delta_review_items', 'select') as anon_select,
        has_table_privilege('authenticated', 'public.delta_review_items', 'update') as authenticated_update,
        has_table_privilege('service_role', 'public.delta_review_items', 'select,update') as service_access
    `)
    assert.deepEqual(grants.rows[0], {
      anon_select: false,
      authenticated_update: false,
      service_access: true,
    })

    await db.exec('delete from public.participants where assigned_number = 1')
    const remaining = await db.query('select count(*)::integer as count from public.delta_review_items')
    assert.equal(remaining.rows[0].count, 0)
  } finally {
    await db.close()
  }
})
