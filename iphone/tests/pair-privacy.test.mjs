import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { projectPairState } from '../supabase/functions/_shared/pair-privacy.ts';
import { describeFit, dimensions, preferencePercentage, personalityPercentage } from '../src/compatibility/model.ts';
import personalityCatalog from '../src/compatibility/personality-catalog.json' with { type: 'json' };
import { compareBeena } from '../src/beena/model.ts';

function profile(id, offset = 0) {
  return { displayName: id, age: 29, city: 'الرياض', gender: id === 'reham' ? 'woman' : 'man', profession: 'عمل', bio: 'نبذة عامة',
    contact: 'PRIVATE CONTACT', preferredMinAge: 22, preferredMaxAge: 40, assessmentVersion: 'marriage-v2',
    surveyAnswers: Object.fromEntries(dimensions.flatMap((d, index) => [[d.id, d.options[(index + offset) % d.options.length].code], [d.partnerId, d.options[index % d.options.length].code]])),
    personalityVersion: 'personality-v1', personalityAnswers: Object.fromEntries(personalityCatalog.map((q, i) => [q.id, 'ABCDE'[(i + offset) % 5]])),
    partnerCriteria: { skinTone: { mode: 'prefer', values: ['tone_3'] } }, hardRequirements: ['private-requirement'], priorityCategories: ['values'],
    signupConsents: { sensitiveProfile: true, secret: 'PRIVATE CONSENT' }, signupConsentRecordedAt: 'private-time',
    beena: { version: 'beena-v1', answers: {}, story: { scenarioId: 'support', text: 'PRIVATE STORY', share: false } },
    beenaStory: { scenarioId: 'support', text: 'قصة منشورة', unexpected: 'PRIVATE STORY METADATA' },
    publicAvatar: { style: 'hijab', skinTone: 'tone_3', unexpected: 'PRIVATE AVATAR' },
    marriageBasics: { nationality: 'سعودي', maritalStatus: 'never_married', marriageTimeline: 'within_3_months',
      tribalBackground: 'tribal', tribeName: 'قبيلة', skinTone: 'tone_3', religiousAffiliation: 'sunni', prayerPractice: 'regular', unexpected: 'PRIVATE BASIC' },
    portrait: { id: 'photo', path: 'public-version.jpg', blur: 80, clearPath: 'PRIVATE CLEAR FILE' },
    unknownPrivateField: 'PRIVATE FUTURE FIELD' };
}
function state(actor = 'reham', publish = false) {
  return { actor, matched: true, seriousness: { status: 'accepted' }, profiles: { reham: profile('reham'), abdulrahman: profile('abdulrahman', 1) },
    sensitivePublication: { reham: publish, abdulrahman: publish }, beenaFit: compareBeena(), messages: [], read: {}, stage: 0, agree: {}, call: null };
}
const privateKeys = ['surveyAnswers', 'personalityAnswers', 'partnerCriteria', 'hardRequirements', 'priorityCategories', 'contact',
  'signupConsents', 'signupConsentRecordedAt', 'preferredMinAge', 'preferredMaxAge', 'beena', 'unknownPrivateField'];

test('edge scores unchanged stored answers and never emits private peer fields, in either direction', () => {
  for (const actor of ['reham', 'abdulrahman']) for (const publish of [false, true]) {
    const raw = state(actor, publish), before = structuredClone(raw), peer = actor === 'reham' ? 'abdulrahman' : 'reham';
    const result = projectPairState(raw);
    const expected = describeFit({ ...raw.profiles[actor], id: actor, beena: null }, { ...raw.profiles[peer], id: peer, beena: null }).fit;
    expected.beena = raw.beenaFit;
    assert.deepEqual(result.pairFit, expected);
    assert.equal(typeof preferencePercentage(result.pairFit), 'number');
    assert.equal(typeof personalityPercentage(result.pairFit), 'number');
    assert.deepEqual(result.profiles[actor], raw.profiles[actor], 'Own settings retain their complete data');
    for (const key of privateKeys) assert.equal(Object.hasOwn(result.profiles[peer], key), false, key);
    assert.equal(JSON.stringify(result.profiles[peer]).includes('PRIVATE'), false);
    assert.equal(result.profiles[peer].marriageBasics.tribeName, publish ? 'قبيلة' : undefined);
    assert.equal(result.profiles[peer].publicAvatar?.skinTone, publish ? 'tone_3' : undefined);
    assert.equal(result.profiles[peer].marriageBasics.marriageTimeline, 'within_3_months');
    assert.deepEqual(result.profiles[peer].beenaStory, { scenarioId: 'support', text: 'قصة منشورة' });
    assert.equal(result.sensitivePublication, undefined);
    assert.deepEqual(raw, before, 'Projection does not erase stored answers');
  }
});

