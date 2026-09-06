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
  const revealPairStart = finalReveal.indexOf('const revealPair =')
  const revealPairEnd = finalReveal.indexOf('return res.status(200).json', revealPairStart)
  const revealPair = finalReveal.slice(revealPairStart, revealPairEnd)

  assert.match(finalReveal, /fetchParticipantBalancedCacheBreakdown\(myNumber, matchRow\.phase4_partner\)/)
  assert.match(finalReveal, /insight: buildEvent3PairInsight\(\{ score: compatibilityScore, breakdown, partnerName \}\)/)
  assert.match(finalReveal, /phase4: choiceOnlyReveal \? revealPair\(\{[^}]*storedScore: null, breakdown: phase4Breakdown/s)
  assert.doesNotMatch(revealPair, /\n\s+score_model_version:/)
  assert.doesNotMatch(revealPair, /\n\s+breakdown:/)
  assert.doesNotMatch(finalReveal, /compatibility_score: isChoiceOnlyEvent3\(eventFormat\) \? null/)
})

test("final reveal shows participant-safe high-level readings for every eligible pair", async () => {
  const source = await readFile(event3RoutePath, "utf8")
  const start = source.indexOf('// ─── Final Reveal Screen')
  const end = source.indexOf('// ─── Main Event3 Component', start)
  const finalReveal = source.slice(start, end)

  assert.match(finalReveal, /FINAL_REVEAL_RATING_THRESHOLD = 60/)
  assert.match(source, /لم يتم تحليله/)
  assert.match(finalReveal, /score=\{p4\?\.compatibility_score\}/)
  assert.match(finalReveal, /قراءة ما بين السطور/)
  assert.match(finalReveal, /PairInsightCard result=\{p2\}/)
  assert.match(finalReveal, /PairInsightCard result=\{p3\}/)
  assert.match(finalReveal, /PairInsightCard result=\{p4\}/)
  assert.doesNotMatch(source, /function CompatibilityBreakdown/)
  assert.doesNotMatch(source, /currentBalancedGroupedDimensionsForDisplay/)
  assert.doesNotMatch(finalReveal, /score=\{choiceOnly \? null/)
})

test("optional Event3 AI reading authorizes the requested partner and hides internals", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const start = source.indexOf('if (action === "generate-vibe-analysis")')
  const end = source.indexOf('// ENABLE AUTO-SIGNUP', start)
  const analysis = source.slice(start, end)

  assert.match(analysis, /event3_context === true/)
  assert.match(analysis, /\.from\("event3_matches"\)/)
  assert.match(analysis, /assignedPartners\.includes\(partner_number\)/)
  assert.match(analysis, /ممنوع ذكر الاستبيان أو الملفات أو الإجابات أو المعايير أو الأبعاد أو الدرجات أو الخوارزمية/)
})
