import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const admin3Url = new URL("../../app/routes/admin3.tsx", import.meta.url)

test("Admin3 invalidates a visible or in-flight seating preview when exclusions change", async () => {
  const source = await readFile(admin3Url, "utf8")
  const revisionStart = source.indexOf("const choiceExclusionsRevision")
  const revisionEnd = source.indexOf("const [testUsersFilter", revisionStart)
  const exclusionActionsStart = source.indexOf("const fetchExclusions")
  const exclusionActionsEnd = source.indexOf("const fetchState", exclusionActionsStart)
  const revision = source.slice(revisionStart, revisionEnd)
  const actions = source.slice(exclusionActionsStart, exclusionActionsEnd)

  assert.ok(revisionStart > 0 && revisionEnd > revisionStart)
  assert.ok(exclusionActionsStart > 0 && exclusionActionsEnd > exclusionActionsStart)
  assert.match(revision, /choiceUiContextKey[^\n]*choiceExclusionsRevision/)
  assert.match(actions, /choicePreviewRequestGeneration\.current \+= 1/)
  assert.match(actions, /setChoiceSeatingPreview\(null\)/)
  assert.equal((actions.match(/if \(!data\.error\) invalidateChoiceSeatingPreview\(\)/g) || []).length, 2)
  assert.equal((actions.match(/await fetchExclusions\(\)/g) || []).length, 2)
})
