import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
test('fast queue prioritizes attendees, caps active jobs globally, and respects retry delays', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.participants (match_id uuid, assigned_number integer, event_id integer);
      create schema cron;
      create function cron.schedule(text, text, text) returns bigint language sql as 'select 1::bigint';
      create function public.invoke_compatibility_vibe_worker() returns bigint language sql as 'select 1::bigint';`)
    await db.exec(await read('database/compatibility_cache.sql'))
    await db.exec(await read('supabase/migrations/20260903133000_add_durable_vibe_enrichment_queue.sql'))
    await db.exec(await read('supabase/migrations/20260916110000_accelerate_vibe_queue.sql'))
    await db.exec(`insert into public.compatibility_vibe_enrichment_jobs
      (event_id,match_id,participant_a_number,participant_b_number,combined_content_hash,vibe_content_hash,score_model_version)
      select 28,'00000000-0000-0000-0000-000000000001',i,i+100,'c'||i,'v'||i,'v12' from generate_series(1,50) i;
      insert into public.participants values
        ('00000000-0000-0000-0000-000000000001',50,28),
        ('00000000-0000-0000-0000-000000000001',150,28);
      update public.compatibility_vibe_worker_control set priority_event_id=28;
      update public.compatibility_vibe_enrichment_jobs set available_at=now()+interval '1 hour' where participant_a_number=1;`)
    const first = await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(1)')
    assert.equal(first.rows[0].participant_a_number, 50, 'actual attendee pair comes first')
    const next = await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(100)')
    assert.equal(next.rows.length, 12, 'a single worker stays limited to 12')
    await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(12)')
    const last = await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(12)')
    assert.equal(last.rows.length, 11, 'last worker only claims remaining global slots')
    assert.equal((await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(12)')).rows.length, 0)
    assert.equal((await db.query('select public.dispatch_compatibility_vibe_worker() as result')).rows[0].result, null)
    const status = (await db.query('select public.compatibility_vibe_queue_status(28) as status')).rows[0].status
    assert.equal(status.processing, 36)
    assert.equal(status.pending, 14)
    assert.equal(status.priority_event_id, 28)
    await db.query('select public.finish_compatibility_vibe_enrichment_jobs($1::jsonb)', [JSON.stringify([{id:first.rows[0].id,status:'completed'}])])
    const replacement = await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(12)')
    assert.equal(replacement.rows.length, 1)
    assert.notEqual(replacement.rows[0].participant_a_number, 1, 'delayed retries are not claimed early')
    await db.exec(`update public.compatibility_vibe_enrichment_jobs set locked_at=now()-interval '11 minutes'
      where id='${replacement.rows[0].id}';`)
    assert.equal((await db.query('select * from public.claim_compatibility_vibe_enrichment_jobs(12)')).rows.length, 1, 'abandoned job slot is recovered')
    const permissions = (await db.query(`select
      has_function_privilege('anon','public.compatibility_vibe_queue_status(integer)','execute') as public_status,
      has_table_privilege('authenticated','public.compatibility_vibe_worker_control','update') as public_control,
      has_function_privilege('service_role','public.compatibility_vibe_queue_status(integer)','execute') as admin_status`)).rows[0]
    assert.deepEqual(permissions, { public_status: false, public_control: false, admin_status: true })
  } finally { await db.close() }
})