test('missing publication choices hide sensitive fields and missing assessments never get demo percentages', () => {
  const raw = state(); delete raw.sensitivePublication;
  const hidden = projectPairState(raw).profiles.abdulrahman;
  assert.equal(hidden.publicAvatar, undefined); assert.equal(hidden.marriageBasics.religiousAffiliation, undefined);
  for (const profiles of [{}, { reham: profile('reham') }, { reham: {}, abdulrahman: {} }]) {
    const result = projectPairState({ actor: 'reham', profiles });
    assert.equal(result.pairFit.band, 'insufficient'); assert.equal(result.pairFit.covered, 0);
    assert.equal(preferencePercentage(result.pairFit), null); assert.equal(personalityPercentage(result.pairFit), null);
  }
  assert.deepEqual(projectPairState({ ok: true }), { ok: true });
  assert.throws(() => projectPairState({ actor: 'other', profiles: raw.profiles }), /Invalid tester state/);
});

test('login, state and mutation responses all pass through the edge projection', async t => {
  const file = new URL('../supabase/functions/pair-test/index.ts', import.meta.url);
  let source = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  source = source.replace(/import \{ createClient \}[^;]+;/, 'const createClient=()=>globalThis.__privacyClient;')
    .replace(/import \{ mintVoiceToken \}[^;]+;/, 'const mintVoiceToken=value=>value;')
    .replace(/import \{ testMediaLimit, validateTestMedia \}[^;]+;/, 'const testMediaLimit=8388608,validateTestMedia=()=>({mime:"image/jpeg"});')
    .replace(/import \{ parsePortraitUpload, portraitRequestLimit, portraitPolicies \}[^;]+;/, 'const parsePortraitUpload=async()=>({blurred:new Uint8Array([1])}),portraitRequestLimit=8388608,portraitPolicies=["never"];')
    .replace(/import \{ downloadChatMedia, viewOnceUpload, chatObjectPath \}[^;]+;/, 'const downloadChatMedia=()=>{},viewOnceUpload=()=>false,chatObjectPath=/./;')
    .replace("'../_shared/pair-privacy.ts'", JSON.stringify(new URL('../supabase/functions/_shared/pair-privacy.ts', import.meta.url).href))
    .replace('Deno.serve(', 'globalThis.__privacyHandler=(')
    .replaceAll('Deno.env.get(', 'globalThis.__privacyEnv(');
  const previous = Object.fromEntries(['__privacyClient', '__privacyHandler', '__privacyEnv'].map(k => [k, globalThis[k]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  globalThis.__privacyEnv = key => key === 'SUPABASE_URL' ? 'https://wupkifqbwhhebwrgvwai.supabase.co' : 'test-only';
  globalThis.__privacyClient = {
    rpc: async (name, input) => ({ data: name === 'marriage_test_manual_verification_badges' ? {} : input.action === 'attempt' ? true
      : input.action === 'media_stale' ? [] : ['portrait_prepare', 'media_reserve'].includes(input.action) ? { id: '10000000-0000-4000-8000-000000000001', path: 'private-image.jpg' } : state(), error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  for (const action of ['login', 'state', 'profile', 'send', 'read', 'step', 'portrait_policy', 'message_delete']) {
    const response = await globalThis.__privacyHandler(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify({ action, actor: 'reham', session: 'a'.repeat(64), payload: {} }) }));
    assert.equal(response.status, 200, action);
    const result = await response.json();
    assert.equal(result.profiles.abdulrahman.contact, undefined, action);
    assert.equal(result.profiles.abdulrahman.surveyAnswers, undefined, action);
    assert.equal(result.profiles.abdulrahman.marriageBasics.tribeName, undefined, action);
    assert.equal(typeof preferencePercentage(result.pairFit), 'number', action);
    assert.equal(result.profiles.reham.contact, 'PRIVATE CONTACT', action);
  }
  for (const action of ['upload', 'portrait_upload']) {
    const response = await globalThis.__privacyHandler(new Request('https://test.invalid?action=' + action, {
      method: 'POST', body: new Uint8Array([1]), headers: { 'content-type': 'image/jpeg', 'x-test-session': 'a'.repeat(64),
        'x-client-id': '10000000-0000-4000-8000-000000000001', 'x-portrait-blur': '80', 'x-profile-revision': 'a'.repeat(32) },
    }));
    assert.equal(response.status, 200, action);
    const result = await response.json();
    assert.equal(result.profiles.abdulrahman.surveyAnswers, undefined, action);
    assert.equal(result.profiles.abdulrahman.contact, undefined, action);
    assert.equal(typeof preferencePercentage(result.pairFit), 'number', action);
  }
});
