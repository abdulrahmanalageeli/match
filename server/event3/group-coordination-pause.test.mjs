import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { GROUP_COORDINATION_ENABLED } from '../../app/lib/event3-group-coordination.mjs'

const api = await readFile(new URL('../../api/participant.mjs', import.meta.url), 'utf8')
const ui = await readFile(new URL('../../app/routes/event3.tsx', import.meta.url), 'utf8')

test('paused coordination returns idle to old clients and blocks every mutation before database work', () => {
  assert.equal(GROUP_COORDINATION_ENABLED, false)
  const start = api.indexOf('const groupCoordinationOperation = new Map(')
  const end = api.indexOf('const requestedRound =', start)
  const earlyHandler = `${api.slice(start, end)}\n} return 'continued'`
  const actions = [
    'e3-get-group-coordination', 'e3-open-group-election', 'e3-cast-group-coordinator-vote',
    'e3-start-group-reelection', 'e3-finalize-group-election', 'e3-direct-group-coordinator',
    'e3-random-group-coordinator', 'e3-publish-group-content', 'e3-clear-group-content',
  ]
  for (const action of actions) {
    let status
    const result = runInNewContext(`(() => { ${earlyHandler} })()`, {
      action, GROUP_COORDINATION_ENABLED,
      res: { status(value) { status = value; return this }, json(value) { return value } },
    })
    if (action === 'e3-get-group-coordination') {
      assert.equal(status, 200)
      assert.equal(result.status, 'idle')
      assert.equal(result.coordinator_number, null)
      assert.equal(result.active_content, null)
    } else {
      assert.equal(status, 503, action)
      assert.equal(result.code, 'EVENT3_GROUP_COORDINATION_DISABLED')
      assert.equal(result.retryable, false)
    }
  }
})

test('finishing warmup opens activities without making an election request', async () => {
  const start = ui.indexOf('const beginGroupActivities = useCallback(async () => {')
  const end = ui.indexOf('}, [token, round, applyCoordinationState])', start)
  const body = ui.slice(start + 'const beginGroupActivities = useCallback(async () => {'.length, end)
    .replace('data as GroupCoordinationState', 'data')
  const state = {}
  await runInNewContext(`(async () => { ${body} })()`, {
    GROUP_COORDINATION_ENABLED,
    setGroupActivityStage: value => { state.stage = value },
    setGroupsHaveOpened: value => { state.opened = value },
    setCoordinationError: value => { state.error = value },
    token: 'test', round: 1,
    call: () => { throw new Error('Election requests must stay disabled') },
  })
  assert.deepEqual(state, { stage: 'activities', opened: true, error: '' })
})
