import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../supabase/migrations/20260829141952_harden_match_swap_undo.sql',
  import.meta.url,
)

test('swap undo compares and locks complete affected rows before restoring an audit', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const undoStart = sql.indexOf('create or replace function public.undo_match_swap_plan')
  const undoSql = sql.slice(undoStart)

  assert.notEqual(undoStart, -1, 'migration must replace the deployed undo RPC')
  assert.match(undoSql, /security invoker\s+set search_path = ''/)
  assert.match(undoSql, /pg_advisory_xact_lock[\s\S]*hashtextextended/)
  assert.match(undoSql, /from public\.match_results m[\s\S]*for update;/)
  assert.match(undoSql, /jsonb_agg\(pg_catalog\.to_jsonb\(m\) order by m\.id::text\)/)
  assert.match(undoSql, /v_current_rows is distinct from v_audit\.after_rows/)
  assert.match(undoSql, /errcode = '40001'/)
  assert.ok(
    undoSql.indexOf('v_current_rows is distinct from v_audit.after_rows') < undoSql.indexOf('delete from public.match_results'),
    'the exact-row conflict check must happen before any result deletion',
  )
  assert.match(undoSql, /revoke all on function public\.undo_match_swap_plan\(uuid\)[\s\S]*public, anon, authenticated, service_role/)
  assert.match(undoSql, /grant execute on function public\.undo_match_swap_plan\(uuid\)[\s\S]*to service_role/)
})

test('provenance swap wrapper requires affected numbers to equal reviewed before/after endpoints', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const wrapperStart = sql.indexOf('create or replace function public.apply_match_swap_plan_with_score_provenance')
  const undoStart = sql.indexOf('create or replace function public.undo_match_swap_plan')
  const wrapperSql = sql.slice(wrapperStart, undoStart)

  assert.notEqual(wrapperStart, -1, 'migration must retain the public provenance RPC name')
  assert.match(wrapperSql, /security definer\s+set search_path = ''/)
  assert.match(wrapperSql, /jsonb_array_elements\(p_pairs\)[\s\S]*union all[\s\S]*jsonb_array_elements\(coalesce\(p_expected_pairs/)
  assert.match(wrapperSql, /array_agg\(distinct required\.participant_number order by required\.participant_number\)/)
  assert.match(wrapperSql, /if v_given is distinct from v_required then/)
  assert.match(wrapperSql, /reviewed current and resulting pairs/)
  assert.match(wrapperSql, /apply_match_swap_plan_provenance_unchecked/)
  assert.match(wrapperSql, /revoke all on function public\.apply_match_swap_plan_provenance_unchecked\([\s\S]*service_role/)
  assert.match(wrapperSql, /grant execute on function public\.apply_match_swap_plan_with_score_provenance\([\s\S]*to service_role/)
})
