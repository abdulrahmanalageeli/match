import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { generatedPairReport, ADMIN_RESULT_SUMMARY_COLUMNS } from './admin-result-report.mjs'
import { loadAdminResultPairs } from '../../app/lib/admin-result-pairs.mjs'

test('saved generation responses exclude the large report; previews retain details', () => {
  const pairs = [{ reason: 'x'.repeat(5_000_000) }]
  assert.ok(JSON.stringify(generatedPairReport(pairs, 'session')).length < 200)
  assert.equal(generatedPairReport(pairs, null).calculatedPairs, pairs)
  assert.ok(!ADMIN_RESULT_SUMMARY_COLUMNS.includes('calculated_pairs'))
  assert.ok(!ADMIN_RESULT_SUMMARY_COLUMNS.includes('participant_results'))
  assert.ok(!ADMIN_RESULT_SUMMARY_COLUMNS.includes('match_results'))
})

test('report paging preserves details and order, limits bytes, and restricts access', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table admin_results(session_id text, calculated_pairs jsonb, created_at timestamptz default now());`)
    const sql = await readFile(new URL('../../supabase/migrations/20260916112651_paginate_admin_result_pairs.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    const pairs = Array.from({ length: 321 }, (_, i) => ({ i, reason: 'ت'.repeat(6_000), nested: { score: i } }))
    await db.query('insert into admin_results(session_id, calculated_pairs) values ($1, $2)', ['test', JSON.stringify(pairs)])
    const offsets = []
    const loaded = await loadAdminResultPairs('test', async (_, init) => {
      const { offset, sessionId } = JSON.parse(init.body)
      offsets.push(offset)
      const { rows } = await db.query('select get_admin_result_pair_page($1,$2) as page', [sessionId, offset])
      const body = JSON.stringify({ success: true, ...rows[0].page })
      assert.ok(Buffer.byteLength(body) < 2_100_000)
      return Response.json(JSON.parse(body))
    })
    assert.deepEqual(loaded, pairs)
    assert.deepEqual(offsets, [0, 150, 300])
    const { rows } = await db.query(`select
      has_function_privilege('anon','get_admin_result_pair_page(text,integer)','execute') as anon,
      has_function_privilege('authenticated','get_admin_result_pair_page(text,integer)','execute') as authenticated,
      has_function_privilege('service_role','get_admin_result_pair_page(text,integer)','execute') as service`)
    assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true })
    assert.equal((await db.query("select get_admin_result_pair_page('missing',0) as page")).rows[0].page, null)
    assert.deepEqual((await db.query("select get_admin_result_pair_page('test',321) as page")).rows[0].page.pairs, [])
    await db.query('insert into admin_results(session_id, calculated_pairs) values ($1, $2)', ['large', JSON.stringify(Array.from({length: 30}, (_, i) => ({ i, reason: 'x'.repeat(100_000) })))])
    const page = (await db.query("select get_admin_result_pair_page('large',0) as page")).rows[0].page
    assert.equal(page.nextOffset, 19)
    assert.ok(Buffer.byteLength(JSON.stringify(page)) < 2_000_000)
  } finally { await db.close() }
})

test('report loading stops on errors and when a different session replaces it', async () => {
  await assert.rejects(loadAdminResultPairs('s', async () => Response.json({ error: 'failed' }, { status: 503 })), /failed/)
  await assert.rejects(loadAdminResultPairs('s', async () => Response.json({ success: true, pairs: [], nextOffset: 0 })), /cursor/)
  let current = true
  const result = await loadAdminResultPairs('s', async () => {
    current = false
    return Response.json({ success: true, pairs: [1], nextOffset: null })
  }, { isCurrent: () => current })
  assert.equal(result, null)
})
