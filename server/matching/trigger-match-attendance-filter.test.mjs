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

  const possibleMatchesStart = triggerMatchSource.indexOf("if (viewAllMatches) {")
  const possibleMatchesEnd = triggerMatchSource.indexOf("// Handle manual match creation", possibleMatchesStart)
  assert.notEqual(possibleMatchesStart, -1)
  assert.notEqual(possibleMatchesEnd, -1)
  const possibleMatchesBlock = triggerMatchSource.slice(possibleMatchesStart, possibleMatchesEnd)
  assert.doesNotMatch(possibleMatchesBlock, /\.is\(["']attendance_denied_at["'],\s*null\)/)
  assert.match(possibleMatchesBlock, /attendanceAllowedB:\s*!potentialMatch\.attendance_denied_at/)
})
