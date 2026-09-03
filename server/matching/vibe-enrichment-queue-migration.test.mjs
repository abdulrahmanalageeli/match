import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL('../../supabase/migrations/20260903133000_add_durable_vibe_enrichment_queue.sql', import.meta.url)
const compatibilitySchemaUrl = new URL('../../database/compatibility_cache.sql', import.meta.url)

test('durable vibe queue migration claims disjoint bounded batches and finishes atomically', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(await readFile(compatibilitySchemaUrl, 'utf8'))
    await db.exec(await readFile(migrationUrl, 'utf8'))

    const pendingCacheRow = {
      participant_a_number: 1,
      participant_b_number: 101,
      vibe_content_hash: 'vibe-1',
      mbti_hash: 'mbti-1',
      ai_vibe_score: 50,
      mbti_score: 60,
      attachment_score: 60,
      communication_score: 60,
      lifestyle_score: 60,
      core_values_score: 60,
      total_compatibility_score: 77,
      combined_content_hash: 'combined-1',
      attachment_hash: 'attachment-1',
      communication_hash: 'communication-1',
      lifestyle_hash: 'lifestyle-1',
      core_values_hash: 'values-1',
      synergy_hash: 'synergy-1',
      interaction_synergy_score: 60,
      intent_goal_score: 60,
      model_used: 'gpt-5.4-mini|balanced-vibe12-v1|fallback=deferred_ai',
      score_model_version: 'v11',
      score_breakdown: {},
      question_scores: {},
      vibe_axes: {},
      vibe_model_version: 'balanced-vibe12-v1',
    }
    const pendingJob = {
      event_id: 26,
      match_id: '00000000-0000-0000-0000-000000000001',
      participant_a_number: 1,
      participant_b_number: 101,
      combined_content_hash: 'combined-1',
      vibe_content_hash: 'vibe-1',
      score_model_version: 'v11',
    }
    const atomicStore = await db.query(
      'select public.store_deferred_v11_compatibility_cache($1::jsonb, $2::jsonb) as count',
      [JSON.stringify([pendingCacheRow]), JSON.stringify([pendingJob])],
    )
    assert.equal(atomicStore.rows[0].count, 1)

    await db.exec(`
      insert into public.compatibility_vibe_enrichment_jobs (
        event_id, match_id, participant_a_number, participant_b_number,
        combined_content_hash, vibe_content_hash, score_model_version
      )
      select
        26,
        '00000000-0000-0000-0000-000000000001'::uuid,
        value,
        value + 100,
        'combined-' || value,
        'vibe-' || value,
        'v11'
      from generate_series(2, 13) as value;
    `)

    await db.exec(`
      update public.compatibility_cache
      set ai_vibe_score = 88,
          model_used = 'gpt-5.4-mini|balanced-vibe12-v1'
      where participant_a_number = 1 and participant_b_number = 101;
    `)
    const downgradeAttempt = await db.query(
      'select public.store_deferred_v11_compatibility_cache($1::jsonb, $2::jsonb) as count',
      [JSON.stringify([pendingCacheRow]), JSON.stringify([pendingJob])],
    )
    assert.equal(downgradeAttempt.rows[0].count, 0)
    const preserved = await db.query(`
      select ai_vibe_score::integer as ai_vibe_score, model_used
      from public.compatibility_cache
      where participant_a_number = 1 and participant_b_number = 101
    `)
    assert.deepEqual(preserved.rows[0], {
      ai_vibe_score: 88,
      model_used: 'gpt-5.4-mini|balanced-vibe12-v1',
    })

    const first = await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(12)')
    const second = await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(12)')
    assert.equal(first.rows.length, 12)
    assert.equal(second.rows.length, 1)
    assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 13)

    const finishPayload = first.rows.map(row => ({ id: row.id, status: 'completed', error: '' }))
    const finished = await db.query(
      'select public.finish_compatibility_vibe_enrichment_jobs($1::jsonb) as count',
      [JSON.stringify(finishPayload)],
    )
    assert.equal(finished.rows[0].count, 12)

    const counts = await db.query(`
      select status, count(*)::integer as count
      from public.compatibility_vibe_enrichment_jobs
      group by status
      order by status
    `)
    assert.deepEqual(counts.rows, [
      { status: 'completed', count: 12 },
      { status: 'processing', count: 1 },
    ])

    const grants = await db.query(`
      select
        has_table_privilege('anon', 'public.compatibility_vibe_enrichment_jobs', 'select') as anon_select,
        has_table_privilege('authenticated', 'public.compatibility_vibe_enrichment_jobs', 'insert') as authenticated_insert,
        has_table_privilege('service_role', 'public.compatibility_vibe_enrichment_jobs', 'select,insert,update,delete') as service_access
    `)
    assert.deepEqual(grants.rows[0], {
      anon_select: false,
      authenticated_insert: false,
      service_access: true,
    })
  } finally {
    await db.close()
  }
})
