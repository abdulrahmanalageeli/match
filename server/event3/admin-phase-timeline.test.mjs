import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const adminRoutePath = new URL("../../app/routes/admin3.tsx", import.meta.url)

test("Admin3 phase timeline remains interactive during unrelated work", async () => {
  const source = await readFile(adminRoutePath, "utf8")
  const start = source.indexOf("{/* Live phase selector")
  const end = source.indexOf("{/* Stats Row */}", start)
  const timeline = source.slice(start, end)

  assert.match(source, /const \[phaseJumpLoading, setPhaseJumpLoading\] = useState<string \| null>\(null\)/)
  assert.match(source, /const jumpToPhase = async \(phase: string\)/)
  assert.match(timeline, /onClick=\{\(\) => jumpToPhase\(phase\.id\)\}/)
  assert.match(timeline, /disabled=\{phaseJumpLoading !== null \|\| loading\?\.startsWith\("phase-"\) === true \|\| idx === currentPhaseIdx\}/)
  assert.doesNotMatch(timeline, /disabled=\{!!loading/)
})

test("Admin3 phase controls allow guarded non-sequential jumps", async () => {
  const source = await readFile(adminRoutePath, "utf8")
  const start = source.indexOf("{/* Phase & Timer Controls */}")
  const end = source.indexOf("{/* Ranking Status Panel", start)
  const controls = source.slice(start, end)

  assert.match(source, /confirmNonSequentialPhaseChange/)
  assert.match(source, /targetPhaseIndex !== currentPhaseIndex \+ 1/)
  assert.match(controls, /onClick=\{\(\) => runPhaseControl\(btn\.label, btn\.action, btn\.enabled === true\)\}/)
  assert.match(controls, /انتقال مباشر · يتطلب تأكيداً/)
  assert.doesNotMatch(controls, /disabled=\{!btn\.enabled/)
})

test("Admin3 keeps live-only organizer actions out of historical and production contexts", async () => {
  const source = await readFile(adminRoutePath, "utf8")

  assert.match(source, /useVisibilityPoll\(fetchSOS, 5000, authenticated && previewEventId == null\)/)
  assert.match(source, /if \(getPreviewEventId\(\) != null\) return\s+const data = await api\("e3-get-sos"\)\s+if \(getPreviewEventId\(\) != null\) return/)
  assert.match(source, /if \(!testMode\) \{ toast\.error\("الترتيب العشوائي متاح في وضع الاختبار فقط"\); return \}/)
  assert.match(source, /const minimumParticipants = CLASSIC_MIN_PARTICIPANTS/)
  assert.match(source, /state\?\.phase !== "setup" \|\| state\?\.seating_generated/)
})
