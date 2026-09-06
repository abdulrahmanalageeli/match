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
