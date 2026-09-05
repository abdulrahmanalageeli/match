import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const participantApiPath = new URL('../../api/participant.mjs', import.meta.url)
const event3RoutePath = new URL('../../app/routes/event3.tsx', import.meta.url)
const resultsRoutePath = new URL('../../app/routes/results.tsx', import.meta.url)
const welcomeRoutePath = new URL('../../app/routes/welcome.tsx', import.meta.url)

test('all three one-to-one feedback endpoints validate contact sharing', async () => {
  const source = await readFile(participantApiPath, 'utf8')

  for (const phase of [2, 3, 4]) {
    assert.match(source, new RegExp(`action === "e3-submit-phase${phase}-feedback"`))
  }

  assert.equal(
    source.match(/normalizeEvent3FeedbackPayload\(/g)?.length,
    4,
  )
  assert.match(source, /operation: "feedback", payload: safeFeedback/)
  assert.match(source, /\.update\(\{ \[col\]: safeFeedback \}\)/)
  assert.equal(source.match(/buildEvent3MutualContactShare\(\{/g)?.length, 6)
  assert.equal(source.match(/normalizeEvent3MemoryWord\(req\.body\.word\)/g)?.length, 3)
  assert.match(source, /word_submitted: !!matchRow\.phase3_word, my_word: matchRow\.phase3_word \|\| null/)
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
  assert.equal(event3Source.match(/<RockPaperScissors accent=/g)?.length, 1)
  assert.match(event3Source, /defaultSet=\{isThirdChoice \? "set2" : "set1"\}/)
  assert.match(event3Source, /onSubmitWord=\{submitWord\}/)
  assert.match(resultsSource, /match\.partner_contact_method === 'message'/)
  assert.match(resultsSource, /\{match\.partner_contact_message\}/)
})

test('an unfinished one-to-one feedback draft stays mounted across a phase change without reopening the expired meeting', async () => {
  const source = await readFile(event3RoutePath, 'utf8')

  assert.equal(
    source.match(/onFeedbackOpenChange\?\.\(view === 'feedback' && !feedbackDone\)/g)?.length,
    2,
  )
  assert.match(source, /setActiveMatchFeedbackSlot\(current => open \? slot : current === slot \? null : current\)/)
  assert.match(source, /const holdingMatchFeedback = Boolean\(activeMatchFeedbackPhase && phase !== activeMatchFeedbackPhase\)/)
  assert.equal(source.match(/feedbackLocked=\{holdingMatchFeedback\}/g)?.length, 3)
  assert.match(source, /step === 0 && backDisabled \? <span/)
  assert.match(source, /!activeMatchFeedbackSlot && phase === "final_reveal"/)
})

test('test-mode final reveal keeps impersonation when opening results', async () => {
  const source = await readFile(event3RoutePath, 'utf8')

  assert.match(source, /const resultsHref = `\/results\?token=\$\{encodeURIComponent\(token\)\}\$\{impersonating \? "&impersonate=1" : ""\}`/)
  assert.equal(source.match(/href=\{resultsHref\}/g)?.length, 2)
  assert.match(source, /<FinalRevealScreen[^>]+impersonating=\{isImpersonating\}/)
})

test('historical feedback accepts a confirmed 50 score and collects an explicit contact-sharing method', async () => {
  const source = await readFile(welcomeRoutePath, 'utf8')
  const modalStart = source.indexOf('function RemoteFeedbackModal')
  assert.notEqual(modalStart, -1)
  const modalSource = source.slice(modalStart)

  assert.match(modalSource, /50٪ يناسبني/)
  assert.doesNotMatch(modalSource, /compatibilityRate === 50/)
  assert.match(modalSource, /contactMethod === 'phone'/)
  assert.match(modalSource, /contactMethod === 'message'/)
  assert.match(modalSource, /maxLength=\{EVENT3_CONTACT_MESSAGE_MAX_LENGTH\}/)
  assert.match(modalSource, /feedback: \{ \.\.\.fb \}/)
})
