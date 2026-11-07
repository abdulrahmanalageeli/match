import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const fixture = { city: 'الرياض', interestIds: ['reading'], surveyAnswers: { shared_default: 'A' }, beena: { version:'beena-v1',answers:{family_boundaries:{self:'A',partner:['B']}} }, preferredMinAge: 25, preferredMaxAge: 40, familyPreference: 'بعد التعارف', marriageBasics: { heightCm: 165 }, assessmentVersion: 'marriage-v2' };
const text = await readFile(new URL('./pair.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const isolated = compiled
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/ai\/client['"];?/, "const requestAi = async () => { throw Error('offline'); };")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
  .replace("'../beena/model'", JSON.stringify(new URL('../beena/model.ts', import.meta.url).href))
  .replace("'../readiness/model'", JSON.stringify(new URL('../readiness/model.ts', import.meta.url).href))
  .replace("'../family/model'", JSON.stringify(new URL('../family/model.ts', import.meta.url).href))
  .replace("'../compatibility/model'", JSON.stringify(new URL('../compatibility/model.ts', import.meta.url).href))
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/community\/data['"];?/, `const demoProfile = ${JSON.stringify(fixture)}; const demoCommunity = () => ({ inbox: async () => [], watch: () => () => {} });`)
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/, `const marriageProjectUrl = 'https://test.invalid'; const marriagePublishableKey = 'public-test-key';`);
const { testProfile, testPerson, pairSource } = await import('data:text/javascript;base64,' + Buffer.from(isolated).toString('base64'));
const snapshot = profileRevision => ({ profileRevision, actor: 'reham', matched: true, messages: [], read: {}, profiles: {}, stage: 0, agree: {}, call: null });

test('partial administrator profiles retain defaults and fixed account gender', () => {
  const profile = testProfile('reham', { displayName: 'اسم الإدارة', profession: 'مهنة معدلة', bio: 'نبذة معدلة', gender: 'man' });
  assert.equal(profile.displayName, 'اسم الإدارة'); assert.equal(profile.profession, 'مهنة معدلة'); assert.equal(profile.bio, 'نبذة معدلة');
  assert.equal(profile.gender, 'woman'); assert.equal(profile.age, 27); assert.equal(profile.contact, 'reham@example.invalid');
  assert.equal(profile.beena, null, 'Testers never inherit fictional scenario answers');
  assert.deepEqual(testProfile('reham', { beena: fixture.beena }).beena, fixture.beena, 'Own saved scenario answers remain editable');
  for (const key of ['city', 'interestIds', 'surveyAnswers', 'preferredMinAge', 'preferredMaxAge', 'familyPreference', 'marriageBasics', 'assessmentVersion']) assert.deepEqual(profile[key], fixture[key]);
  assert.equal(testProfile('abdulrahman', { bio: 'نبذة معدلة' }).displayName, 'عبدالرحمن');
});

test('partner cards show public edits without reconstructing missing private or demographic values', () => {
  const card = testPerson('abdulrahman', { displayName: 'اسم جديد', bio: 'نبذة الإدارة' });
  assert.equal(card.alias, 'اسم جديد'); assert.equal(card.bio, 'نبذة الإدارة'); assert.equal(card.city, ''); assert.equal(card.age, 0);
  assert.equal(card.marriageBasics, undefined); assert.equal(card.publicAvatar, undefined);
  assert.equal(testPerson('reham', { displayName: '' }).alias, 'رهام');
});

test('paired profiles use only server-authorized Beena stories and aggregates', async t => {
  const profile = testProfile('reham', { beena: fixture.beena });
  const privateBeena = { ...fixture.beena, story: { scenarioId:'family_boundaries', text:'private-story-secret', share:false } };
  const serverStory = { scenarioId:'support', text:'قصة أشاركها باختياري', answers:'never-copy-this' };
  const peer = { ...testProfile('abdulrahman'), beena:privateBeena, beenaStory:serverStory };
  const serverFit = { version:'beena-v1',covered:1,total:6,complete:false,percentage:null,aligned:['support'],discussion:[],prompts:[] };
  const pairFit = { version:'marriage-v2',band:'mixed',covered:16,total:16,assessmentComplete:true,provisional:false,percentage:71,strengths:[],discussion:[],missing:[],beena:serverFit };
  const state = { ...snapshot('current'), profiles:{abdulrahman:peer}, pairFit };
  t.mock.method(globalThis, 'fetch', async () => ({ ok:true,json:async()=>state }));
  const source = pairSource({ actor:'reham',session:'synthetic',profile,profileRevision:'current' },()=>profile).source;
  const [connection] = await source.inbox();
  assert.deepEqual(connection.person.fit, pairFit, 'Use the server score rather than recomputing with local defaults');
  assert.deepEqual(connection.person.fit.beena, serverFit, 'Server score is preserved when peer answers are hidden');
  assert.deepEqual(connection.person.beenaStory, { scenarioId:'support',text:serverStory.text });
  assert.equal(connection.person.beena, undefined);
  const serialized=JSON.stringify(connection.person);
  assert(!serialized.includes('private-story-secret'));
  assert(!serialized.includes('never-copy-this'));
  assert.equal(testPerson('abdulrahman', { ...peer,beenaStory:undefined }).beenaStory, undefined, 'Do not reconstruct a shared story from raw peer answers');
});

test('an older response without pairFit stays insufficient instead of using demo answers', async t => {
  const profile = testProfile('reham');
  t.mock.method(globalThis, 'fetch', async () => ({ ok:true,json:async()=>({ ...snapshot('old'), profiles:{abdulrahman:testProfile('abdulrahman')} }) }));
  const source = pairSource({actor:'reham',session:'synthetic',profile,profileRevision:'old'},()=>profile).source;
  const [connection] = await source.inbox();
  assert.equal(connection.person.fit.percentage,null);
  assert.equal(connection.person.fit.band,'insufficient');
  assert.equal(connection.person.fit.personality,undefined);
});

test('background state cannot silently advance the profile revision; only an own successful save advances it', async t => {
  const calls = [], profile = testProfile('reham');
  const account = { actor: 'reham', session: 'synthetic-token', profile, profileRevision: 'original-revision' };
  let conflict = true, saves = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    if (request.action === 'state') return { ok: true, json: async () => snapshot('newer-admin-revision') };
    assert.equal(request.action, 'profile');
    if (conflict) return { ok: false, status: 409, json: async () => ({ error: 'تغيّر الملف. أعد تحميله.' }) };
    return { ok: true, json: async () => snapshot('own-save-' + ++saves) };
  });
  const pair = pairSource(account, () => profile);
  await pair.source.inbox();
  await assert.rejects(pair.save({ ...profile, bio: 'مسودة قديمة' }), error => error.status === 409);
  assert.equal(calls.at(-1).payload.expectedRevision, 'original-revision');
  conflict = false;
  const saved = await pair.save({ ...profile, bio: 'تعديل أول' });
  assert.equal(calls.at(-1).payload.expectedRevision, 'original-revision'); assert.equal(saved.profileRevision, 'own-save-1');
  await pair.save({ ...profile, bio: 'تعديل ثان' });
  assert.equal(calls.at(-1).payload.expectedRevision, 'own-save-1');
  assert.equal(calls.at(-1).payload.profile.bio, 'تعديل ثان');
});

test('reporting the paired tester persists a report reason while ordinary cancellation only closes the match', async t => {
  const requests = [], profile = testProfile('reham');
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    return { ok: true, json: async () => snapshot('same-profile') };
  });
  const pair = pairSource({ actor: 'reham', session: 'synthetic-token', profile, profileRevision: 'original' }, () => profile);
  await pair.source.act('tester-pair', 'report', 'تواصل غير مرغوب');
  assert.equal(requests[0].action, 'close');
  assert.deepEqual(requests[0].payload, { report: true, reason: 'تواصل غير مرغوب' });
  await pair.source.act('tester-pair', 'cancel', 'إنهاء التعارف');
  assert.equal(requests[1].action, 'close');
  assert.notEqual(requests[1].payload.report, true);
});
