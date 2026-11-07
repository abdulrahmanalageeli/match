import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {randomUUID} from 'node:crypto';

// Import the actual handlers with only APNs transport replaced. All HTTP is mocked.
async function handler(name){
 let source=await readFile(new URL('../api/'+name+'.ts',import.meta.url),'utf8');
 if(name==='push')source=source.replace(/import \{ openApns[^\n]+\n/,'const openApns = (...args) => globalThis.__nisfaynTestApns(...args);\n');
 return (await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'))).default;
}
const maintenance=await handler('maintenance'),push=await handler('push'),health=await handler('health');
const origin='https://wupkifqbwhhebwrgvwai.supabase.co';
const configured={CRON_SECRET:'test-worker-secret',NISFAYN_SUPABASE_URL:origin,NISFAYN_SERVICE_ROLE_KEY:'sb_secret_test',VERCEL_ENV:'production',NISFAYN_PUSH_ENABLED:'true',APNS_TEAM_ID:'TESTTEAM',APNS_KEY_ID:'TESTKEY',APNS_PRIVATE_KEY_BASE64:'test-only',APNS_ENVIRONMENT:'sandbox',APNS_TOPIC:'com.blindmatch.marriage'};
let saved,fetchBefore,logs,infoBefore,errorBefore;
test.beforeEach(()=>{
 saved=Object.fromEntries(Object.keys(configured).map(k=>[k,process.env[k]]));Object.assign(process.env,configured);
 fetchBefore=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Unmocked network forbidden');};
 globalThis.__nisfaynTestApns=()=>{throw new Error('Unmocked APNs forbidden');};
 logs=[];infoBefore=console.info;errorBefore=console.error;console.info=(...args)=>logs.push(args.join(' '));console.error=(...args)=>logs.push(args.join(' '));
});
test.afterEach(()=>{
 for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;
 globalThis.fetch=fetchBefore;delete globalThis.__nisfaynTestApns;console.info=infoBefore;console.error=errorBefore;
});
async function invoke(fn,{method='POST',authorization='Bearer test-worker-secret'}={}){
 const response={code:0,headers:{},body:null,setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await fn({method,headers:{authorization}},response);return response;
}
const reply=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const job=()=>({id:randomUUID(),leaseId:randomUUID(),requestId:randomUUID(),kind:'message',token:'a'.repeat(64),environment:'sandbox',expiresAt:new Date(Date.now()+60000).toISOString()});

test('maintenance and push reject missing auth, wrong methods, preview and every foreign target before HTTP',async()=>{
 for(const fn of [maintenance,push]){
  assert.equal((await invoke(fn,{method:'DELETE'})).code,405);
  assert.equal((await invoke(fn,{authorization:''})).code,401);
  assert.equal((await invoke(fn,{authorization:['Bearer test-worker-secret']})).code,401);
  for(const value of ['preview','development',undefined]){
   if(value===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=value;
   assert.equal((await invoke(fn)).code,503);
  }
  process.env.VERCEL_ENV='production';
  for(const value of ['https://xytwdgiihfmxiflwuxti.supabase.co','https://other.supabase.co',origin+'/other','https://wupkifqbwhhebwrgvwai.supabase.co.attacker.test','https://user:password@wupkifqbwhhebwrgvwai.supabase.co','not-a-url']){
   process.env.NISFAYN_SUPABASE_URL=value;assert.equal((await invoke(fn)).code,503);
  }
  process.env.NISFAYN_SUPABASE_URL=origin;
  delete process.env.NISFAYN_SERVICE_ROLE_KEY;assert.equal((await invoke(fn)).code,503);process.env.NISFAYN_SERVICE_ROLE_KEY=configured.NISFAYN_SERVICE_ROLE_KEY;
 }
 process.env.NISFAYN_PUSH_ENABLED='false';assert.equal((await invoke(push)).code,503);process.env.NISFAYN_PUSH_ENABLED='true';
 process.env.APNS_TOPIC='other.app';assert.equal((await invoke(push)).code,503);
});

test('maintenance deletes only queued exact paths then acknowledges void RPC and returns/logs counts only',async()=>{
 const path=randomUUID()+'/'+randomUUID()+'.jpg',calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,method:options.method,body:JSON.parse(options.body)});
  assert(url.startsWith(origin+'/'));assert.equal(options.headers.apikey,'sb_secret_test');assert.equal(options.headers.Authorization,undefined);
  if(url.endsWith('marriage_photo_cleanup_batch'))return reply([path]);
  if(url.endsWith('/nisfayn-private-photos'))return reply([{name:path}]);
  if(url.endsWith('marriage_photo_cleanup_done'))return new Response(null,{status:204});
  if(url.endsWith('marriage_gallery_cleanup_batch'))return reply([]);
  if(url.endsWith('marriage_portrait_cleanup_batch'))return reply([]);
  if(url.endsWith('nisfayn_chat_cleanup_batch'))return reply([]);
  if(url.endsWith('marriage_verification_cleanup_batch'))return reply([]);
  if(url.endsWith('marriage_operations_cleanup'))return reply({faultGroups:2,notificationJobs:3,privateDetail:'PRIVATE-DO-NOT-LOG'});
  throw new Error('Unexpected HTTP');
 };
 const response=await invoke(maintenance);assert.equal(response.code,200);assert.equal(response.headers['Cache-Control'],'no-store');
 assert.deepEqual(response.body,{photos:1,portraits:0,chatMedia:0,verificationEvidence:0,faultGroups:2,notificationJobs:3});
 assert.deepEqual(calls.map(c=>c.method),['POST','DELETE','POST','POST','POST','POST','POST','POST']);
 assert.deepEqual(calls[1].body,{prefixes:[path]});assert.deepEqual(calls[2].body,{paths:[path]});
 assert(!logs.join().includes(path));assert(!logs.join().includes('PRIVATE'));assert(!logs.join().includes(configured.CRON_SECRET));
});

test('maintenance never acknowledges failed Storage removal or unsafe cleanup paths',async()=>{
 for(const paths of [[randomUUID()+'/'+randomUUID()+'.jpg'],[''],['../'],['private-folder/'],{path:'wrong-shape'}]){
  const calls=[];globalThis.fetch=async(url)=>{calls.push(url);if(url.endsWith('marriage_photo_cleanup_batch'))return reply(paths);return new Response(null,{status:500});};
  const response=await invoke(maintenance);assert.equal(response.code,503);
  assert(!calls.some(url=>url.endsWith('marriage_photo_cleanup_done')));
  assert.equal(calls.length,Array.isArray(paths)&&paths[0].endsWith('.jpg')?2:1);
 }
 globalThis.fetch=async(url)=>url.endsWith('_cleanup_batch')?reply([]):reply({faultGroups:-1,notificationJobs:0});
 assert.equal((await invoke(maintenance)).code,503);
});

test('portrait maintenance removes only exact scoped paths and retains failures for retry',async()=>{
 const path='test/reham/'+randomUUID()+'-clear.jpg';
 for(const fail of [false,true]){
  const calls=[];globalThis.fetch=async(url,options)=>{
   calls.push({url,body:JSON.parse(options.body)});
   if(url.endsWith('marriage_photo_cleanup_batch')||url.endsWith('marriage_gallery_cleanup_batch'))return reply([]);
   if(url.endsWith('marriage_portrait_cleanup_batch'))return reply([path]);
   if(url.endsWith('/nisfayn-profile-portraits'))return fail?new Response(null,{status:503}):reply([]);
   if(url.endsWith('marriage_portrait_cleanup_done'))return new Response(null,{status:204});
   if(url.endsWith('nisfayn_chat_cleanup_batch'))return reply([]);
   if(url.endsWith('marriage_verification_cleanup_batch'))return reply([]);
   if(url.endsWith('marriage_operations_cleanup'))return reply({faultGroups:0,notificationJobs:0});
   throw Error('Unexpected HTTP');
  };
  const result=await invoke(maintenance);assert.equal(result.code,fail?503:200);
  assert.deepEqual(calls.find(c=>c.url.endsWith('/nisfayn-profile-portraits')).body,{prefixes:[path]});
  assert.equal(calls.some(c=>c.url.endsWith('marriage_portrait_cleanup_done')),!fail);
  if(!fail)assert.equal(result.body.portraits,1);
  assert(!logs.join().includes(path));
 }
 const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return reply(url.endsWith('marriage_portrait_cleanup_batch')?['test/reham/../other.jpg']:[]);};
 assert.equal((await invoke(maintenance)).code,503);assert(!calls.some(url=>url.includes('/storage/')));
});

