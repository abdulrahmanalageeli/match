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
  .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/photos\/verifyPhoto["'];?/, "const captureForPhoto=async()=>{throw Error('offline')};const verifyUploadedPhoto=captureForPhoto;")
  .replace("'../profile/profileOptions'",JSON.stringify(new URL('../src/profile/profileOptions.ts',import.meta.url).href))
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
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/voice\/nativeCalls["'];?/, "const ringNativePhones=async()=>{};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
  .replace("'../family/model'", JSON.stringify(new URL('../src/family/model.ts', import.meta.url).href))
  .replace("'../readiness/model'", JSON.stringify(new URL('../src/readiness/model.ts', import.meta.url).href))
  .replace("'../community/data'", JSON.stringify(dataUrl))
  .replace("'../compatibility/model'", JSON.stringify(modelUrl))
  .replace("'../beena/model'", JSON.stringify(beenaUrl))
  .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/, "const marriageProjectUrl='https://test.invalid'; const marriagePublishableKey='public-test-key';"));
const { pairSource, testProfile, testPerson } = await import(pairUrl);
const completeFit = { version: 'marriage-v2', assessmentComplete: true, provisional: false, covered: 32, total: 32, percentage: 92,
  personality: { version: 'personality-v1', complete: true, covered: 10, total: 10, percentage: 88 } };
const person = { id: 'one', alias: 'عضو', age: 29, city: 'الرياض', occupation: '', bio: '', interests: ['القراءة'], fit: completeFit };

test('fixture avatars survive discovery and pair cards without overriding photos or explicit privacy', async () => {
  const source=demoCommunity(()=>({...demoProfile,gender:'man'}),false);
  const rows=await source.discover({mode:'all'});
  assert(rows.length>0);
  assert(rows.every(row=>row.demoPhoto||row.publicAvatar));
  assert(rows.some(row=>row.publicAvatar?.style==='hijab'));
  assert(rows.some(row=>row.publicAvatar?.style==='niqab'));
  assert(rows.some(row=>row.publicAvatar?.style==='uncovered'));
  assert(rows.filter(row=>row.demoPhoto).every(row=>!row.publicAvatar));
  assert.equal(testPerson('reham').publicAvatar.style,'hijab');
  assert.equal(testPerson('reham',{publicAvatar:null}).publicAvatar,null);
});

test('city filters use canonical exact values for inclusion and exclusion', () => {
  assert.equal(matchesDiscoveryFilters(person, { city: 'Riyadh' }), true);
  assert.equal(matchesDiscoveryFilters(person, { city: 'رياض' }), false);
  assert.equal(matchesDiscoveryFilters({ ...person, city: 'جدة الجديدة' }, { city: 'جدة' }), false);
  assert.equal(matchesDiscoveryFilters(person, { excludeCities: ['Riyadh'] }), false);
  const saudi = { ...person, marriageBasics: { nationality: 'سعودية' } };
  assert.equal(matchesDiscoveryFilters(saudi, { nationality: 'سعودي' }), true);
  assert.equal(matchesDiscoveryFilters(saudi, { excludeNationalities: ['سعودي'] }), false);
});

test('structured discovery filters honor qualifications, profession, boundaries, and missing facts', () => {
  const candidate={...person,education:'بكالوريوس هندسة مدنية',occupation:'مهندسة مدنية',marriageBasics:{heightCm:170,weightKg:65,childrenCount:0}};
  assert.equal(matchesDiscoveryFilters(candidate,{education:'بكالوريوس',profession:'الهندسة والعمارة',minHeight:170,maxHeight:170,minWeight:65,maxWeight:65,children:'none'}),true);
  for(const filter of [{education:'ماجستير'},{profession:'التقنية والبرمجة'},{minHeight:171},{maxHeight:169},{minWeight:66},{maxWeight:64},{children:'has'}]) assert.equal(matchesDiscoveryFilters(candidate,filter),false);
  for(const filter of [{education:'بكالوريوس'},{profession:'الهندسة والعمارة'},{minHeight:120},{maxHeight:230},{minWeight:35},{maxWeight:250},{children:'none'}]) assert.equal(matchesDiscoveryFilters(person,filter),false);
  assert.equal(matchesDiscoveryFilters({...candidate,education:'بكالوريوس قيد الدراسة'},{education:'بكالوريوس'}),false);
  assert.equal(matchesDiscoveryFilters({...candidate,education:'دكتور صيدلة'},{education:'دكتوراه'}),false);
});

test('simulated test conversations persist per tester and refresh paused, without crossing identities', async () => {
  const original=globalThis.localStorage,items=new Map();
  globalThis.localStorage={getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
  try {
    const options={storageKey:'simulation-test-one',aiReply:async()=> 'أهلًا، أحب أن نأخذ وقتنا لنتعرف أكثر.'};
    const source=demoCommunity(()=>demoProfile,false,options);
    const peer=source.simulation.snapshot().participants[0];
    const id=await source.request(peer);await source.demoAcceptOutgoing(id);
    await source.send(id,'أهلًا بك','sim-hello');
    for(let i=0;i<4;i++)await source.simulation.step();
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

test('interactive simulated journey requires explicit user signature and supports permission, advancement and rewind', async () => {
  const profile={...demoProfile,gender:'man',displayName:'عبدالرحمن'};
  const source=demoCommunity(()=>profile,false,{interactiveJourney:true,random:()=>.2});
  const peer=(await source.discover({mode:'all'}))[0];
  const id=await source.request(peer.id);await source.demoAcceptOutgoing(id);
  await assert.rejects(source.send(id,'قبل الاتفاق','early'),/ميثاق/);
  assert.equal((await source.agreement(id)).status,'none');
  await source.simulation.step();
  const proposal=await source.agreement(id);
  assert.equal(proposal.status,'proposed');assert.equal(proposal.peerName,peer.alias);assert(proposal.womanSignedAt);
  assert.equal(proposal.manSignedAt,undefined);
  await assert.rejects(source.agree(id,'accept',{proposalId:proposal.proposalId,signed:false}));
  await assert.rejects(source.agree(id,'accept',{proposalId:'stale',signed:true}));
  const agreed=await source.agree(id,'accept',{proposalId:proposal.proposalId,signed:true});
  assert.equal(agreed.status,'accepted');assert(agreed.manSignedAt);assert(agreed.deadline);
  assert.equal((await source.callPermission(id)).status,'none');
  assert.equal((await source.requestCallPermission(id,'invite')).status,'pending');
  await source.simulation.step();assert.equal((await source.callPermission(id)).status,'accepted');
  const pending=await source.nextStep(id,1,true,true);assert.equal(pending.stage,0);
  await source.simulation.step();assert.equal((await source.progress(id)).stage,1);
  await source.rewindStep(id,1,true);await source.simulation.step();assert.equal((await source.progress(id)).stage,0);
  await source.send(id,'هلا','after-agreement');
  assert.equal((await source.thread(id)).at(-1).body,'هلا');
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
