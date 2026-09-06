import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const adminApiSource = await readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8")
const admin3Source = await readFile(new URL("../../app/routes/admin3.tsx", import.meta.url), "utf8")
const cohostSource = await readFile(new URL("../../app/routes/admin-cohost.tsx", import.meta.url), "utf8")

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test("all three choice-only one-to-one rounds use the same session-map pair cards", () => {
  assert.match(admin3Source, /const isOneToOneMapRound = mapRound === 20 \|\| \(choiceOnly && \(mapRound === 30 \|\| mapRound === 40\)\)/)
  assert.match(admin3Source, /const oneToOneMapPairs = mapRound === 30 \? phase3Pairs : mapRound === 40 \? phase4Pairs : matchPairs/)

  const sessionMap = between(admin3Source, "{!seating ? (", "{/* TAB: PARTICIPANTS")
  assert.match(sessionMap, /\) : isOneToOneMapRound \? \(/)
  assert.match(sessionMap, /oneToOneMapPairs\.map\(\(pair: any\)/)

  const matchesAction = between(adminApiSource, 'if (action === "e3-get-matches")', 'if (action === "e3-set-ranking")')
  assert.match(matchesAction, /phase3Pairs\.push\(\{[^\n]*aSurvey:[^\n]*rankBInA:[^\n]*rankAInB:[^\n]*matchType:/)
  assert.match(matchesAction, /phase4Pairs\.push\(\{[\s\S]*?aSurvey:[\s\S]*?rankBInA:[\s\S]*?rankAInB:[\s\S]*?matchType:/)
})

test("admin and co-host leader reads are session-scoped and expose only elected coordinator details", () => {
  const seatingAction = between(adminApiSource, 'if (action === "e3-get-seating")', 'if (action === "e3-toggle-score-reveal")')
  assert.match(seatingAction, /from\("event3_group_coordination"\)/)
  assert.match(seatingAction, /\.eq\("session_key", coordinationSessionKey\)/)
  assert.doesNotMatch(seatingAction, /event3_group_coordinator_votes/)
  assert.match(seatingAction, /row\.election_status === "elected"/)
  assert.match(seatingAction, /group_leaders: groupLeaders/)

  const cohostDashboard = between(adminApiSource, 'if (action === "e3-cohost-dashboard")', 'if (action === "e3-cohost-rankings")')
  assert.match(cohostDashboard, /const coordinationSessionKey = testModeActive \? `test:/)
  assert.match(cohostDashboard, /from\("event3_group_coordination"\)/)
  assert.match(cohostDashboard, /group_leaders: groupLeaders/)
  assert.doesNotMatch(cohostDashboard, /event3_group_coordinator_votes/)

  assert.match(admin3Source, /قائد المجموعة:/)
  assert.match(cohostSource, /group_leaders\?: CohostGroupLeader\[\]/)
  assert.match(cohostSource, /قائد المجموعة:/)
})
