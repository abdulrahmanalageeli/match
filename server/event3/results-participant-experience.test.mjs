import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const resultsSource = readFileSync(new URL("../../app/routes/results.tsx", import.meta.url), "utf8")

test("results accordions expose native keyboard and screen-reader semantics", () => {
  assert.match(resultsSource, /<button[\s\S]*?id={`event-results-trigger-/)
  assert.match(resultsSource, /aria-expanded={Boolean\(isEventExpanded\)}/)
  assert.match(resultsSource, /aria-controls={`event-results-panel-/)
  assert.match(resultsSource, /<button[\s\S]*?id={`match-results-trigger-/)
  assert.match(resultsSource, /aria-expanded={Boolean\(isExpanded\)}/)
  assert.match(resultsSource, /role="region"/)
})

test("contact outcome is presented before optional scoring and AI interpretation", () => {
  const contact = resultsSource.indexOf("<ContactOutcomeCard match={match} />")
  const score = resultsSource.indexOf("{/* Compatibility Score */}", contact)
  const ai = resultsSource.indexOf("{/* Optional AI wording", contact)

  assert.ok(contact >= 0)
  assert.ok(score > contact)
  assert.ok(ai > score)
})

test("score presentation is neutral and includes a visible limitation", () => {
  assert.match(resultsSource, /هذه قراءة تقريبية مبنية على إجابات محدودة/)
  assert.match(resultsSource, /لا تقيس قيمة الشخص/)
  assert.match(resultsSource, /from-violet-500 via-fuchsia-400 to-cyan-400/)
  assert.doesNotMatch(resultsSource, /مطابقة مثالية|اكتشف سبب توافقكما الرائع|لماذا تتوافقان بشكل رائع/)
  assert.doesNotMatch(resultsSource, /getOriginalScore\(match\) >=/)
})

test("missing detail distinguishes unavailable evidence from a technical failure", () => {
  assert.doesNotMatch(resultsSource, /score < MINIMUM_DETAILED_SCORE/)
  assert.match(resultsSource, /لا تتوفر تفاصيل كافية لهذه القراءة/)
  assert.match(resultsSource, /غياب التفاصيل لا يعني رفضاً أو حكماً على أي شخص/)
  assert.match(resultsSource, /تعذّر تجهيز القراءة التفصيلية/)
  assert.match(resultsSource, /هذا تأخير تقني/)
})

test("contact language stays factual and does not expose who withheld consent", () => {
  assert.match(resultsSource, /اتفق الاختياران على مشاركة التواصل/)
  assert.match(resultsSource, /لا يكشف Blind Match اختيار أي طرف بعينه/)
  assert.match(resultsSource, /بقيت بيانات التواصل خاصة/)
  assert.doesNotMatch(resultsSource, /رفضك|رفض الطرف|لم يخترْك|لم تخترْك/)
})

test("results loading has a bounded timeout and retry recovery", () => {
  assert.match(resultsSource, /new AbortController\(\)/)
  assert.match(resultsSource, /controller\.abort\(\), 12000/)
  assert.match(resultsSource, /انتهت مهلة تحميل النتائج/)
  assert.match(resultsSource, /إعادة المحاولة/)
})

test("non-meetings render as operational outcomes rather than rejection or consent", () => {
  assert.match(resultsSource, /meeting_status\?: 'met' \| 'did_not_start' \| 'partner_absent' \| 'needed_help'/)
  assert.match(resultsSource, /meeting_occurred\?: boolean \| null/)
  assert.match(resultsSource, /function getNonMeetingOutcome/)
  assert.match(resultsSource, /سُجّل أن اللقاء لم يحدث/)
  assert.match(resultsSource, /هذه حالة تشغيلية للفعالية وليست نتيجة توافق بين شخصين/)
  assert.match(resultsSource, /لم تُفسّر الحالة كتفضيل أو رفض/)
})

test("non-meetings suppress normal contact, score, and AI interpretation", () => {
  assert.match(resultsSource, /const canInterpretMeeting = meetingOutcome === null/)
  assert.match(resultsSource, /meetingOutcome\s*\? <MeetingOperationalOutcomeCard outcome={meetingOutcome} \/>\s*:\s*<ContactOutcomeCard match={match} \/>/)
  assert.match(resultsSource, /canInterpretMeeting && !choiceOnlyMatch && \(\s*<section[^>]+aria-label="القراءة التقريبية للتوافق"/)
  assert.match(resultsSource, /canInterpretMeeting && !choiceOnlyMatch && match\.ai_personality_analysis/)
  assert.doesNotMatch(resultsSource, /canInterpretMeeting && !choiceOnlyMatch && !match\.ai_personality_analysis/)
})
