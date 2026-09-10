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

test("final reveal exposes only participant-safe meeting outcome metadata", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const start = source.indexOf('// e3-get-final-reveal')
  const end = source.indexOf('// e3-get-notes', start)
  const finalReveal = source.slice(start, end)
  const revealPairStart = finalReveal.indexOf('const revealPair =')
  const revealPairEnd = finalReveal.indexOf('return res.status(200).json', revealPairStart)
  const revealPair = finalReveal.slice(revealPairStart, revealPairEnd)

  assert.match(finalReveal, /phase2_score_snapshot,phase3_score,[^"]*phase2_feedback,phase3_feedback,phase4_feedback,match_preference/)
  assert.match(finalReveal, /phase3_score_snapshot,phase2_feedback,phase3_feedback,match_preference/)
  assert.match(revealPair, /const meetingFeedback = sanitizeEvent3SavedFeedback\(feedback\)/)
  assert.match(revealPair, /\.\.\.event3FeedbackMeetingMetadata\(meetingFeedback\)/)
  for (const phase of [2, 3, 4]) {
    assert.match(finalReveal, new RegExp(`feedback: matchRow\\.phase${phase}_feedback`))
  }
  assert.doesNotMatch(revealPair, /saved_feedback|feedback_fingerprint|organizer|participantMessage|wantConnect|conversationQuality|personalConnection/)
})

test("final reveal distinguishes a limited real score from unavailable data without moving the threshold", async () => {
  const source = await readFile(event3RoutePath, "utf8")
  const start = source.indexOf('// ─── Final Reveal Screen')
  const end = source.indexOf('// ─── Main Event3 Component', start)
  const finalReveal = source.slice(start, end)

  assert.match(finalReveal, /FINAL_REVEAL_RATING_THRESHOLD = 60/)
  assert.match(finalReveal, /if \(score === null\) return "درجة غير متاحة"/)
  assert.match(finalReveal, /score >= FINAL_REVEAL_RATING_THRESHOLD \? `بنسبة \$\{score\} بالمئة` : "إشارة محدودة من الإجابات"/)
  assert.match(finalReveal, /normalizedScore !== null \? "إشارة محدودة من الإجابات" : "درجة غير متاحة"/)
  assert.match(source, /score !== null \? "إشارة محدودة من الإجابات" : "بيانات غير متاحة لقراءة"/)
  assert.doesNotMatch(source, /بيانات غير كافية/)
  assert.match(finalReveal, /score=\{p4\?\.compatibility_score\}/)
  assert.match(finalReveal, /قراءة ما بين السطور/)
  assert.match(finalReveal, /PairInsightCard result=\{p2\}/)
  assert.match(finalReveal, /PairInsightCard result=\{p3\}/)
  assert.match(finalReveal, /PairInsightCard result=\{p4\}/)
  assert.match(finalReveal, /لا تظهر إجابات أحدكما للآخر، وتبقى طريقة الحساب غير معروضة/)
  assert.doesNotMatch(finalReveal, /تبقى الإجابات وطريقة الحساب مخفية/)
  assert.doesNotMatch(source, /function CompatibilityBreakdown/)
  assert.doesNotMatch(source, /currentBalancedGroupedDimensionsForDisplay/)
  assert.doesNotMatch(finalReveal, /score=\{choiceOnly \? null/)
})

test("optional Event3 reading is authorized and uses only an integrity-checked aggregate pair snapshot", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const start = source.indexOf('if (action === "generate-vibe-analysis")')
  const end = source.indexOf('// ENABLE AUTO-SIGNUP', start)
  const analysis = source.slice(start, end)

  assert.doesNotMatch(analysis, /event3_context === true/)
  assert.match(analysis, /\.select\("assigned_number"\)/)
  assert.match(analysis, /\.from\("event3_matches"\)/)
  assert.match(analysis, /matchingSlot/)
  assert.match(analysis, /participantBreakdownFromScoreSnapshot/)
  assert.match(analysis, /buildEvent3PairInsight/)
  assert.match(analysis, /aggregate_only: true/)
  assert.match(analysis, /EVENT3_ANALYSIS_INSUFFICIENT/)
  const event3BranchStart = analysis.indexOf("const event3AggregateColumns")
  const legacyCacheStart = analysis.indexOf("// 3. Check Cache", event3BranchStart)
  const event3Branch = analysis.slice(event3BranchStart, legacyCacheStart)
  assert.doesNotMatch(event3Branch, /survey_data|interpretProfile|openai\.chat|ai_personality_analysis/)
  assert.match(analysis, /if \(!existingMatch\)[\s\S]*?EVENT3_ANALYSIS_NOT_ALLOWED/)
  assert.ok(
    analysis.indexOf('if (!existingMatch)') < analysis.indexOf('select("assigned_number, survey_data")'),
    "legacy survey answers load only after exact-pair authorization",
  )
  assert.match(analysis, /إجابات محدودة من استبيان تعارف/)
  assert.match(analysis, /ليست حكماً على الشخصين أو على نجاح العلاقة/)
  assert.match(analysis, /اقتراح اختياري لسؤال محادثة/)
  assert.match(analysis, /ممنوع التشخيص النفسي/)
  assert.match(analysis, /ممنوع التنبؤ بالانسجام أو النجاح أو المستقبل/)
  assert.match(analysis, /لا تعرض درجات أو أبعاداً أو تفاصيل خوارزمية/)
  assert.doesNotMatch(analysis, /الذكاء الاصطناعي فاهمني فعلاً/)
})
