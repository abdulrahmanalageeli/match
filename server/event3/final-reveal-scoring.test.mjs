import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const participantApiPath = new URL("../../api/participant.mjs", import.meta.url)
const event3RoutePath = new URL("../../app/routes/event3.tsx", import.meta.url)

test("choice-only final reveal returns validated scores for all three matches", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const start = source.indexOf('// e3-get-final-reveal')
  const end = source.indexOf('// e3-get-notes', start)
  const finalReveal = source.slice(start, end)

  assert.match(finalReveal, /fetchParticipantBalancedCacheBreakdown\(myNumber, matchRow\.phase4_partner\)/)
  assert.match(finalReveal, /compatibility_score: revealScore\(null, phase4Breakdown\)/)
  assert.doesNotMatch(finalReveal, /compatibility_score: isChoiceOnlyEvent3\(eventFormat\) \? null/)
})

test("final reveal shows scores only from 60 percent and restores choice-only analysis", async () => {
  const source = await readFile(event3RoutePath, "utf8")
  const start = source.indexOf('// ─── Final Reveal Screen')
  const end = source.indexOf('// ─── Main Event3 Component', start)
  const finalReveal = source.slice(start, end)

  assert.match(finalReveal, /FINAL_REVEAL_RATING_THRESHOLD = 60/)
  assert.match(finalReveal, /لم يتم تحليله — يظهر التحليل من 60% فأعلى/)
  assert.match(finalReveal, /score=\{p4\?\.compatibility_score\}/)
  assert.match(finalReveal, /activeTab === 'third'/)
  assert.doesNotMatch(finalReveal, /score=\{choiceOnly \? null/)
})
