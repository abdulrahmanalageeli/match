import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { createServer } from 'vite';
import { confirmInterviewChoices } from '../api/_lib/interview.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const plain = value => JSON.parse(JSON.stringify(value));
let loader, interview, draft, consent, compatibility, beena, decodeDraft, createDraftVault;
before(async () => {
  loader = await createServer({ configFile: false, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'interview-integration-no-live-services', enforce: 'pre', load(id) {
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/src/cloud.ts')) return 'export const cloud=null; export function callRpc(){throw Error("Live RPC prohibited")}';
      if (path.endsWith('/src/legal/LegalNotice.tsx')) return 'export const LEGAL_NOTICE_VERSION="2026-11-07-privacy"';
    } }], optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  interview = await loader.ssrLoadModule('/src/interview/model.ts');
  draft = await loader.ssrLoadModule('/src/onboarding/draft.ts');
  consent = await loader.ssrLoadModule('/src/legal/consent.ts');
  compatibility = await loader.ssrLoadModule('/src/compatibility/model.ts');
  beena = await loader.ssrLoadModule('/src/beena/model.ts');
  ({ decodeDraft } = await loader.ssrLoadModule('/src/onboarding/persistence.ts'));
  ({ createDraftVault } = await loader.ssrLoadModule('/src/onboarding/vault.ts'));
});
after(() => loader?.close());

function preferences(code) {
  return compatibility.dimensions.flatMap(dimension => ['self', 'partner'].map(side => ({
    id: `${dimension.id}:${side}`, kind: 'preference', fieldId: dimension.id, side, values: [code],
    summary: 'اختيار مؤكد للاختبار', evidence: [{ turnId: 'synthetic', quote: 'إجابة افتراضية' }], needsClarification: false,
  })));
}
function confirmed(proposals, ids = proposals.map(value => value.id)) {
  const document = { status: 'review', pendingAnalysis: false, proposals, confirmed: [] };
  return confirmInterviewChoices(document, proposals.filter(value => ids.includes(value.id)).map(({ id, values }) => ({ id, values })), false).confirmed;
}
function newDraft() {
  const result = draft.initialDraft(owner, null);
  result.answers = { ...result.answers, displayName: 'اختبار', gender: 'woman', birthDate: '1995-04-15', age: '31',
    city: 'الرياض', profession: 'مهندسة', bio: 'ملف افتراضي لاختبار التسجيل', contact: 'synthetic@example.test' };
  result.permissions = { version: '2026-11-07-privacy', sensitiveProfile: false, assessment: true };
  return result;
}
const choices = () => ({ ...consent.emptyConsents(), adult: true, terms: true, privacy: true, assessment: true });
const profile = answers => consent.applyConsentChoices(draft.toProfile(answers), choices());
function candidate(code, id) {
  const initial = newDraft().answers;
  return { ...profile({ ...initial, ...interview.applyInterviewAnswers(initial, confirmed(preferences(code))) }), id, gender: 'man' };
}

