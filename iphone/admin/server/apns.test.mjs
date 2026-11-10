import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source=await readFile(new URL('./apns.ts',import.meta.url),'utf8');
const {providerToken,pushPayload,classifyApns,openApns}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const config={teamId:'TEAM123456',keyId:'KEY1234567',privateKey:Buffer.from(pair.privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'),topic:'com.blindmatch.marriage',environment:'sandbox'};
const job={id:randomUUID(),leaseId:randomUUID(),requestId:randomUUID(),kind:'message',token:'a'.repeat(64),environment:'sandbox',expiresAt:new Date(Date.now()+60000).toISOString()};
test('APNs provider token is signed ES256 P1363 and payload contains only generic copy',()=>{
 const token=providerToken(config,1_800_000_000_000),parts=token.split('.');
 assert.deepEqual(JSON.parse(Buffer.from(parts[0],'base64url')),{alg:'ES256',kid:config.keyId});
 assert.deepEqual(JSON.parse(Buffer.from(parts[1],'base64url')),{iss:config.teamId,iat:1_800_000_000});
 assert(verify('sha256',Buffer.from(parts.slice(0,2).join('.')),{key:pair.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
 const payload=pushPayload({...job,alias:'PRIVATE NAME',body:'PRIVATE MESSAGE'});
 assert.deepEqual(Object.keys(payload).sort(),['aps','kind','requestId']);
 assert(!JSON.stringify(payload).includes('PRIVATE'));
 assert.equal(payload.aps.sound,'default');
 assert.equal(classifyApns(410,'Unregistered'),'invalid');assert.equal(classifyApns(429),'retry');assert.equal(classifyApns(503),'retry');assert.equal(classifyApns(403),'failed');
});
test('APNs transport sends correct fixed endpoint and headers without network',async()=>{
 let captured,body,authority,closed=false;
 const connection=new EventEmitter();connection.close=()=>{closed=true;};
 connection.request=headers=>{
  captured=headers;const request=new EventEmitter();request.setEncoding=()=>{};request.close=()=>{};
  request.end=value=>{body=value;queueMicrotask(()=>{request.emit('response',{':status':200});request.emit('end');});};return request;
 };
 const apns=openApns(config,url=>{authority=url;return connection;});
 assert.equal(await apns.send(job),'sent');
 assert.equal(authority,'https://api.sandbox.push.apple.com');assert.equal(captured['apns-push-type'],'alert');assert.equal(captured['apns-topic'],config.topic);assert.equal(captured['apns-id'],job.id);
 assert.equal(JSON.parse(body).requestId,job.requestId);assert.equal(await apns.send({...job,environment:'production'}),'failed');
 const callId=randomUUID(),installation=randomUUID();
 assert.equal(await apns.sendCall({callId,installation,token:job.token,environment:'sandbox'}),'sent');
 assert.equal(captured['apns-push-type'],'voip');assert.equal(captured['apns-topic'],config.topic+'.voip');assert.equal(captured['apns-expiration'],'0');
 assert.deepEqual(JSON.parse(body),{aps:{},callId,installation});
 apns.close();assert(closed);
 const broken=new EventEmitter();broken.close=()=>{};broken.request=()=>{throw new Error('closed');};
 const failure=openApns(config,()=>broken);assert.equal(await failure.send(job),'retry');failure.close();
});

test('notification payload honors privacy, groups messages and bounds content',()=>{
 const details={preview:'private',sender:'Hidden',body:'Hidden message',badge:3,messageId:randomUUID()};
 let payload=pushPayload({...job,details});assert.equal(payload.aps.alert.title,'نصفين');assert(!JSON.stringify(payload).includes('Hidden'));
 payload=pushPayload({...job,details:{...details,preview:'name'}});assert.equal(payload.aps.alert.title,'Hidden');assert(!payload.aps.alert.body.includes('Hidden message'));
 payload=pushPayload({...job,details:{...details,preview:'content',body:'x'.repeat(1000)}});
 assert.equal(payload.aps.alert.body.length,160);assert.equal(payload.aps.badge,3);assert.equal(payload.aps['thread-id'],job.requestId);assert.equal(payload.aps.category,'NISFAYN_MESSAGE');
});

test('reminders stay silent and family alerts navigate without private chat actions',()=>{
 const reminder=pushPayload({...job,kind:'reminder'});assert.equal(reminder.aps.sound,undefined);assert.equal(reminder.aps.category,undefined);
 const roomId=randomUUID(),messageId=randomUUID();const family=pushPayload({...job,kind:'family',details:{preview:'private',roomId,messageId,badge:2}});
 assert.equal(family.roomId,roomId);assert.equal(family.messageId,messageId);assert.equal(family.aps.category,undefined);assert.equal(family.aps.alert.title,'نصفين');
});
