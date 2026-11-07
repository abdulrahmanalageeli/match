import assert from 'node:assert/strict'
import Agora from 'npm:agora-token@2.0.7/src/AccessToken2.js'
import { mintVoiceToken, voiceEndpoint } from '../functions/_shared/voice.ts'

const id='f22c62d1-62c4-4d10-bd94-cd1c27a97d67'
// Synthetic test credentials only; these are not a registered Agora project.
const secret={appId:'1'.repeat(32),certificate:'2'.repeat(32)}
const grant=(now=Date.now())=>({callId:id,channel:'n_'+id.replaceAll('-',''),uid:1,ttlSeconds:120,expiresAt:new Date(now+120000).toISOString()})
const request=(body:unknown={callId:id},authorization='Bearer test-jwt',method='POST')=>new Request('https://project.test/functions/v1/voice-token',{
 method,headers:{'Content-Type':'application/json',Authorization:authorization},body:method==='POST'?(typeof body==='string'?body:JSON.stringify(body)):undefined,
})

Deno.test('official Agora builder signs channel/UID-bound, audio-only, short-lived tokens with no secret output',()=>{
 const now=Math.floor(Date.now()/1000)*1000,result=mintVoiceToken(grant(now),secret,now),parsed=new Agora.AccessToken2()
 assert(parsed.from_string(result.token));assert(parsed.verifySignature(secret.certificate));assert(!parsed.verifySignature('3'.repeat(32)))
 assert.equal(parsed.appId.toString(),secret.appId);assert.equal(parsed.issueTs,now/1000);assert.equal(parsed.expire,120)
 const rtc=parsed.getServices(Agora.kRtcServiceType);assert.equal(rtc.length,1)
 assert.equal(rtc[0].__channel_name.toString(),result.channel);assert.equal(rtc[0].__uid.toString(),'1')
 assert.deepEqual(rtc[0].__privileges,{'1':120,'2':120}) // no video/data privilege, no wildcard UID
 assert.equal(result.expiresAt,new Date(now+120000).toISOString());assert.equal('certificate' in result,false)
 for(const invalid of [{uid:0},{uid:3},{channel:'attacker-room'},{ttlSeconds:121},{ttlSeconds:0},{expiresAt:'invalid'},{expiresAt:new Date(now-1000).toISOString()}])
  assert.throws(()=>mintVoiceToken({...grant(now),...invalid},secret,now))
})

Deno.test('voice endpoint rejects malformed inputs and unavailable calls before returning any token',async()=>{
 let issued=0
 const handler=voiceEndpoint({credentials:()=>secret,authorize:async()=>{issued++;return grant()}})
 const cases:[Request,number][]=[
  [request({},'', 'OPTIONS'),204],[request({},'Bearer test-jwt','GET'),405],
  [request({callId:id},''),401],[request('not-json'),400],[request({callId:id,uid:2}),400],
  [request({callId:'bad'}),400],[request('x'.repeat(1025)),413],
 ]
 for(const [req,expected] of cases){const response=await handler(req);assert.equal(response.status,expected);assert.equal(response.headers.get('Cache-Control'),'no-store');await response.body?.cancel()}
 assert.equal(issued,0)
 const unavailable=await voiceEndpoint({credentials:()=>secret,authorize:async()=>null})(request())
 assert.equal(unavailable.status,409);assert(!('token' in await unavailable.json()))
 const wrong=await voiceEndpoint({credentials:()=>secret,authorize:async()=>({...grant(),callId:'1f2c62d1-62c4-4d10-bd94-cd1c27a97d67'})})(request())
 assert.equal(wrong.status,403);await wrong.body?.cancel()
 const failure=await voiceEndpoint({credentials:()=>secret,authorize:async()=>{throw new Error('sensitive-service-detail')}})(request())
 assert.equal(failure.status,503);assert(!(await failure.text()).includes('sensitive-service-detail'))
})

Deno.test('production auth path forwards exact user JWT, rejects bad Auth and SQL authorization, and never uses a service key',async()=>{
 const oldFetch=globalThis.fetch
 const env={SUPABASE_URL:'https://wupkifqbwhhebwrgvwai.supabase.co',SUPABASE_ANON_KEY:'test-publishable-key',SUPABASE_PUBLISHABLE_KEYS:'',AGORA_APP_ID:secret.appId,AGORA_APP_CERTIFICATE:secret.certificate}
 const original=Object.fromEntries(Object.keys(env).map(key=>[key,Deno.env.get(key)]));for(const[key,value]of Object.entries(env))Deno.env.set(key,value)
 let authStatus=200,rpcStatus=200,rpcBody:unknown=grant(),requests:string[]=[]
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const req=input instanceof Request?input:new Request(input,init);requests.push(req.url)
  assert.equal(req.headers.get('Authorization'),'Bearer exact-user-token');assert.equal(req.headers.get('apikey'),'test-publishable-key')
  if(req.url.endsWith('/auth/v1/user'))return new Response(JSON.stringify(authStatus===200?{id:'authenticated-user',aud:'authenticated',role:'authenticated'}:{message:'bad JWT'}),{status:authStatus,headers:{'Content-Type':'application/json'}})
  assert(req.url.endsWith('/rest/v1/rpc/marriage_call_token_grant'));assert.deepEqual(await req.json(),{call_id:id})
  return new Response(JSON.stringify(rpcBody),{status:rpcStatus,headers:{'Content-Type':'application/json'}})
 }
 try{
  const handler=voiceEndpoint()
  const invoke=()=>handler(request({callId:id},'Bearer exact-user-token'))
  let response=await invoke();assert.equal(response.status,200);const result=await response.json();assert(result.token.startsWith('007'));assert.equal(requests.length,2)
  for(const code of ['42501','P0001']){rpcStatus=code==='42501'?403:400;rpcBody={code,message:'private DB information'};response=await invoke();assert.equal(response.status,code==='42501'?403:429);assert(!(await response.text()).includes('private DB information'))}
  rpcStatus=200;rpcBody=null;response=await invoke();assert.equal(response.status,409);await response.body?.cancel()
  requests=[];authStatus=401;response=await invoke();assert.equal(response.status,401);assert.equal(requests.length,1);await response.body?.cancel()
 }finally{
  globalThis.fetch=oldFetch
  for(const[key,value]of Object.entries(original)){if(value===undefined)Deno.env.delete(key);else Deno.env.set(key,value)}
 }
})