test('chat cleanup removes only exact queued objects and acknowledges only successful removal',async()=>{
 for(const fail of [false,true]){
  const path='reham/'+randomUUID(),calls=[];
  globalThis.fetch=async(url,options)=>{
   calls.push({url,body:JSON.parse(options.body)});
   if(url.endsWith('nisfayn_chat_cleanup_batch'))return reply([path]);
   if(url.endsWith('_cleanup_batch'))return reply([]);
   if(url.endsWith('/nisfayn-test-chat'))return fail?new Response(null,{status:503}):reply([]);
   if(url.endsWith('nisfayn_chat_cleanup_done'))return new Response(null,{status:204});
   if(url.endsWith('marriage_operations_cleanup'))return reply({faultGroups:0,notificationJobs:0});
   throw Error('Unexpected HTTP');
  };
  const result=await invoke(maintenance);assert.equal(result.code,fail?503:200);
  assert.deepEqual(calls.find(c=>c.url.endsWith('/nisfayn-test-chat')).body,{prefixes:[path]});
  assert.equal(calls.some(c=>c.url.endsWith('nisfayn_chat_cleanup_done')),!fail);
  if(!fail)assert.equal(result.body.chatMedia,1);
  assert(!logs.join().includes(path));
 }
 for(const invalid of ['reham/../private','reham/','other/'+randomUUID()]){
  const calls=[];globalThis.fetch=async url=>{calls.push(url);return reply(url.endsWith('nisfayn_chat_cleanup_batch')?[invalid]:[]);};
  assert.equal((await invoke(maintenance)).code,503);assert(!calls.some(url=>url.includes('/storage/')));
 }
});

