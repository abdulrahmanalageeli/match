import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [event3Source, groupsSource, styles] = await Promise.all([
  readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/routes/groups.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/app.css", import.meta.url), "utf8"),
])

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test("each group round opens with a distinct conversation hook", () => {
  const prompts = between(event3Source, "const ICE_BREAKERS", "function seededShuffle")
  const roundTwo = between(prompts, "  2: {", "  3: {")

  assert.match(prompts, /اسمك، ثم أعطنا 3 أشياء تساعدنا نتعرف عليك أكثر — ممنوع تقول عمرك أو وظيفتك/)
  assert.match(prompts, /وش علّمك هذا عن نفسك؟/)
  assert.match(prompts, /وش يخليك ترتاح بسرعة مع الناس؟/)
  assert.doesNotMatch(roundTwo, /شارك 3 أشياء/)
})

test("the ice-breaker makes turn order and handoff unmistakable", () => {
  const iceBreaker = between(event3Source, "function IceBreaker", "// ─── Rock Paper Scissors")

  assert.match(iceBreaker, /AnimatePresence mode="wait"/)
  assert.match(iceBreaker, /role="progressbar"/)
  assert.match(iceBreaker, /السابق/)
  assert.match(iceBreaker, /الدور لـ \{nextSpeaker\.name\}/)
  assert.match(iceBreaker, /خلصنا — نختار النشاط/)
  assert.match(iceBreaker, /if \(all\.length === 0\)/)
  assert.doesNotMatch(iceBreaker, /ابدأ كسر الجليد/)
})

test("the activity deck stays swipeable, readable, and directly selectable", () => {
  const picker = between(groupsSource, "const renderGameSelection", "const renderGameContent")

  assert.match(groupsSource, /energyAr: "(?:هادئ|متوازن|حماسي)"/)
  assert.match(groupsSource, /fitAr:/)
  assert.match(picker, /carouselDirection/)
  assert.match(picker, /drag="x"/)
  assert.match(picker, /mode="popLayout"/)
  assert.match(picker, /grid-cols-8/)
  assert.match(picker, /event3-activity-navigation sticky top-0 z-30/)
  assert.match(picker, /data-event3-activity-arrow="previous"/)
  assert.match(picker, /data-event3-activity-arrow="next"/)
  assert.match(picker, /<span>السابق<\/span>/)
  assert.match(picker, /<span>التالي<\/span>/)
  assert.match(picker, /ابدأوا هذا النشاط/)
  assert.match(picker, /خلّوا الهاتف في المنتصف/)
  assert.match(styles, /\.event3-activity-navigation__button svg\s*\{[\s\S]*color: rgb\(255 255 255\)/)
})

test("group overlays use premium formation and shared motion surfaces", () => {
  const round = between(event3Source, "function RoundScreen", "// ─── Ranking Tutorial Overlay")

  assert.match(round, /key=\{`group-stage-\$\{round\}-\$\{groupActivityStage\}`\}/)
  assert.match(round, /<BinaryPopupFormation/)
  assert.match(round, /key=\{`icebreaker-formation-\$\{round\}`\}[\s\S]*size="container"/)
  assert.match(styles, /\.event3-icebreaker-card\s*\{/)
  assert.match(styles, /\.event3-speaker-orbit::before/)
  assert.match(styles, /\.event3-speaker-orbit--amber/)
  assert.match(styles, /\.event3-activity-card\s*\{/)
  assert.match(styles, /\.event3-activity-play \.modern-activity-card/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})
