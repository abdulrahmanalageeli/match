import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const event3Source = await readFile(new URL("../../app/routes/event3.tsx", import.meta.url), "utf8")

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test("the organizer help dialog stays above Event3 overlays and always has close paths", () => {
  const support = between(event3Source, "function SOSButton(", "// ─── Phase 2 Reveal Screen")

  assert.match(support, /fixed inset-0 z-\[700\]/)
  assert.match(support, /onClick=\{\(\) => setOpen\(false\)\}/)
  assert.match(support, /onClick=\{event => event\.stopPropagation\(\)\}/)
  assert.match(support, /aria-modal="true"/)
  assert.match(support, /event\.key === 'Escape'\) setOpen\(false\)/)
  assert.match(support, /aria-label="إغلاق محادثة المنظم"/)
  assert.doesNotMatch(support, /fixed inset-x-0 z-\[300\]/)
  assert.doesNotMatch(support, /z-\[580\][^\n]*shrink-0 items-center/)
  assert.match(support, /if \(suppressed\) setOpen\(false\)/)
})
