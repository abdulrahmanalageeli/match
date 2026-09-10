import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const route = await readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8")

test("ranking drag stays vertical and captures touch input", () => {
  assert.match(route, /drag=\{disabled \? false : "y"\}/)
  assert.match(route, /onPointerDown=\{startDrag\}[\s\S]*?style=\{\{ touchAction: "none" \}\}/)
})

test("ranking reorder measurements include the page scroll offset", () => {
  assert.match(
    route,
    /<motion\.div ref=\{eventContentRef\} layoutScroll className="event3-scroll relative min-h-0 flex-1 overflow-y-auto">/,
  )
})

test("dragged ranking cards establish a stacking context", () => {
  assert.match(route, /whileDrag=\{submitted \? undefined : \{[\s\S]*?zIndex: 50/)
})

test("successful ranking submission opens feedback for the completed group round", () => {
  const submitStart = route.indexOf("  const submit = async () => {")
  const submitEnd = route.indexOf("  const personMap", submitStart)
  assert.notEqual(submitStart, -1, "ranking submit handler exists")
  assert.notEqual(submitEnd, -1, "ranking submit handler has a boundary")
  const submitHandler = route.slice(submitStart, submitEnd)
  assert.match(
    submitHandler,
    /if \(d\.error\)[\s\S]*?onRankingResolved\(completedRounds\)\s+onOpenGroupFeedback\(completedRounds as Event3GroupRound\)/,
  )
})

test("ranking retains the established full-order initialization behavior", () => {
  assert.match(route, /setOrder\(d\.draft_order \|\| \[\.\.\.ranked\.map\(p => p\.number\), \.\.\.fresh\.map\(p => p\.number\)\]\)/)
  assert.doesNotMatch(route, /notMetNumbers|not_met_numbers|not_met_supported/)
  assert.doesNotMatch(route, /markAsNotMet|restoreToRanking|لم أحضر \/ لم أتحدث معه/)
})

test("draft, expiry, and manual ranking writes preserve baseline full-order semantics", () => {
  assert.match(route, /e3-save-ranking-draft[\s\S]*?ranked_list: order, completed_rounds:/)
  assert.match(route, /e3-submit-ranking[\s\S]*?ranked_list: orderRef\.current, auto_saved: true/)
  assert.match(route, /e3-submit-ranking[\s\S]*?ranked_list: order, completed_rounds:/)
  assert.doesNotMatch(route, /hasRankingIntent|rankingSkipped|rankingPartitionValid/)
})

test("ranking copy explains the baseline automatic expiry save", () => {
  assert.match(route, /سيُحفظ الترتيب الظاهر تلقائياً عند انتهاء الوقت/)
  assert.match(route, /مسودتك محفوظة — سيُعتمد الترتيب الظاهر عند انتهاء الوقت/)
  assert.match(route, /يُحفظ تلقائياً عند انتهاء الوقت/)
  assert.match(route, /إذا لم ترسل ترتيبك سيُحفظ تلقائياً ويُقفل/)
})
