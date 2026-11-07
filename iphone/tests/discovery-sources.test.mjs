import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { preferencePercentage, personalityPercentage } from '../src/compatibility/model.ts';

const compile = async path => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const modelUrl = new URL('../src/compatibility/model.ts', import.meta.url).href;
const beenaUrl = new URL('../src/beena/model.ts', import.meta.url).href;
const dataUrl = url((await compile('../src/community/data.ts'))
  .replace("'./simulation'",JSON.stringify(new URL('../src/community/simulation.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
 .replace("'../family/model'", JSON.stringify(new URL('../src/family/model.ts', import.meta.url).href))
  .replace("'../readiness/model'", JSON.stringify(new URL('../src/readiness/model.ts', import.meta.url).href))
  .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/cloud["'];?/g, '')
  .replace(/import\s*\{[^}]+\}\s*from ["']\.\/updates["'];?/, '')
  .replace('"../compatibility/model"', JSON.stringify(modelUrl))
  .replace('"../beena/model"', JSON.stringify(beenaUrl))
  .replace('"../compatibility/personality"', JSON.stringify(new URL('../src/compatibility/personality.ts', import.meta.url).href))
  + '\nconst cloud=null; class CloudError extends Error {} const privateUpdates=()=>()=>()=>{};');
const { demoCommunity, demoProfile, matchesDiscoveryFilters } = await import(dataUrl);
const pairUrl = url((await compile('../src/testing/pair.ts'))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
  .replace("'../family/model'", JSON.stringify(new URL('../src/family/model.ts', import.meta.url).href))
  .replace("'../readiness/model'", JSON.stringify(new URL('../src/readiness/model.ts', import.meta.url).href))
  .replace("'../community/data'", JSON.stringify(dataUrl))
  .replace("'../compatibility/model'", JSON.stringify(modelUrl))
  .replace("'../beena/model'", JSON.stringify(beenaUrl))
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/, "const marriageProjectUrl='https://test.invalid'; const marriagePublishableKey='public-test-key';"));
const { pairSource, testProfile } = await import(pairUrl);
const completeFit = { version: 'marriage-v2', assessmentComplete: true, provisional: false, covered: 32, total: 32, percentage: 92,
  personality: { version: 'personality-v1', complete: true, covered: 10, total: 10, percentage: 88 } };
const person = { id: 'one', alias: 'عضو', age: 29, city: 'الرياض', occupation: '', bio: '', interests: ['القراءة'], fit: completeFit };

test('simulated test conversations persist per tester and refresh paused, without crossing identities', async () => {
  const original=globalThis.localStorage,items=new Map();
  globalThis.localStorage={getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
  try {
    const options={storageKey:'simulation-test-one',aiReply:async()=> 'أهلًا، أحب أن نأخذ وقتنا لنتعرف أكثر.'};
    const source=demoCommunity(()=>demoProfile,false,options);
    const peer=source.simulation.snapshot().participants[0];
    const id=await source.request(peer);await source.demoAcceptOutgoing(id);
    await source.send(id,'أهلًا بك','sim-hello');
    await source.simulation.step();await source.simulation.step();
    const saved=await source.thread(id);assert.equal(saved.length,2);assert.equal(await source.unreadCount(),1);
    const restored=demoCommunity(()=>demoProfile,false,options);
    assert.equal(restored.simulation.snapshot().running,false);
    assert.equal((await restored.inbox())[0].person.isDemo,true);
    assert.deepEqual(await restored.thread(id),saved);
    await restored.markRead(id,saved.at(-1).id);
    assert.equal(await demoCommunity(()=>demoProfile,false,options).unreadCount(),0);
    assert.equal((await demoCommunity(()=>demoProfile,false,{storageKey:'simulation-test-two'}).inbox()).length,0);
    restored.simulation.reset();assert.equal((await restored.inbox()).length,0);
    assert.equal((await demoCommunity(()=>demoProfile,false,options).inbox()).length,0);
  } finally { if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original; }
});

test('score filters and displays reject incomplete, unsupported and invalid scores consistently', () => {
  assert.equal(preferencePercentage(completeFit), 92);
  assert.equal(personalityPercentage(completeFit), 88);
  assert(matchesDiscoveryFilters(person, { minFit: 90, interest: 'reading' }));
  for (const change of [{ assessmentComplete: false }, { provisional: true }, { covered: 31 }, { total: 0 }, { version: 'legacy' }, { percentage: NaN }, { percentage: 101 }]) {
    const fit = { ...completeFit, ...change };
    assert.equal(preferencePercentage(fit), null);
    assert.equal(matchesDiscoveryFilters({ ...person, fit }, { minFit: 60 }), false);
  }
  for (const change of [{ complete: false }, { covered: 9 }, { total: 0 }, { version: 'legacy' }, { percentage: NaN }, { percentage: -1 }]) {
    assert.equal(personalityPercentage({ ...completeFit, personality: { ...completeFit.personality, ...change } }), null);
  }
  assert.equal(matchesDiscoveryFilters(person, { interest: 'cooking' }), false);
});

test('demo discovery searches bios and keeps interest, dismissal and reporting distinct', async () => {
  const source = demoCommunity(() => demoProfile, false);
  const initial = await source.discover({ mode: 'all' });
  assert(initial.length > 1);
  const [first, second] = initial;
  assert(first.beenaStory?.text, 'Fictional profiles demonstrate a shared scenario story');
  assert.equal(first.beena, undefined, 'Discovery never exposes raw scenario answers');
  assert.equal(first.beenaStory.share, undefined, 'Shared stories contain only their public fields');
  assert.equal(first.fit.beena.complete, true);
  assert((await source.discover({ mode: 'all', search: first.bio.slice(0, 20) })).some(row => row.id === first.id));
  await source.setInterest(first.id, true);
  assert.equal((await source.discover({ mode: 'all' })).find(row => row.id === first.id).interested, true);
  await source.setInterest(first.id, false);
  assert.equal((await source.discover({ mode: 'all' })).find(row => row.id === first.id).interested, false);
  await source.dismissPerson(first.id);
  assert(!(await source.discover({ mode: 'all' })).some(row => row.id === first.id));
  await assert.rejects(source.reportPerson(second.id, 'a'));
  await source.reportPerson(second.id, 'تواصل غير مرغوب');
  assert(!(await source.discover({ mode: 'all' })).some(row => row.id === second.id));
  await assert.rejects(source.request(second.id), /غير متاح/);
});

test('paired discovery honors actual interests, work filters and combined ordering before pagination', async t => {
  const profile = testProfile('reham');
  const peer = testProfile('abdulrahman', { age: 45, interestIds: ['cooking'], surveyAnswers: { ...demoProfile.surveyAnswers, wife_work: 'B' } });
  const state = { actor: 'reham', matched: false, allowRematch: true, messages: [], read: {}, profiles: { abdulrahman: peer }, stage: 0, agree: {}, call: null };
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => state }));
  const source = pairSource({ actor: 'reham', session: 'synthetic', profile, profileRevision: 'revision' }, () => profile).source;
  const all = await source.discover({ mode: 'all', sort: 'youngest' });
  assert(all.some(row => row.id === 'abdulrahman'));
  assert.equal(all.at(-1).id, 'abdulrahman');
  assert.deepEqual(all.at(-1).interests, ['الطبخ']);
  assert(!(await source.discover({ mode: 'all', interest: 'reading' })).some(row => row.id === 'abdulrahman'));
  assert(!(await source.discover({ mode: 'all', interest: 'cooking', work: 'B' })).some(row => row.id === 'abdulrahman'), 'Private peer survey answers are unavailable for this filter');
  assert(!(await source.discover({ mode: 'all', work: 'A' })).some(row => row.id === 'abdulrahman'));
  assert.deepEqual((await source.discover({ mode: 'all', sort: 'youngest', offset: 1 })).map(row => row.id), all.slice(1).map(row => row.id));
  assert.deepEqual(await source.discover({ mode: 'all', offset: 24 }), []);
});
