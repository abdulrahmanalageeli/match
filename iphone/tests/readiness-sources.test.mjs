import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {emptyReadinessPassport, preparationItems} from '../src/readiness/model.ts';

const compile=async path=>ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const rewrite=source=>source.replaceAll("'../readiness/model'",JSON.stringify(new URL('../src/readiness/model.ts',import.meta.url).href)).replaceAll("'../family/model'",JSON.stringify(new URL('../src/family/model.ts',import.meta.url).href));
const dataUrl=url(rewrite(await compile('../src/community/data.ts'))
 .replace("'./simulation'",JSON.stringify(new URL('../src/community/simulation.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/cloud["'];?/g,'')
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\/updates["'];?/,'')
 .replace('"../compatibility/model"',JSON.stringify(new URL('../src/compatibility/model.ts',import.meta.url).href))
 .replace('"../beena/model"',JSON.stringify(new URL('../src/beena/model.ts',import.meta.url).href))
 .replace('"../compatibility/personality"',JSON.stringify(new URL('../src/compatibility/personality.ts',import.meta.url).href))
 + '\nconst cloud={}; const callRpc=(...args)=>globalThis.__readinessRpc(...args); class CloudError extends Error{} const privateUpdates=()=>()=>()=>{};');
const {cloudCommunity,demoCommunity,demoProfile}=await import(dataUrl);
const {pairSource,testProfile}=await import(url(rewrite(await compile('../src/testing/pair.ts'))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
 .replace("'../community/data'",JSON.stringify(dataUrl))
 .replace("'../compatibility/model'",JSON.stringify(new URL('../src/compatibility/model.ts',import.meta.url).href))
 .replace("'../beena/model'",JSON.stringify(new URL('../src/beena/model.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/,"const marriageProjectUrl='https://test.invalid'; const marriagePublishableKey='public-test-key';")));
const draft={consentVersion:'readiness-v1',timeline:'6_to_12_months',family:'discussed',preparation:Object.fromEntries(preparationItems.map(item=>[item.id,'in_progress']))};

test('cloud passport operations retain user authorization and send only bounded draft fields',async t=>{
 const calls=[];globalThis.window={setTimeout,clearTimeout};globalThis.__readinessRpc=async(...args)=>{calls.push(args);return emptyReadinessPassport();};
 t.after(()=>{delete globalThis.window;delete globalThis.__readinessRpc;});
 const source=cloudCommunity('owner');
 await source.readiness('save',{...draft,claims:[{status:'valid'}],nationalId:'private'});
 await source.readiness('view',{connectionId:'matched'});
 assert.deepEqual(calls.map(([name,payload,owner])=>({name,payload,owner})),[
  {name:'marriage_passport',payload:{action:'save',payload:draft},owner:'owner'},
  {name:'marriage_passport',payload:{action:'view',payload:{connectionId:'matched'}},owner:'owner'},
 ]);
 assert.equal(source.readinessTestMode,undefined);
});

test('pair passport uses session-bound RPC, separate from cached chat state and without dummy sharing',async t=>{
 const originalFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async(input,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify(emptyReadinessPassport()),{headers:{'Content-Type':'application/json'}});};
 t.after(()=>{globalThis.fetch=originalFetch;});
 const profile=testProfile('reham'),source=pairSource({actor:'reham',session:'test-session',profile,profileRevision:'test'},()=>profile).source;
 assert.equal(source.readinessTestMode,true);
 assert.equal(source.readinessEligibleConnection('tester-pair'),true);
 assert.equal(source.readinessEligibleConnection('fictional'),false);
 await source.readiness('get',{action:'withdraw'});
 await source.readiness('save',{...draft,nationalId:'private'});
 assert.deepEqual(calls,[
  {action:'passport',session:'test-session',payload:{action:'get'}},
  {action:'passport',session:'test-session',payload:{...draft,action:'save'}},
 ]);
});

test('demo source ends grants when its connection closes and keeps readiness out of discovery',async()=>{
 const source=demoCommunity(()=>demoProfile);
 await source.readiness('save',draft);
 await source.readiness('share',{connectionId:'demo-mutual',sections:['preparation'],days:7});
 const people=await source.discover({mode:'all'});
 assert(people.length>0);
 assert(people.every(person=>!('preparation'in person)&&!('readiness'in person)&&!('passport'in person)));
 await source.act('demo-mutual','cancel',undefined,true);
 assert.deepEqual((await source.readiness('get')).grants,[]);
 await assert.rejects(source.readiness('share',{connectionId:'demo-mutual',sections:['preparation'],days:7}));
});
