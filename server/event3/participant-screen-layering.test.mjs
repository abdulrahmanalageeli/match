import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [event3Source, groupsSource] = await Promise.all([
  readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/routes/groups.tsx", import.meta.url), "utf8"),
])

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test("participant prompts use one root priority policy and never interrupt active work", () => {
  const root = between(event3Source, "export default function Event3Page", "return (\n    <MotionConfig reducedMotion=\"user\">")
  assert.match(event3Source, /resolveEvent3PromptVisibility/)
  assert.match(root, /const interactionOverlayOpen = Boolean\(/)
  for (const state of [
    "rankingRoundToRender",
    "groupsOpen",
    "projectorOpen",
    "finalQuestionsOpen",
    "feedbackOverlayOpen",
    "oneToOneSessionOpen",
    "phaseTransition",
  ]) assert.match(root, new RegExp(`\\b${state}\\b`))
  assert.doesNotMatch(root, /isActiveMoodMoment/)
})

test("urgent alerts are the only layer allowed above participant dialogs", () => {
  const notification = between(event3Source, "function NotificationModal", "// ─── Mood Check Modal")
  assert.match(notification, /isUrgent \? "z-\[800\]" : "z-\[600\]"/)
})

test("table broadcasts are opt-in and only open when content exists", () => {
  const round = between(event3Source, "function RoundScreen", "// ─── Ranking Tutorial Overlay")
  assert.match(round, /const \[syncEnabled, setSyncEnabled\] = useState\(false\)/)
  assert.match(round, /const projectorVisible =[\s\S]*Boolean\(coordination\.active_content\)[\s\S]*&& syncEnabled/)
  assert.match(round, /const returnToBroadcastVisible =[\s\S]*Boolean\(coordination\.active_content\)[\s\S]*&& !syncEnabled/)
  assert.match(round, /if \(!coordination\?\.active_content\) setSyncEnabled\(false\)/)
  assert.match(groupsSource, /عرض المنسّق عند الطلب/)
  assert.doesNotMatch(groupsSource, /اختيارك سيظهر فوراً على شاشات الجميع/)
})

test("automatic reminders and ranking actions stay in flow instead of covering content", () => {
  const round = between(event3Source, "function RoundScreen", "// ─── Ranking Tutorial Overlay")
  const ranking = between(event3Source, "function RankingScreen", "// ─── Optional Group Reflection")
  assert.match(round, /role="status"[\s\S]*تذكير خفيف: خلّوا الجميع يأخذ فرصته/)
  assert.doesNotMatch(round, /z-\[520\]/)
  assert.match(ranking, /className="flex min-h-0 flex-col overflow-hidden"/)
  assert.match(ranking, /event3-scroll min-h-0 flex-1 overflow-y-auto/)
  assert.match(ranking, /Non-overlapping submit footer/)
  assert.doesNotMatch(ranking, /fixed inset-x-0 bottom-0 z-40/)
})

test("the mobile QA hub uses direct previews instead of blocked iframes", () => {
  const preview = between(event3Source, 'if (questionPreview === "mobileQA")', 'if (questionPreview === "welcome")')
  assert.match(preview, /EVENT3_QA_PREVIEWS\.map/)
  assert.doesNotMatch(preview, /<iframe/)
})
