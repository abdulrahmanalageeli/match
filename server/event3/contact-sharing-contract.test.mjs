import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const participantApiPath = new URL('../../api/participant.mjs', import.meta.url)
const event3RoutePath = new URL('../../app/routes/event3.tsx', import.meta.url)
const resultsRoutePath = new URL('../../app/routes/results.tsx', import.meta.url)

test('all three one-to-one feedback endpoints validate contact sharing', async () => {
  const source = await readFile(participantApiPath, 'utf8')

  for (const phase of [2, 3, 4]) {
    assert.match(source, new RegExp(`action === "e3-submit-phase${phase}-feedback"`))
  }

  assert.equal(
    source.match(/normalizeEvent3FeedbackPayload\(req\.body\.feedback\)/g)?.length,
    3,
  )
  assert.equal(source.match(/buildEvent3MutualContactShare\(\{/g)?.length, 6)
})

test('the shared feedback flow submits every one-to-one round and renders custom contact messages', async () => {
  const [event3Source, resultsSource] = await Promise.all([
    readFile(event3RoutePath, 'utf8'),
    readFile(resultsRoutePath, 'utf8'),
  ])

  for (const phase of [2, 3, 4]) {
    assert.match(event3Source, new RegExp(`e3-submit-phase${phase}-feedback`))
  }

  assert.match(event3Source, /contactMethod === 'phone'/)
  assert.match(event3Source, /contactMethod === 'message'/)
  assert.match(event3Source, /value=\{fb\.contactMessage\}/)
  assert.match(resultsSource, /match\.partner_contact_method === 'message'/)
  assert.match(resultsSource, /\{match\.partner_contact_message\}/)
})
