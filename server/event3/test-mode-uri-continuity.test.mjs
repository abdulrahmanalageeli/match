import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const routePath = new URL("../../app/routes/event3.tsx", import.meta.url)

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test("Event3 identity changes remove participant tokens without dropping test access markers", async () => {
  const route = await readFile(routePath, "utf8")
  const logout = between(route, "const handleLogout = useCallback", "const handleUseAnotherNumber")
  const anotherNumber = between(route, "const handleUseAnotherNumber = useCallback", "const fetchState")

  for (const handler of [logout, anotherNumber]) {
    assert.match(handler, /buildEvent3Uri\(window\.location\.search, \{ remove: \["token", "t"\] \}\)/)
    assert.match(handler, /window\.history\.replaceState\(\{\}, "", nextUri\)/)
  }
  assert.match(logout, /window\.location\.replace\(nextUri\)/)
  assert.doesNotMatch(route, /window\.history\.replaceState\(\{\}, "", "\/event3"\)/)
  assert.doesNotMatch(route, /window\.location\.replace\("\/event3"\)/)
})

test("Event3 preview navigation merges into the current URI", async () => {
  const route = await readFile(routePath, "utf8")

  assert.equal(
    (route.match(/href=\{buildEvent3Uri\(searchParams, \{ set: \{ questionPreview:/g) || []).length,
    2,
  )
  assert.doesNotMatch(route, /href=\{`\/event3\?questionPreview=/)
})
