import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [route, styles] = await Promise.all([
  readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../app/app.css", import.meta.url), "utf8"),
])

function between(startMarker, endMarker) {
  const start = route.indexOf(startMarker)
  const end = route.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return route.slice(start, end)
}

test("binary popup formation is finite, deterministic, decorative, and motion-safe", () => {
  const formation = between("function BinaryPopupFormation", "type JourneyAccent")
  assert.match(route, /const BINARY_POPUP_STREAMS = \[/)
  assert.match(formation, /data-event3-binary-formation=\{tone\}/)
  assert.match(formation, /pointer-events-none/)
  assert.match(formation, /aria-hidden="true"/)
  assert.match(formation, /if \(reduceMotion\) return null/)
  assert.match(formation, /BINARY_POPUP_STREAMS\.map/)
  assert.doesNotMatch(formation, /Math\.random/)
  assert.doesNotMatch(formation, /repeat:\s*Infinity/)
  assert.match(formation, /animate=\{\{ opacity: \[0, 1, 0\.72, 0\]/)
  assert.doesNotMatch(formation, /opacity: \[0, 1, 0\.28\]/)
  assert.doesNotMatch(formation, /opacity: \[0, 1, 0\.24\]/)
  assert.doesNotMatch(formation, /rounded-full/)
  assert.match(styles, /\.event3-binary-formation\s*\{[\s\S]*contain: strict/)
  assert.match(styles, /\.event3-binary-formation__code\s*\{[\s\S]*text-shadow:/)
})

test("AI welcome, notifications, and mood checks resolve through the shared binary assembly", () => {
  const aiWelcome = between("function AiWelcomePopup", "function NotEnrolledScreen")
  const notification = between("function NotificationModal", "// ─── Mood Check Modal")
  const mood = between("function MoodCheckModal", "// ─── Root Component")

  assert.match(aiWelcome, /<BinaryPopupFormation tone="violet" size="tall" \/>/)
  assert.match(notification, /<BinaryPopupFormation key=\{notif\.notif_id\} tone=\{binaryTone\} urgent=\{isUrgent\} \/>/)
  assert.match(mood, /<BinaryPopupFormation key=\{pendingCheck\.check_id\} tone="violet" \/>/)

  for (const popup of [aiWelcome, notification, mood]) {
    assert.match(popup, /clipPath: "inset\(48|clipPath: "inset\(49/)
    assert.match(popup, /reduceMotion \? false/)
  }
  assert.match(notification, /delay: isUrgent \? 0\.08 : 0\.26/)
})
