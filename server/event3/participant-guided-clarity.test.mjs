import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const route = await readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8")

function between(startMarker, endMarker) {
  const start = route.indexOf(startMarker)
  const end = route.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return route.slice(start, end)
}

test("shared Event3 guidance presents one instruction with compact progress", () => {
  const guide = between("function JourneyCue", "function MeetingPass")
  assert.match(guide, /event3-guide/)
  assert.match(guide, /steps\[safeStep\]/)
  assert.match(guide, /className="sr-only" aria-label="خطوات هذه المرحلة"/)
  assert.doesNotMatch(guide, /grid grid-cols-3/)
})

test("participant login shows one method at a time with a plain fallback", () => {
  const login = between("function PhoneEntry", "function SetupScreen")
  assert.match(login, /استخدام رمز الدخول بدلاً من الرسالة/)
  assert.match(login, /الدخول برقم الجوال/)
  assert.doesNotMatch(login, /aria-label="طريقة تسجيل الدخول"/)
})

test("waiting screen keeps optional information and personalized welcome collapsed", () => {
  const setup = between("function SetupScreen", "// ─── One-popup reminder")
  assert.match(setup, /معلومات إضافية/)
  assert.match(setup, /onOpenWelcomeMessage/)
  assert.match(setup, /ستنتقل الشاشة تلقائياً/)

  const welcomeDone = between("const handleWelcomeDone", "useEffect(() => {\n    if (!showAiWelcome")
  assert.doesNotMatch(welcomeDone, /setShowAiWelcome\(true\)/)
})

test("ranking uses explicit controls and hides routine sync chatter", () => {
  const ranking = between("function RankingScreen", "// ─── Optional Group Reflection")
  assert.match(ranking, /ضع مَن تفضّله في المركز الأول/)
  assert.match(ranking, /aria-label=\{`\$\{notes\[num\]/)
  assert.match(ranking, /draftSync !== "error".*className="sr-only"/s)
  assert.doesNotMatch(ranking, /سنكوّن ثلاثة لقاءات متبادلة مع أشخاص مختلفين؛/)
})

test("break and final result screens keep secondary content behind disclosure", () => {
  const breakScreen = between("function BreakScreen", "// ─── Final Reveal Screen")
  assert.match(breakScreen, /ماذا سيحدث بعد الاستراحة؟/)
  assert.match(breakScreen, /event3-secondary-details/)
  assert.doesNotMatch(breakScreen, /INTERMISSION · RESET/)

  const finalReveal = between("function FinalRevealScreen", "// ─── AI Welcome Popup")
  const primaryAction = finalReveal.indexOf("فتح النتائج والتواصل")
  const firstDisclosure = finalReveal.indexOf("event3-secondary-details")
  assert.ok(primaryAction > -1 && firstDisclosure > primaryAction, "results must be the first post-reveal action")
  assert.match(finalReveal, /قراءة ما بين السطور/)
  assert.match(finalReveal, /خيارات إضافية/)
})

test("one-to-one feedback keeps optional writing out of the required path", () => {
  const feedback = between("function FeedbackFlow", "// ─── SOS / Organizer Chat Box")
  assert.match(feedback, /كم كان التوافق الفكري؟/)
  assert.match(feedback, /إضافات اختيارية/)
  assert.match(feedback, /تظهر معلومات التواصل فقط إذا وافقتما معاً/)
})
