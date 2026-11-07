import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore, SKU, BUNDLE, CONSENT_VERSION } from "../domain.mjs";
import { createService } from "../server.mjs";

const stores = [];
function memory() {
  const store = openStore(":memory:");
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const s of stores.splice(0)) s.db.close();
});
async function applicant(store, gender = "woman") {
  const form = {
    email: randomUUID() + "@example.test",
    password: "correct-long-password",
  };
  const { state, token } = await store.register(form);
  const id = state.user.id;
  const profile = {
    displayName: "اسم تجريبي",
    age: 29,
    gender,
    city: "الرياض",
    profession: "مختص",
    bio: "أفضل التواصل بوضوح.",
    contact: form.email,
    consentVersion: CONSENT_VERSION,
  };
  store.apply(id, profile);
  return { id, token, form, profile, accountToken: state.user.appAccountToken };
}
function receipt(u, patch = {}) {
  return {
    bundleId: BUNDLE,
    productId: SKU,
    appAccountToken: u.accountToken,
    originalTransactionId: u.id,
    transactionId: u.id,
    signedDate: Date.now(),
    expiresDate: Date.now() + 86_400_000,
    ...patch,
  };
}
function admit(store, u) {
  store.approve(u.id);
  store.recordReceipt(receipt(u), u.id);
}

