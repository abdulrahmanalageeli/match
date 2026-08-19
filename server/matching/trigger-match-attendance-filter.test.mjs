import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const triggerMatchSource = readFileSync(
  new URL("../../api/admin/trigger-match.mjs", import.meta.url),
  "utf8",
)

test("trigger-match excludes declined attendees without excluding active attendees", () => {
  const activeAttendanceFilters = triggerMatchSource.match(
    /\.is\(["']attendance_denied_at["'],\s*null\)/g,
  ) || []
  const invertedAttendanceFilters = triggerMatchSource.match(
    /\.not\(["']attendance_denied_at["'],\s*["']is["'],\s*null\)/g,
  ) || []

  assert.equal(invertedAttendanceFilters.length, 0)
  assert.equal(activeAttendanceFilters.length, 9)
})