async function cloudBoundary() {
  const calls = [];
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }) },
    rpc: async (name, args) => { calls.push({ name, args: plain(args) }); return { data: { saved: true }, error: null }; } };
  const modules = {
    '@supabase/supabase-js': { createClient: () => client }, './session': { authStorage: {} },
    './deployment': { resolveDeployment: () => ({ ready: true, selected: true, url: 'https://synthetic.invalid', key: 'synthetic' }) },
    './auth/signupReturn': { signupRedirectUrl: () => null },
  };
  const context = vm.createContext({ URL, Response });
  const source = await readFile(new URL('../src/cloud.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = new vm.SourceTextModule(compiled, { context, initializeImportMeta(meta) { meta.env = {}; } });
  await module.link(name => {
    const exports = modules[name]; assert(exports, name);
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  return { request: module.namespace.cloudRequest, calls };
}

test('confirmed interview answers survive onboarding resume and reach the real application RPC payload', async () => {
  const initial = newDraft();
  initial.answers = { ...initial.answers, ...interview.applyInterviewAnswers(initial.answers, confirmed(preferences('A'))) };
  const rows = new Map();
  const storage = { read: async key => rows.get(key) ?? null, write: async (key, value) => rows.set(key, value), remove: async key => rows.delete(key) };
  const first = createDraftVault(() => storage, decodeDraft);
  assert.equal(await first.save(initial, first.revision(owner)), true);
  const resumed = createDraftVault(() => storage, decodeDraft);
  const restored = await resumed.load(owner, 'new', resumed.revision(owner));
  assert(restored, 'a fresh signup session must recover the confirmed answers');
  assert.deepEqual(plain(restored.answers.surveyAnswers), plain(initial.answers.surveyAnswers));
  assert.equal(restored.consent, false, 'resuming must not grant final signup consent');
  const submitted = profile(restored.answers), boundary = await cloudBoundary();
  await boundary.request('/application', 'PUT', owner, submitted);
  assert.equal(boundary.calls.length, 1);
  assert.equal(boundary.calls[0].name, 'marriage_apply');
  assert.deepEqual(boundary.calls[0].args.payload.surveyAnswers, plain(initial.answers.surveyAnswers));
  assert.equal(boundary.calls[0].args.payload.assessmentVersion, compatibility.assessmentVersion);
  assert.equal(boundary.calls[0].args.payload.signupConsents.assessment, true);
  assert.equal(Object.hasOwn(boundary.calls[0].args.payload, 'proposals'), false);
  assert.equal(Object.hasOwn(boundary.calls[0].args.payload, 'transcript'), false);
});

test('confirmed changes alter compatibility explanations and recommendation order through the existing engine', () => {
  const base = newDraft().answers, a = candidate('A', 'candidate-a'), b = candidate('B', 'candidate-b');
  const first = { ...profile({ ...base, ...interview.applyInterviewAnswers(base, confirmed(preferences('A'))) }), id: owner };
  const original = compatibility.rankPreferences(first, [b, a]);
  assert.equal(original[0].person.id, a.id);
  assert.equal(original[0].fit.percentage, 100);
  const changed = { ...first, ...interview.applyInterviewAnswers(first, confirmed(preferences('B'))) };
  const updated = compatibility.rankPreferences(changed, [a, b]);
  assert.equal(updated[0].person.id, b.id);
  assert.equal(updated[0].fit.percentage, 100);
  assert.equal(updated[1].fit.percentage, 0);
  assert.equal(updated[0].fit.strengths.length, compatibility.dimensions.length);
  assert.equal(updated[1].fit.discussion.length, compatibility.dimensions.length);
  assert.equal(first.surveyAnswers.children_plan, 'A', 'the original draft is not mutated');
});

test('unselected proposals and partial confirmations never invent an assessment percentage or personality answers', () => {
  const base = newDraft().answers, proposal = preferences('A')[0];
  const noChoices = interview.applyInterviewAnswers(base, confirmed(preferences('A'), []));
  assert.deepEqual(plain(noChoices), {});
  const selfOnly = profile({ ...base, ...interview.applyInterviewAnswers(base, confirmed([proposal])) });
  assert.equal(Object.keys(selfOnly.surveyAnswers).length, 1);
  const comparison = compatibility.describeFit({ ...selfOnly, id: owner }, candidate('A', 'peer'));
  assert.equal(comparison.fit.covered, 0);
  assert.equal(comparison.fit.percentage, null);
  assert.equal(comparison.fit.personality.complete, false);
  assert.deepEqual(plain(selfOnly.personalityAnswers), {});
  const onePair = profile({ ...base, ...interview.applyInterviewAnswers(base, confirmed(preferences('A').slice(0, 2))) });
  const partial = compatibility.describeFit({ ...onePair, id: owner }, candidate('A', 'peer'));
  assert.equal(partial.fit.covered, 1);
  assert.equal(partial.fit.percentage, null);
  assert(partial.rankValue > 0, 'valid incomplete answers still contribute to ranking with a coverage penalty');
});

test('confirmed Beena answers feed the same scenario matching while unselected scenarios remain unanswered', () => {
  const base = newDraft().answers;
  const proposals = beena.beenaScenarios.flatMap(scenario => ['self', 'partner'].map(side => ({
    ...preferences('A')[0], id: `${scenario.id}:${side}`, kind: 'beena', fieldId: scenario.id, side,
  })));
  const complete = profile({ ...base, ...interview.applyInterviewAnswers(base, confirmed(proposals)) });
  assert.equal(beena.beenaProgress(complete.beena).complete, true);
  assert.equal(beena.compareBeena(complete.beena, complete.beena).percentage, 100);
  const partial = profile({ ...base, ...interview.applyInterviewAnswers(base, confirmed(proposals.slice(0, 2))) });
  assert.equal(beena.beenaProgress(partial.beena).answered, 1);
  assert.equal(beena.compareBeena(partial.beena, complete.beena).percentage, null);
  assert.equal(partial.beena.story, undefined, 'private interview prose does not become a public story');
});

test('declining assessment consent strips previously confirmed interview answers before signup submission', async () => {
  const base = newDraft().answers;
  const merged = { ...base, ...interview.applyInterviewAnswers(base, confirmed(preferences('A'))) };
  const payload = consent.applyConsentChoices(draft.toProfile(merged), { ...choices(), assessment: false });
  const boundary = await cloudBoundary();
  await boundary.request('/application', 'PUT', owner, payload);
  assert.deepEqual(boundary.calls[0].args.payload.surveyAnswers, {});
  assert.deepEqual(boundary.calls[0].args.payload.personalityAnswers, {});
  assert.equal(boundary.calls[0].args.payload.beena, null);
  assert.equal(boundary.calls[0].args.payload.signupConsents.assessment, false);
});