test("private proposal and contact are visible only to their participants after reciprocal acceptance", async () => {
  const s = memory(),
    a = await applicant(s),
    b = await applicant(s, "man"),
    outsider = await applicant(s);
  s.approve(a.id);
  s.approve(b.id);
  assert.throws(() => s.assign(a.id, b.id), { status: 409 });
  s.recordReceipt(receipt(a), a.id);
  s.recordReceipt(receipt(b), b.id);
  const id = s.assign(a.id, b.id);
  assert.equal(s.state(a.id).introduction.contact, null);
  assert.equal(s.state(outsider.id).introduction, null);
  assert.throws(() => s.respond(outsider.id, { id, decision: "accept" }), {
    status: 404,
  });
  assert.throws(() => s.assign(a.id, b.id), { status: 409 });
  const one = s.respond(a.id, { id, decision: "accept" });
  assert.equal(one.introduction.status, "waiting");
  assert.equal(s.state(b.id).introduction.status, "proposed");
  assert.equal(s.state(b.id).introduction.person.contact, undefined);
  const mutual = s.respond(b.id, { id, decision: "accept" });
  assert.equal(mutual.introduction.contact, a.form.email);
  assert.equal(s.state(a.id).introduction.contact, b.form.email);
  s.respond(b.id, { id, decision: "report", reason: "طلب مراجعة" });
  s.respond(b.id, { id, decision: "report", reason: "طلب مراجعة" });
  assert.equal(s.state(a.id).introduction, null);
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM reports").get().n, 1);
  assert.throws(() => s.respond(a.id, { id, decision: "accept" }), {
    status: 409,
  });
  assert.throws(() => s.assign(a.id, b.id), { status: 409 });
});
test("paid access opens only for an available reciprocal pool and a purchase survives a later supply change", async () => {
  const s = memory(),
    a = await applicant(s),
    b = await applicant(s, "man");
  s.approve(a.id);
  assert.equal(s.state(a.id).membership.canStart, false);
  s.apply(b.id, { ...b.profile, city: "جدة" });
  s.approve(b.id);
  assert.equal(s.state(a.id).membership.canStart, false);
  s.apply(b.id, { ...b.profile, preferredMinAge: 40 });
  s.approve(b.id);
  assert.equal(s.state(a.id).membership.canStart, false);
  s.apply(b.id, b.profile);
  s.approve(b.id);
  assert.equal(s.state(a.id).membership.canStart, true);
  assert.equal(s.state(b.id).membership.canStart, true);
  assert.equal(s.state(a.id).introduction, null);
  s.pause(b.id, true);
  assert.equal(s.state(a.id).membership.canStart, false);
  assert.equal(s.state(b.id).membership.canStart, false);
  const purchase = s.recordReceipt(receipt(a), a.id);
  assert.equal(purchase.membership.active, true);
  assert.equal(purchase.introduction, null);
  s.pause(b.id, false);
  s.recordReceipt(receipt(b), b.id);
  const c = await applicant(s);
  s.approve(c.id);
  assert.equal(s.state(c.id).membership.canStart, true);
  const id = s.assign(a.id, b.id);
  assert.equal(s.state(c.id).membership.canStart, false);
  s.respond(b.id, { id, decision: "pass" });
  s.recordNotification(
    receipt(a, { signedDate: Date.now() + 1000, revocationDate: Date.now() }),
  );
  assert.equal(
    s.state(a.id).membership.canStart,
    false,
    "a previously paired counterparty is ineligible",
  );
  assert.equal(s.state(c.id).membership.canStart, true);
});
test("expired, revoked, mismatched and replayed subscriptions cannot release private data", async () => {
  const s = memory(),
    a = await applicant(s),
    b = await applicant(s, "man");
  admit(s, a);
  admit(s, b);
  const id = s.assign(a.id, b.id);
  const original = receipt(a, { signedDate: Date.now() + 50 });
  s.recordReceipt(original, a.id);
  s.recordNotification({
    ...original,
    revocationDate: Date.now(),
    signedDate: original.signedDate + 1,
  });
  s.recordReceipt(original, a.id);
  assert.equal(s.state(a.id).membership.active, false);
  assert.equal(s.state(b.id).introduction, null);
  assert.throws(() => s.respond(b.id, { id, decision: "accept" }), {
    status: 409,
  });
  assert.throws(() => s.recordReceipt(original, b.id), { status: 403 });
  assert.throws(
    () =>
      s.recordReceipt({ ...original, appAccountToken: b.accountToken }, b.id),
    { status: 403 },
  );
  assert.throws(
    () => s.recordReceipt({ ...original, productId: "different" }, a.id),
    { status: 403 },
  );
  s.recordReceipt(
    receipt(b, { signedDate: Date.now() + 100, expiresDate: Date.now() - 2 }),
    b.id,
  );
  assert.equal(s.state(b.id).membership.active, false);
});
test("profile edits preserve approval for an identical resubmission and close mutual introductions before re-review", async () => {
  const s = memory(),
    a = await applicant(s),
    b = await applicant(s, "man");
  admit(s, a);
  admit(s, b);
  const id = s.assign(a.id, b.id);
  s.respond(a.id, { id, decision: "accept" });
  s.respond(b.id, { id, decision: "accept" });
  const same = s.apply(a.id, {
    ...a.profile,
    displayName: "  " + a.profile.displayName + " ",
  });
  assert.equal(
    s.db
      .prepare(
        "SELECT COUNT(*) AS n FROM application_consents WHERE user_id=? AND version=?",
      )
      .get(a.id, CONSENT_VERSION).n,
    2,
  );
  assert.equal(same.profile.consentVersion, undefined);
  assert.equal(same.user.applicationStatus, "approved");
  assert.equal(same.introduction.contact, b.form.email);
  const edited = s.apply(a.id, { ...a.profile, contact: "new@example.test" });
  assert.equal(edited.user.applicationStatus, "pending");
  assert.equal(edited.membership.active, true);
  assert.equal(edited.introduction, null);
  assert.equal(s.state(b.id).introduction, null);
  assert.throws(() => s.respond(b.id, { id, decision: "accept" }), {
    status: 409,
  });
  s.approve(a.id);
  assert.equal(s.state(a.id).introduction, null);
  assert.equal(s.state(b.id).introduction, null);
});
test("operator CLI reads actual reports, suspends a member, resolves reports, and closes separate pairs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "intro-operator-"));
  const db = join(dir, "test.sqlite"),
    store = openStore(db);
  function admin(...args) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../admin.mjs", import.meta.url)), ...args],
      {
        encoding: "utf8",
        env: { ...process.env, MARRIAGE_DB: db },
        windowsHide: true,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }
  try {
    const a = await applicant(store),
      b = await applicant(store, "man"),
      c = await applicant(store, "man");
    admit(store, a);
    admit(store, b);
    admit(store, c);
    const unpaid = await applicant(store, "man");
    store.approve(unpaid.id);
    const ready = admin("ready"),
      candidates = admin("candidates", a.form.email);
    assert.ok(ready.includes(a.form.email) && ready.includes(b.form.email));
    assert.ok(
      candidates.includes(b.form.email) && candidates.includes(c.form.email),
    );
    assert.ok(
      !candidates.includes(a.form.email) &&
        !candidates.includes(unpaid.form.email),
    );
    const first = store.assign(a.id, b.id);
    assert.ok(!admin("ready").includes(a.form.email));
    assert.ok(!admin("candidates", a.form.email).includes(c.form.email));
    store.respond(a.id, { id: first, decision: "report", reason: "اختبار" });
    const { id: reportId } = store.db.prepare("SELECT id FROM reports").get();
    assert.ok(admin("reports").includes(reportId));
    admin("suspend", b.form.email);
    assert.equal(store.state(b.id).user.applicationStatus, "pending");
    admin("resolve", reportId);
    assert.ok(!admin("reports").includes(reportId));
    const next = store.assign(a.id, c.id);
    admin("close", next);
    assert.equal(store.state(c.id).introduction, null);
  } finally {
    store.db.close();
    for (const suffix of ["", "-shm", "-wal"])
      rmSync(db + suffix, { force: true });
    rmdirSync(dir);
  }
});
test("upgrade reopens profiles without evidence and preserves purchased subscriptions until fresh application review", async () => {
  const dir = mkdtempSync(join(tmpdir(), "intro-consent-"));
  const path = join(dir, "old.sqlite");
  let s = openStore(path);
  try {
    const a = await applicant(s),
      b = await applicant(s, "man");
    admit(s, a);
    admit(s, b);
    const id = s.assign(a.id, b.id);
    s.db.exec("DROP TABLE application_consents; PRAGMA user_version=0");
    s.db.close();
    s = openStore(path);
    assert.equal(s.state(a.id).user.applicationStatus, "draft");
    assert.equal(s.state(a.id).membership.active, true);
    assert.equal(
      s.db.prepare("SELECT closed FROM introductions WHERE id=?").get(id)
        .closed,
      1,
    );
    assert.throws(() => s.approve(a.id), { status: 409 });
    assert.equal(s.apply(a.id, a.profile).user.applicationStatus, "pending");
    s.approve(a.id);
    assert.equal(s.state(a.id).membership.active, true);
  } finally {
    s.db.close();
    for (const suffix of ["", "-shm", "-wal"])
      rmSync(path + suffix, { force: true });
    rmdirSync(dir);
  }
});
test("adult approval and mutual age and city preferences are enforced; pause and delete withdraw access", async () => {
  const s = memory(),
    a = await applicant(s),
    b = await applicant(s, "man");
  assert.throws(() => s.apply(a.id, { ...a.profile, age: 17 }), {
    status: 400,
  });
  s.apply(a.id, { ...a.profile, preferredMinAge: 35 });
  admit(s, a);
  admit(s, b);
  assert.throws(() => s.assign(a.id, b.id), { status: 409 });
  const c = await applicant(s);
  admit(s, c);
  const id = s.assign(c.id, b.id);
  s.pause(c.id, true);
  assert.equal(s.state(b.id).introduction, null);
  assert.throws(() => s.respond(b.id, { id, decision: "accept" }), {
    status: 409,
  });
  s.remove(c.id);
  assert.throws(() => s.authenticate(c.token), { status: 401 });
  assert.equal(
    s.db.prepare("SELECT COUNT(*) AS n FROM introductions WHERE id=?").get(id)
      .n,
    0,
  );
});
test("HTTP authentication, waitlist submission and membership boundary reject forged grants", async () => {
  const s = memory(),
    server = createService(s);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  async function request(path, method = "GET", body, token) {
    return fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  try {
    assert.equal((await request("/me")).status, 401);
    const form = {
      email: "test@example.test",
      password: "correct-long-password",
    };
    const created = await request("/register", "POST", form);
    assert.equal(created.status, 201);
    const { token, state } = await created.json();
    assert.equal(state.user.applicationStatus, "draft");
    assert.equal(
      (
        await request("/login", "POST", {
          ...form,
          password: "wrong-long-password",
        })
      ).status,
      401,
    );
    const profile = {
      displayName: "مشاركة",
      age: 27,
      gender: "woman",
      city: "الرياض",
      profession: "مصممة",
      bio: "أحب النقاش.",
      contact: "example@example.test",
      approved: true,
      membership: { active: true },
    };
    const start = Date.now();
    assert.equal(
      (await request("/application", "PUT", profile, token)).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/application",
          "PUT",
          { ...profile, consentVersion: "old" },
          token,
        )
      ).status,
      400,
    );
    assert.equal(s.state(state.user.id).user.applicationStatus, "draft");
    const pending = await (
      await request(
        "/application",
        "PUT",
        { ...profile, consentVersion: CONSENT_VERSION, receivedAt: 0 },
        token,
      )
    ).json();
    const recorded = s.db
      .prepare(
        "SELECT version,received_at FROM application_consents WHERE user_id=?",
      )
      .all(state.user.id);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].version, CONSENT_VERSION);
    assert.ok(recorded[0].received_at >= start);
    assert.equal(pending.user.applicationStatus, "pending");
    assert.equal(pending.membership.active, false);
    const fake = await request(
      "/membership",
      "POST",
      { signedTransaction: "ey.fake.signature" },
      token,
    );
    assert.ok([400, 403, 503].includes(fake.status));
    assert.equal(s.state(state.user.id).membership.active, false);
    const logged = await (await request("/login", "POST", form)).json();
    assert.equal(
      (await request("/logout", "POST", undefined, token)).status,
      200,
    );
    assert.equal((await request("/me", "GET", undefined, token)).status, 401);
    assert.equal(
      (await request("/me", "DELETE", undefined, logged.token)).status,
      200,
    );
    assert.equal(
      s.db.prepare("SELECT COUNT(*) AS n FROM application_consents").get().n,
      0,
    );
    assert.equal(
      (await request("/me", "GET", undefined, logged.token)).status,
      401,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