test('push validates each lease immediately before delivery and persists invalid/retry outcomes with claimed token',async()=>{
 const jobs=[job(),job(),job()],sent=[],finished=[];let closed=false;
 globalThis.__nisfaynTestApns=config=>{assert.equal(config.environment,'sandbox');return{send:async j=>{sent.push(j.id);return j.id===jobs[1].id?'invalid':'retry';},close:()=>{closed=true;}};};
 globalThis.fetch=async(input,options)=>{
  const url=String(input);assert(url.startsWith(origin+'/rest/v1/rpc/'));const body=JSON.parse(options.body);
  if(url.endsWith('marriage_push_claim')){assert.deepEqual(body,{delivery_environment:'sandbox',batch_size:20});return reply(jobs);}
  if(url.endsWith('marriage_push_validate'))return reply(body.job_id!==jobs[0].id);
  if(url.endsWith('marriage_push_finish')){finished.push(body);return reply(true);}
  throw new Error('Unexpected HTTP');
 };
 const response=await invoke(push);assert.equal(response.code,200);assert(closed);
 assert.deepEqual(response.body,{claimed:3,sent:0,retry:1,invalid:1,failed:0,revoked:1});
 assert.deepEqual(sent.sort(),jobs.slice(1).map(j=>j.id).sort());
 assert.equal(finished.length,3);assert(finished.every(result=>result.device_token==='a'.repeat(64)&&jobs.some(j=>j.id===result.job_id&&j.leaseId===result.lease)));
 for(const j of jobs)assert(!logs.join().includes(j.requestId));assert(!logs.join().includes('a'.repeat(64)));
});

test('push waits for all started deliveries before closing transport when one completion RPC fails',async()=>{
 const jobs=[job(),job()];let completed=false,closed=false;
 globalThis.__nisfaynTestApns=()=>({send:async()=> 'sent',close:()=>{assert(completed);closed=true;}});
 globalThis.fetch=async(input,options)=>{
  const url=String(input),body=JSON.parse(options.body);
  if(url.endsWith('marriage_push_claim'))return reply(jobs);
  if(url.endsWith('marriage_push_validate'))return reply(true);
  if(body.job_id===jobs[0].id)return new Response(null,{status:503});
  await new Promise(resolve=>setTimeout(resolve,10));completed=true;return reply(true);
 };
 const result=await invoke(push);assert.equal(result.code,503);assert(closed);assert.deepEqual(result.body,{error:'push_delivery_unavailable'});
});

test('health is a no-store liveness response without credentials or claims of database delivery',async()=>{
 assert.equal((await invoke(health,{method:'POST'})).code,405);
 const response=await invoke(health,{method:'GET'});assert.equal(response.code,200);assert.equal(response.headers['Cache-Control'],'no-store');
 assert.deepEqual(Object.keys(response.body).sort(),['environment','release','service','status']);assert.equal(response.body.service,'nisfayn-admin');assert(!JSON.stringify(response.body).includes('secret'));
});
