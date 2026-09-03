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
  assert.match(route, /className=\{`relative rounded-xl border transition-colors \$\{accent\}/)
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
