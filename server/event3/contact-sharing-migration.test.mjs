import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../../supabase/migrations/20260903150353_add_event3_feedback_contact_sharing.sql', import.meta.url)

test('contact-sharing migration covers all three one-to-one feedback rounds', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(`
      create table public.event3_matches (
        id bigint generated always as identity primary key,
        phase2_feedback jsonb,
        phase3_feedback jsonb,
        phase4_feedback jsonb
      );
      insert into public.event3_matches (phase2_feedback, phase3_feedback, phase4_feedback)
      values (
        '{"wantConnect":true,"compatibilityRate":80}',
        '{"wantConnect":true,"compatibilityRate":70}',
        '{"wantConnect":true,"compatibilityRate":60}'
      );
    `)
    await db.exec(await readFile(migrationUrl, 'utf8'))

    const backfilled = await db.query(`select
      phase2_feedback ->> 'contactMethod' as phase2_method,
      phase3_feedback ->> 'contactMethod' as phase3_method,
      phase4_feedback ->> 'contactMethod' as phase4_method
      from public.event3_matches`)
    assert.deepEqual(backfilled.rows, [{
      phase2_method: 'phone',
      phase3_method: 'phone',
      phase4_method: 'phone',
    }])

    for (const column of ['phase2_feedback', 'phase3_feedback', 'phase4_feedback']) {
      await db.exec(`update public.event3_matches set ${column} = '{"wantConnect":true,"contactMethod":"message","contactMessage":"Instagram: @person"}'`)
      const stored = await db.query(`select ${column} ->> 'contactMessage' as message from public.event3_matches`)
      assert.deepEqual(stored.rows, [{ message: 'Instagram: @person' }])

      await assert.rejects(
        db.exec(`update public.event3_matches set ${column} = '{"wantConnect":true,"contactMethod":"message","contactMessage":""}'`),
        /feedback_contact_valid/i,
      )
    }
  } finally {
    await db.close()
  }
})
