import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { mergeMessages } from '../src/community/timeline.ts';
import { refreshHistoricalMessages } from '../src/community/messageRefresh.ts';

const compile=async path=>ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const dataUrl=url((await compile('../src/community/data.ts'))
 .replace("'./simulation'",JSON.stringify(new URL('../src/community/simulation.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
 .replace("'../family/model'",JSON.stringify(new URL('../src/family/model.ts',import.meta.url).href))
 .replace("'../readiness/model'",JSON.stringify(new URL('../src/readiness/model.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/cloud["'];?/g,'')
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\/updates["'];?/,'')
 .replace('"../compatibility/model"',JSON.stringify(new URL('../src/compatibility/model.ts',import.meta.url).href))
 .replace('"../beena/model"',JSON.stringify(new URL('../src/beena/model.ts',import.meta.url).href))
 .replace('"../compatibility/personality"',JSON.stringify(new URL('../src/compatibility/personality.ts',import.meta.url).href))
 + '\nconst cloud={}; const callRpc=(...args)=>globalThis.__chatRpc(...args); class CloudError extends Error{} const privateUpdates=()=>()=>()=>{};');
const {cloudCommunity,demoCommunity,demoProfile}=await import(dataUrl);
const {pairSource,testProfile}=await import(url((await compile('../src/testing/pair.ts'))
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/ai\/client["'];?/, "const requestAi=async()=>{throw Error('offline')};")
 .replace(/import\s*\{[^}]+\}\s*from ["']\.\.\/verification\/client["'];?/, 'const manualVerificationSource=()=>({});')
 .replace("'../family/model'",JSON.stringify(new URL('../src/family/model.ts',import.meta.url).href))
 .replace("'../readiness/model'",JSON.stringify(new URL('../src/readiness/model.ts',import.meta.url).href))
 .replace("'../community/data'",JSON.stringify(dataUrl))
 .replace("'../compatibility/model'",JSON.stringify(new URL('../src/compatibility/model.ts',import.meta.url).href))
 .replace("'../beena/model'",JSON.stringify(new URL('../src/beena/model.ts',import.meta.url).href))
 .replace(/import\s*\{[^}]+\}\s*from ['"]\.\.\/deployment['"];?/,"const marriageProjectUrl='https://test.invalid'; const marriagePublishableKey='public-test-key';")));
const jpeg=new Blob(['photo'],{type:'image/jpeg'});
const stamp=new Date().toISOString();
const row=(id,extra={})=>({id,body:'private '+id,createdAt:stamp,senderIsMe:true,...extra});

test('real chat deletion and historical refresh keep the authenticated RPC boundary',async t=>{
 const calls=[];globalThis.window={setTimeout,clearTimeout};globalThis.__chatRpc=async(...args)=>{calls.push(args);return [];};
 t.after(()=>{delete globalThis.window;delete globalThis.__chatRpc;});
 const source=cloudCommunity('member');
 await source.deleteMessage('room','message');await source.messageChanges('room',['older']);
 assert.deepEqual(calls.map(([name,payload,user])=>[name,payload,user]),[
  ['marriage_delete_message',{request_id:'room',message_id:'message'},'member'],
  ['marriage_message_changes',{request_id:'room',message_ids:['older']},'member']]);
 assert.equal(source.sendMedia,undefined,'unimplemented real media does not gain a misleading upload control');
});

test('live discovery forwards every filter in both modes and keeps request dates authoritative',async t=>{
 const calls=[];globalThis.window={setTimeout,clearTimeout};
 const request={id:'request',status:'pending',createdAt:'2026-01-01T12:00:00Z',expiresAt:'2026-01-08T12:00:00Z'};
 globalThis.__chatRpc=async(name,params,user)=>{calls.push([name,params,user]);return name==='marriage_inbox'?[request]:[];};
 t.after(()=>{delete globalThis.window;delete globalThis.__chatRpc;});
 const source=cloudCommunity('member');
 const filters={city:'الرياض',search:'عضو',nationality:'السعودية',excludeCities:['جدة'],onlineOnly:true,minFit:70,work:'A',availableOnly:true};
 await source.discover({...filters,mode:'recommended'});await source.discover({...filters,mode:'all'});
 assert.deepEqual(calls.slice(0,2),['recommended','all'].map(mode=>['marriage_browse',{options:{...filters,mode}},'member']));
 assert.deepEqual(await source.inbox(),[request]);
 await source.requestHistory();assert.deepEqual(calls.at(-1),['marriage_request_history',{},'member']);
 assert.equal(source.callPermission,undefined,'ordinary live calls use the recipient answer flow');
 assert.equal(source.sendMedia,undefined,'test-only attachments stay absent in live capabilities');
});

test('pair sends explicit once metadata, downloads binary without caching and never retries a consumed request',async t=>{
 const profile=testProfile('reham'),calls=[];
 const state={actor:'reham',matched:true,profiles:{reham:profile},profileRevision:'r1',messages:[],read:{},agree:{},stage:0};
 let opened=false,ackOnly=false;
 t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
  calls.push([endpoint,options]);
  if(endpoint.endsWith('?action=upload'))return Response.json(state);
  const request=JSON.parse(options.body);
  if(endpoint.endsWith('?action=media_download')){
   if(request.payload.viewOnce&&opened)return Response.json({error:'فُتحت الصورة سابقًا.'},{status:409});
   if(request.payload.viewOnce)opened=true;
   return new Response(jpeg,{headers:{'Content-Type':'image/jpeg'}});
  }
  if(request.action==='message_delete'){
   state.messages=[{id:request.payload.id,sender:'reham',body:'must be stripped',createdAt:stamp,deletedAt:stamp,attachment:{id:'photo'}}];
   return Response.json(ackOnly?{ok:true}:state);
  }
  assert.equal(request.action,'state');return Response.json(state);
 });
 const source=pairSource({actor:'reham',session:'session',profile,profileRevision:'r0'},()=>profile).source;
 await source.sendMedia('tester-pair',jpeg,'photo','once',undefined,true);
 assert.equal(calls.at(-1)[1].headers['x-view-once'],'true');
 const count=calls.length;
 await assert.rejects(source.sendMedia('tester-pair',new Blob(['audio'],{type:'audio/webm'}),'audio','a',2,true),/للصور فقط/);
 assert.equal(calls.length,count);
 const standard=await source.mediaUrl('tester-pair','normal');URL.revokeObjectURL(standard);
 assert.equal(JSON.parse(calls.at(-1)[1].body).payload.viewOnce,false);
 const once=await source.openMedia('tester-pair','once');URL.revokeObjectURL(once);
 assert.equal(JSON.parse(calls.at(-1)[1].body).payload.viewOnce,true);assert.equal(calls.at(-1)[1].cache,'no-store');
 const beforeReplay=calls.length;await assert.rejects(source.openMedia('tester-pair','once'),/سابقًا/);assert.equal(calls.length,beforeReplay+1);
 await source.deleteMessage('tester-pair','mine');
 const [deleted]=await source.thread('tester-pair');assert.equal(deleted.body,'تم حذف هذه الرسالة');assert.equal(deleted.attachment,null);
 ackOnly=true;await source.deleteMessage('tester-pair','mine');
 assert.equal((await source.thread('tester-pair'))[0].deletedAt,stamp,'ACK-only response invalidates the cache instead of becoming state');
});

test('demo media shares view-once and deletion behavior without retaining deleted files or quotes',async()=>{
 const source=demoCommunity(()=>demoProfile),id='demo-mutual';
 await assert.rejects(source.deleteMessage(id,'welcome'),/رسائلك فقط/);
 await source.send(id,'sensitive text','mine');await source.send(id,'reply','reply','mine');
 await source.deleteMessage(id,'mine');await source.deleteMessage(id,'mine');
 const rows=await source.thread(id);
 assert.equal(rows.find(x=>x.id==='mine').body,'تم حذف هذه الرسالة');
 assert.equal(rows.find(x=>x.id==='reply').reply.body,'تم حذف هذه الرسالة');
 await assert.rejects(source.send(id,'reply again','reply2','mine'),/الأصلية غير متاحة/);
 await source.sendMedia(id,jpeg,'photo','photo',undefined,false);
 const image=await source.mediaUrl(id,'photo');URL.revokeObjectURL(image);
 await source.deleteMessage(id,'photo');await assert.rejects(source.mediaUrl(id,'photo'),/غير متاح/);
 await source.sendMedia(id,jpeg,'photo','once',undefined,true);
 await assert.rejects(source.mediaUrl(id,'once'),/لمرة واحدة/);
 await assert.rejects(source.openMedia(id,'once'),/لم تعد متاحة/,'sender cannot open their own one-view photo');
 await source.send(id,'old','old');(await source.thread(id)).find(x=>x.id==='old').createdAt='2020-01-01T00:00:00Z';
 await assert.rejects(source.deleteMessage(id,'old'),/٤٨ ساعة/);
});

test('history batches only older loaded IDs; tombstones redact old quotes and defeat stale responses',async()=>{
 const previous=Array.from({length:207},(_,i)=>row(String(i))),page=previous.slice(-5),calls=[];
 const source={messageChanges:async(_request,ids)=>{calls.push(ids);return ids.map(id=>row(id,id==='0'?{deletedAt:stamp}:{}));}};
 const history=await refreshHistoricalMessages(source,'room',previous,page);
 assert.deepEqual(calls.map(x=>x.length),[100,100,2]);assert.equal(history.length,202);
 const quoted=row('quote',{reply:{id:'0',body:'sensitive text',senderIsMe:true}});
 const merged=mergeMessages([...previous,quoted],[...history,...page]);
 assert.equal(merged.find(x=>x.id==='quote').reply.body,'تم حذف هذه الرسالة');
 const stale=mergeMessages(merged,[row('0')]);assert.equal(stale.find(x=>x.id==='0').body,'تم حذف هذه الرسالة');
 const opened=row('photo',{attachment:{id:'media',viewOnce:true,openedAt:stamp}});
 assert.equal(mergeMessages([opened],[row('photo',{attachment:{id:'media',viewOnce:true}})])[0].attachment.openedAt,stamp);
 await assert.rejects(refreshHistoricalMessages({},'room',previous,page),/تحديث/);
});
