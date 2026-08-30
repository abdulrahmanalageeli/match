import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { runInNewContext } from "node:vm"

const adminSource = await readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8")

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

const allowlistSource = between(adminSource, "const EVENT3_COHOST_ACTIONS = new Set([", "])")
const cohostActions = new Set([...allowlistSource.matchAll(/"([^"]+)"/g)].map(match => match[1]))
const authClassifiers = between(adminSource, "  const method = req.method", "  if (isCohostLogin) {")

function classifyRequest(method, action) {
  return runInNewContext(`${authClassifiers}\n;({ isCohostLogin, isPublicEventRead, hasCohostSession })`, {
    req: { method, query: { action }, body: {}, headers: { authorization: "Bearer valid-cohost-session" } },
    EVENT3_COHOST_ACTIONS: cohostActions,
    verifyCohostToken: () => true,
  }, { timeout: 100 })
}

test("only POST requests can use the public/co-host auth bypasses", () => {
  const publicActions = [
    "get-event-state",
    "get-upcoming-event-summary",
    "get-current-event-id",
    "get-results-visibility",
    "get-group-matches",
  ]
  const cases = [
    ["e3-cohost-login", "isCohostLogin"],
    ...publicActions.map(action => [action, "isPublicEventRead"]),
    ...[...cohostActions].map(action => [action, "hasCohostSession"]),
  ]

  for (const [action, allowedFlag] of cases) {
    assert.equal(classifyRequest("POST", action)[allowedFlag], true, `${action} remains available through POST`)
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const flags = classifyRequest(method, action)
      assert.equal(Object.values(flags).some(Boolean), false, `${method} ${action} must require admin authorization`)
    }
  }
})

test("the co-host cannot change its own access lock", () => {
  assert.equal(cohostActions.has("e3-set-cohost-lock"), false)
  assert.equal(classifyRequest("POST", "e3-set-cohost-lock").hasCohostSession, false)
  const lockAction = between(adminSource, 'if (action === "e3-set-cohost-lock")', 'if (action === "e3-cohost-save-note")')
  assert.match(lockAction, /if \(!hasAdminAccess\) return res\.status\(403\)/)
  assert.match(lockAction, /await recordSecurityEvent\(req,/)
})

test("a locked co-host cannot log in or reach any allowlisted Event3 action", () => {
  const login = between(adminSource, 'if (action === "e3-cohost-login") {', 'if (action && action.startsWith("e3-"))')
  assert.match(login, /if \(accessState\.cohost_locked === true\) \{\s*return res\.status\(423\)\.json\(\{[^}]*code: "COHOST_LOCKED"/)
  assert.ok(login.indexOf('code: "COHOST_LOCKED"') < login.indexOf("token: signCohostToken()"))

  const eventActions = adminSource.slice(adminSource.indexOf('if (action && action.startsWith("e3-"))'))
  const accessGuard = between(eventActions, "if (isCohostRequest) {", "cohostAccessState = data")
  assert.match(accessGuard, /if \(error \|\| !data\) return res\.status\(503\)/)
  assert.match(accessGuard, /if \(data\.cohost_locked === true\) return res\.status\(423\)\.json\(\{[^}]*code: "COHOST_LOCKED"/)
  const guardEnd = eventActions.indexOf("cohostAccessState = data")
  for (const action of cohostActions) {
    const actionIndex = eventActions.indexOf(`action === "${action}"`)
    assert.ok(actionIndex > guardEnd, `${action} must run after the common fail-closed lock guard`)
  }
})

test("co-host auditing has a real request-security import", () => {
  assert.match(adminSource, /import\s*\{[^}]*\brecordSecurityEvent\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/server\/security\/request-security\.mjs["']/)
})
