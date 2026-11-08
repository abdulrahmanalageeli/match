import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let loader, createDraftVault, draftTTL, decodeDraft, initialDraft, personalityQuestions, personalityVersion;
before(async () => {
  loader = await createServer({ configFile: false, appType: "custom", logLevel: "error",
    plugins:[{name:'isolate-account-cloud',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/cloud.ts'))return 'export const cloud=null; export async function callRpc(){throw Error("Unexpected live RPC in draft test")}';}}],
    optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  ({ createDraftVault, draftTTL } = await loader.ssrLoadModule("/src/onboarding/vault.ts"));
  ({ decodeDraft } = await loader.ssrLoadModule("/src/onboarding/persistence.ts"));
  ({ initialDraft } = await loader.ssrLoadModule("/src/onboarding/draft.ts"));
  ({ personalityQuestions, personalityVersion } = await loader.ssrLoadModule("/src/compatibility/personality.ts"));
});
after(() => loader?.close());

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const rows = new Map();
  const storage = {
    read: async k => rows.get(k) ?? null,
    write: async (k, v) => { rows.set(k, v); },
    remove: async k => { rows.delete(k); },
  };
  let time = Date.now();
  const vault = () => createDraftVault(() => storage, decodeDraft, () => time);
  const draft = initialDraft(a, null);
  draft.answers.displayName = "نور";
  draft.answers.contact = "sample@example.invalid";
  draft.step = "review";
  draft.consent = true;
  return { rows, storage, draft, vault, advance: amount => { time += amount; } };
}

test("explicit save survives a new app lifetime, isolates owners, and restores without consent", async () => {
  const f = fixture();
  const first = f.vault();
  assert.equal(f.rows.size, 0);
  assert.equal(await first.save(f.draft, first.revision(a)), true);
  assert.deepEqual([...f.rows.keys()], ["nisfayn.intake.v1." + a]);
  assert(!("consent" in JSON.parse([...f.rows.values()][0])));
  const fresh = f.vault();
  assert.equal(await fresh.load(b, "new", fresh.revision(b)), null);
  assert.deepEqual(await fresh.load(a, "new", fresh.revision(a)), { ...f.draft, consent: false });
});

test("public basics and private assessments survive resume in each new chapter", async () => {
  const f = fixture();
  f.draft.answers.gender = "woman";
  f.draft.answers.marriageBasics = { heightCm: 170, weightKg: 65, nationality: "سعودية", tribalBackground: "tribal", tribeName: "قبيلة تجريبية", maritalStatus: "never_married", childrenCount: 0, smoking: "never", skinTone: "tone_4", dressStyle: "niqab", dressFlexibility: "keep" };
  f.draft.answers.marriageBasics.marriageTimeline = 'within_3_months';
  f.draft.answers.marriageBasics.meetingPreference = 'public_before_formal';
  f.draft.answers.partnerCriteria = { height: { mode: "prefer", min: 160, max: 190 }, weight: { mode: "any" }, tribalBackground: { mode: "require", target: "same_tribe" }, maritalStatus: { mode: "prefer", values: ["never_married", "divorced"] }, children: { mode: "any" }, smoking: { mode: "require", target: "never" }, skinTone: { mode: "prefer", values: ["tone_1", "tone_8"] }, dressStyle: { mode: "prefer", values: ["niqab", "hijab"] }, dressFlexibility: { mode: "require", target: "open_to_discussion" } };
  f.draft.answers.publicAvatar = { style: "uncovered", skinTone: "tone_8" };
  f.draft.answers.personalityVersion = personalityVersion;
  f.draft.answers.beena={version:'beena-v1',answers:{finances:{self:'A',partner:['B'],importance:2}},story:{scenarioId:'finances',text:'نتحدث عن الميزانية بوضوح.',share:false}};
  f.draft.answers.personalityAnswers = Object.fromEntries(personalityQuestions.map((question, i) => [question.id, ["A", "B", "C", "D", "E"][i % 5]]));
  f.draft.returnToReview = true;
  for (const step of ["details", "avatar", "criteria", "personality", "beena"]) {
    f.draft.step = step;
    const first = f.vault();
    assert.equal(await first.save(f.draft, first.revision(a)), true);
    const fresh = f.vault();
    assert.deepEqual(await fresh.load(a, "new", fresh.revision(a)), { ...f.draft, consent: false }, step);
    assert.equal(await fresh.load(b, "new", fresh.revision(b)), null);
  }
});

test("legacy avatar omission remains distinct from an explicit saved avatar removal", async () => {
  const f = fixture(), vault = f.vault();
  delete f.draft.answers.appearanceVersion;
  await vault.save(f.draft, vault.revision(a));
  const legacy = await vault.load(a, "new", vault.revision(a));
  assert(legacy);
  assert.equal(Object.hasOwn(legacy.answers, "publicAvatar"), false);
  assert.equal(Object.hasOwn(legacy.answers, "appearanceVersion"), false);
  f.draft.answers.publicAvatar = null;
  f.draft.answers.appearanceVersion = "appearance-v1";
  f.draft.step = "avatar";
  await vault.save(f.draft, vault.revision(a));
  const fresh = f.vault();
  const removed = await fresh.load(a, "new", fresh.revision(a));
  assert(removed);
  assert.equal(Object.hasOwn(removed.answers, "publicAvatar"), true);
  assert.equal(removed.answers.publicAvatar, null);
  assert.equal(removed.answers.appearanceVersion, "appearance-v1");
});

test("discussion-only and explicit change willingness remain distinct after save and resume", async () => {
  const f = fixture();
  f.draft.step = "criteria";
  for (const choice of ["open_to_discussion", "open_to_change"]) {
    f.draft.answers.marriageBasics = { dressStyle: "hijab", dressFlexibility: choice };
    f.draft.answers.partnerCriteria = { dressFlexibility: { mode: "require", target: choice } };
    const saved = f.vault();
    assert.equal(await saved.save(f.draft, saved.revision(a)), true);
    const fresh = f.vault();
    const resumed = await fresh.load(a, "new", fresh.revision(a));
    assert.deepEqual(resumed?.answers.marriageBasics, { dressStyle: "hijab", dressFlexibility: choice });
    assert.deepEqual(resumed?.answers.partnerCriteria, { dressFlexibility: { mode: "require", target: choice } });
  }
});

test("unfinished selections, partial numeric input and reversed draft ranges survive resume", async () => {
  const f = fixture(), vault = f.vault();
  f.draft.step = "criteria";
  f.draft.answers.partnerCriteria = {
    height: { mode: "prefer" }, weight: { mode: "require" },
    tribalBackground: { mode: "require", target: "same_tribe" },
    maritalStatus: { mode: "prefer", values: [] }, children: { mode: "require" }, smoking: { mode: "prefer" },
  };
  f.draft.answers.personalityAnswers = { [personalityQuestions[0].id]: "B" };
  await vault.save(f.draft, vault.revision(a));
  const fresh = f.vault();
  assert.deepEqual(await fresh.load(a, "new", fresh.revision(a)), { ...f.draft, consent: false });
  f.draft.answers.marriageBasics = { heightCm: 1, weightKg: 6, childrenCount: 0, tribeName: "قبيلة تجريبية" };
  f.draft.answers.partnerCriteria = { height: { mode: "prefer", min: 19 }, weight: { mode: "require", min: 90, max: 60 } };
  await fresh.save(f.draft, fresh.revision(a));
  const resumed = f.vault();
  assert.deepEqual(await resumed.load(a, "new", resumed.revision(a)), { ...f.draft, consent: false });
});

test("future versions and unknown or malformed assessment fields are discarded", async () => {
  const mutations = [
    ["future storage version", data => { data.version = 2; }],
    ["future preferences version", data => { data.answers.assessmentVersion = "marriage-v999"; }],
    ["future personality version", data => { data.answers.personalityVersion = "personality-v999"; }],
    ["future appearance version", data => { data.answers.appearanceVersion = "appearance-v999"; }],
    ["unknown appearance tone", data => { data.answers.marriageBasics = { skinTone: "tone_9" }; }],
    ["unknown dress style", data => { data.answers.marriageBasics = { dressStyle: "other" }; }],
    ["unknown dress willingness", data => { data.answers.marriageBasics = { dressFlexibility: "will_change" }; }],
    ["unknown marriage timeline", data => { data.answers.marriageBasics = { marriageTimeline: "soon" }; }],
    ["unknown meeting preference", data => { data.answers.marriageBasics = { meetingPreference: "anywhere" }; }],
    ["unknown preferred tone", data => { data.answers.partnerCriteria = { skinTone: { mode: "prefer", values: ["tone_0"] } }; }],
    ["unknown dress preference", data => { data.answers.partnerCriteria = { dressStyle: { mode: "require", values: ["other"] } }; }],
    ["unsupported dress commitment", data => { data.answers.partnerCriteria = { dressFlexibility: { mode: "require", target: "will_change" } }; }],
    ["unknown avatar tone", data => { data.answers.publicAvatar = { style: "hijab", skinTone: "tone_9" }; }],
    ["unknown avatar style", data => { data.answers.publicAvatar = { style: "other", skinTone: "tone_1" }; }],
    ["avatar URL instead of explicit selection", data => { data.answers.publicAvatar = "https://example.invalid/portrait.png"; }],
    ["extra avatar image URL", data => { data.answers.publicAvatar = { style: "hijab", skinTone: "tone_1", url: "https://example.invalid/portrait.png" }; }],
    ["unknown answer field", data => { data.answers.unknownAssessment = {}; }],
    ["unknown public field", data => { data.answers.marriageBasics = { unknownAttribute: "value" }; }],
    ["nonnumeric public measurement", data => { data.answers.marriageBasics = { heightCm: "170" }; }],
    ["unknown partner criterion", data => { data.answers.partnerCriteria = { unknownCriterion: { mode: "any" } }; }],
    ["unknown nested criterion field", data => { data.answers.partnerCriteria = { height: { mode: "prefer", secret: "value" } }; }],
    ["unknown criterion target", data => { data.answers.partnerCriteria = { tribalBackground: { mode: "prefer", target: "unknown" } }; }],
    ["fractional saved range", data => { data.answers.partnerCriteria = { weight: { mode: "prefer", min: 65.5 } }; }],
    ["unsafe numeric public measurement", data => { data.answers.marriageBasics = { heightCm: Number.MAX_SAFE_INTEGER + 1 }; }],
    ["unknown personality question", data => { data.answers.personalityAnswers = { unknownQuestion: "A" }; }],
    ["unknown personality answer", data => { data.answers.personalityAnswers = { [personalityQuestions[0].id]: "F" }; }],
  ];
  for (const [label, mutate] of mutations) {
    const f = fixture(), vault = f.vault(), key = "nisfayn.intake.v1." + a;
    await vault.save(f.draft, vault.revision(a));
    const data = JSON.parse(f.rows.get(key)); mutate(data); f.rows.set(key, JSON.stringify(data));
    assert.equal(await vault.load(a, "new", vault.revision(a)), null, label);
    assert.equal(f.rows.size, 0, label);
  }
});

test("corrupt, expired, foreign-owner and stale-server drafts are cleared", async () => {
  const f = fixture(), vault = f.vault(), key = "nisfayn.intake.v1." + a;
  async function expectDiscard(change, baseline = "new") {
    await vault.save(f.draft, vault.revision(a));
    change();
    assert.equal(await vault.load(a, baseline, vault.revision(a)), null);
    assert.equal(f.rows.size, 0);
  }
  await expectDiscard(() => f.rows.set(key, "{"));
  await expectDiscard(() => {
    const value = JSON.parse(f.rows.get(key)); value.answers.age = {}; f.rows.set(key, JSON.stringify(value));
  });
  await expectDiscard(() => {
    const value = JSON.parse(f.rows.get(key)); value.owner = b; f.rows.set(key, JSON.stringify(value));
  });
  await expectDiscard(() => {}, "server-changed");
  await expectDiscard(() => f.advance(draftTTL));
});

test("clear supersedes an in-flight save and rejects old screen leases", async () => {
  const f = fixture(), vault = f.vault(), lease = vault.revision(a);
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const write = f.storage.write;
  f.storage.write = async (k, v) => { started.resolve(); await release.promise; return write(k, v); };
  const delayed = vault.save(f.draft, lease); await started.promise;
  const cleared = vault.clear(a);
  const late = vault.save(f.draft, lease);
  release.resolve();
  assert.equal(await delayed, false); await cleared;
  assert.equal(await late, false); assert.equal(f.rows.size, 0);
  assert.equal(await vault.load(a, "new", lease), null);
  assert.equal(await vault.save(f.draft, vault.revision(a)), true);
});

test("Keychain failures propagate and can retry; browser and demo have no storage path", async () => {
  const f = fixture(), vault = f.vault();
  const write = f.storage.write;
  f.storage.write = async () => { throw Error("locked"); };
  await assert.rejects(vault.save(f.draft, vault.revision(a)), /locked/);
  f.storage.write = write;
  assert.equal(await vault.save(f.draft, vault.revision(a)), true);
  const remove = f.storage.remove;
  f.storage.remove = async () => { throw Error("locked"); };
  await assert.rejects(vault.clear(a), /locked/);
  assert.equal(await vault.load(a, "new", vault.revision(a)), null);
  f.storage.remove = remove;
  await vault.clear(a); assert.equal(f.rows.size, 0);
  const web = createDraftVault(() => null, decodeDraft);
  assert.equal(web.available(a), false); assert.equal(await web.save(f.draft, 0), false);
  assert.equal(vault.available("demo-1"), false);
  assert.equal(await vault.save({ ...f.draft, owner: "demo-1" }, 0), false);
});
