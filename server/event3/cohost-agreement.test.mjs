import assert from "node:assert/strict"
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { runInNewContext } from "node:vm"
import { PGlite } from "@electric-sql/pglite"
import { COHOST_AGREEMENT } from "../../app/lib/cohost-agreement.mjs"
import { acceptCohostAgreement, COHOST_AGREEMENT_ACTIONS, COHOST_AGREEMENT_HASH, COHOST_AGREEMENT_TEXT, hasCurrentCohostAgreement } from "./cohost-agreement.mjs"

const source = await readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8")
const tokenFunctions = source.slice(source.indexOf("function safeSecretEqual("), source.indexOf("function e3GenerateSeatingPlan("))
const tokens = runInNewContext(`${tokenFunctions}\n;({signCohostToken, readCohostToken, verifyCohostToken})`, {
  Buffer, createHmac, randomUUID, timingSafeEqual, EVENT3_COHOST_TOKEN_TTL_SECONDS: 8 * 60 * 60,
  process: { env: { ADMIN_SESSION_SECRET: "test-only-signing-secret" } },
})
const receipt = { id: randomUUID(), full_name: "اسم تجريبي", agreement_version: COHOST_AGREEMENT.version, agreement_hash: COHOST_AGREEMENT_HASH, accepted_at: new Date().toISOString() }
const input = () => ({ accepted: true, full_name: "  اسم   تجريبي  ", version: COHOST_AGREEMENT.version, agreement_hash: COHOST_AGREEMENT_HASH })

function database({ readError = null, insertError = null } = {}) {
  const rows = []
  return { rows, from(table) {
    assert.equal(table, "event3_cohost_agreements")
    let values, filters = {}
    return {
      select() { return this },
      eq(key, value) { filters[key] = value; return this },
      insert(row) { values = row; return this },
      async maybeSingle() { return { data: rows.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) || null, error: readError } },
      async single() {
        if (insertError) return { data: null, error: insertError }
        const row = { id: randomUUID(), accepted_at: new Date().toISOString(), ...values }
        rows.push(row)
        return { data: row, error: null }
      },
    }
  } }
}

test("unsigned, edited, old-version and expired claims never grant agreement access", () => {
  const pending = tokens.signCohostToken()
  assert.equal(tokens.verifyCohostToken(pending), true)
  assert.equal(hasCurrentCohostAgreement(tokens.readCohostToken(pending)), false)
  assert.notEqual(pending, tokens.signCohostToken(), "each login has a separate session")
  const claims = tokens.readCohostToken(pending)
  const accepted = tokens.signCohostToken(receipt, claims)
  assert.equal(hasCurrentCohostAgreement(tokens.readCohostToken(accepted)), true)
  assert.equal(tokens.readCohostToken(accepted).exp, claims.exp, "accepting does not extend the session")
  const [, signature] = pending.split(".")
  const forgedPayload = Buffer.from(JSON.stringify(tokens.readCohostToken(accepted))).toString("base64url")
  assert.equal(tokens.verifyCohostToken(`${forgedPayload}.${signature}`), false)
  assert.equal(tokens.verifyCohostToken(tokens.signCohostToken(receipt, { exp: 1 })), false)
  assert.equal(hasCurrentCohostAgreement(tokens.readCohostToken(tokens.signCohostToken({ ...receipt, agreement_hash: "old" }))), false)
})

test("every co-host data action is denied before agreement acceptance, including old sessions", async () => {
  const actions = [...source.slice(source.indexOf("const EVENT3_COHOST_ACTIONS"), source.indexOf("function getEvent3ActiveTableRound")).matchAll(/"(e3-[^"]+)"/g)].map(match => match[1])
  const guard = source.slice(source.indexOf("const cohostSessionToken ="), source.indexOf("// Helper: fetch current event_id"))
  for (const action of actions) {
    const response = { statusCode: null, body: null, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
    if (COHOST_AGREEMENT_ACTIONS.has(action)) continue
    await runInNewContext(`(async () => { ${guard}; throw new Error("Data handler reached before consent") })()`, {
      action, res: response, req: { body: {} }, bearerToken: "legacy-session", hasCohostAccess: true, isCohostRequest: true,
      readCohostToken: () => ({ role: "event3_cohost", exp: 9999999999 }), COHOST_AGREEMENT_ACTIONS, hasCurrentCohostAgreement,
    })
    assert.equal(response.statusCode, 403, action)
    assert.equal(response.body.code, "COHOST_AGREEMENT_REQUIRED", action)
  }
})

test("a checked box, current terms and a full name are all required before any record write", async () => {
  const db = database()
  for (const changed of [{ accepted: false }, { accepted: "true" }, { version: "old" }, { agreement_hash: "wrong" }, { full_name: "" }, { full_name: "Name" }, { full_name: "<script> attack" }]) {
    await assert.rejects(acceptCohostAgreement(db, "test-session", { ...input(), ...changed }))
  }
  assert.equal(db.rows.length, 0)
})

test("acceptance stores exact terms and a hashed session, and retrying preserves the original receipt", async () => {
  const db = database()
  const first = await acceptCohostAgreement(db, "test-session", input())
  const second = await acceptCohostAgreement(db, "test-session", input())
  assert.equal(first.id, second.id)
  assert.equal(first.accepted_at, second.accepted_at)
  assert.equal(db.rows.length, 1)
  assert.equal(first.full_name, "اسم تجريبي")
  assert.equal(first.agreement_text, COHOST_AGREEMENT_TEXT)
  assert.match(first.session_hash, /^[0-9a-f]{64}$/)
  assert.doesNotMatch(JSON.stringify(db.rows), /test-session/)
  await assert.rejects(acceptCohostAgreement(db, "test-session", { ...input(), full_name: "شخص آخر" }), { code: "AGREEMENT_NAME_CONFLICT" })
})

test("read and write failures fail closed instead of claiming acceptance", async () => {
  for (const db of [database({ readError: { message: "offline" } }), database({ insertError: { message: "offline" } })]) {
    await assert.rejects(acceptCohostAgreement(db, "session", input()), { status: 503, code: "AGREEMENT_RECORD_UNAVAILABLE" })
    assert.equal(db.rows.length, 0)
  }
})

test("acceptance records are private and append-only with a database timestamp", async () => {
  const db = new PGlite()
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;")
    await db.exec(await readFile(new URL("../../supabase/migrations/20260830115210_event3_cohost_confidentiality_acceptance.sql", import.meta.url), "utf8"))
    const write = () => db.query("insert into event3_cohost_agreements(session_hash, full_name, agreement_version, agreement_hash, agreement_text) values ($1,$2,$3,$4,$5) returning id, accepted_at", ["a".repeat(64), "اسم تجريبي", COHOST_AGREEMENT.version, COHOST_AGREEMENT_HASH, COHOST_AGREEMENT_TEXT])
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query("select * from event3_cohost_agreements"))
      await assert.rejects(write())
      await db.exec("reset role")
    }
    await db.exec("set role service_role")
    // Supabase service_role bypasses RLS; reproduce that attribute for this fixture.
    await db.exec("reset role; alter role service_role bypassrls; set role service_role")
    const saved = (await write()).rows[0]
    assert.ok(saved.id && saved.accepted_at)
    assert.equal((await db.query("select count(*)::int as count from event3_cohost_agreements")).rows[0].count, 1)
    await assert.rejects(write(), /duplicate key/)
    await assert.rejects(db.query("update event3_cohost_agreements set full_name = 'Different Person'"), /permission denied/)
    await assert.rejects(db.query("delete from event3_cohost_agreements"), /permission denied/)
  } finally { await db.close() }
})
