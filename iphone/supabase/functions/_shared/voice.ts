import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import Agora from 'npm:agora-token@2.0.7/src/AccessToken2.js'

type Grant = { callId:string; channel:string; uid:number; ttlSeconds:number; expiresAt:string }
type Credentials = { appId:string; certificate:string }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers={
  'Content-Type':'application/json', 'Cache-Control':'no-store',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
class VoiceError extends Error {
  constructor(readonly status:number,message:string){super(message)}
}
function configured(name:string):string{
  const value=Deno.env.get(name)?.trim()
  if(!value)throw new VoiceError(503,'خدمة الاتصال غير مهيأة.')
  return value
}
function credentials():Credentials{
  const appId=configured('AGORA_APP_ID'),certificate=configured('AGORA_APP_CERTIFICATE')
  if(!/^[0-9a-f]{32}$/i.test(appId)||!/^[0-9a-f]{32}$/i.test(certificate))
    throw new VoiceError(503,'خدمة الاتصال غير مهيأة.')
  return {appId,certificate}
}

async function authorize(req:Request,callId:string):Promise<Grant|null>{
  const bearer=/^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization')??'')
  if(!bearer)throw new VoiceError(401,'يلزم تسجيل الدخول.')
  const url=configured('SUPABASE_URL')
  // This endpoint belongs exclusively to the separate Nisfayn project.
  if(new URL(url).hostname!=='wupkifqbwhhebwrgvwai.supabase.co')
    throw new VoiceError(503,'خدمة الاتصال غير مهيأة.')
  const mapped=Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  const key=mapped?JSON.parse(mapped).default||configured('SUPABASE_ANON_KEY'):configured('SUPABASE_ANON_KEY')
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:'Bearer '+bearer[1]}}})
  const {data,error}=await client.auth.getUser(bearer[1])
  if(error||!data.user)throw new VoiceError(401,'انتهت الجلسة. سجّل الدخول مجددًا.')
  // SQL derives identity from this exact JWT, checks auth.sessions, both paid
  // memberships, account eligibility, blocks, accepted conversation and call.
  const grant=await client.rpc('marriage_call_token_grant',{call_id:callId})
  if(grant.error)throw new VoiceError(grant.error.code==='42501'?403:grant.error.code==='P0001'?429:503,
    grant.error.code==='P0001'?'انتظر قليلًا قبل إعادة المحاولة.':'المكالمة غير متاحة.')
  return grant.data
}

async function readCallId(req:Request):Promise<string>{
  const reader=req.body?.getReader()
  if(!reader)throw new VoiceError(400,'طلب الاتصال غير صالح.')
  let size=0;const chunks:Uint8Array[]=[]
  while(true){
    const {done,value}=await reader.read();if(done)break
    size+=value.length
    if(size>1024){await reader.cancel();throw new VoiceError(413,'طلب الاتصال كبير جدًا.')}
    chunks.push(value)
  }
  const bytes=new Uint8Array(size);let offset=0
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  let body:unknown
  try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new VoiceError(400,'طلب الاتصال غير صالح.')}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||
    !('callId' in body)||typeof body.callId!=='string'||!uuid.test(body.callId))
    throw new VoiceError(400,'طلب الاتصال غير صالح.')
  return body.callId.toLowerCase()
}

export function mintVoiceToken(grant:Grant,secret:Credentials,now=Date.now()){
  if(!uuid.test(grant.callId)||grant.channel!=='n_'+grant.callId.replaceAll('-','')||
    ![1,2].includes(grant.uid)||!Number.isInteger(grant.ttlSeconds)||grant.ttlSeconds<1||grant.ttlSeconds>120)
    throw new VoiceError(503,'تعذّر تأمين المكالمة.')
  const ttl=Math.min(grant.ttlSeconds,Math.floor((Date.parse(grant.expiresAt)-now)/1000))
  if(!Number.isFinite(ttl)||ttl<1)throw new VoiceError(409,'انتهت صلاحية طلب الاتصال.')
  // Official Agora AccessToken2 builder, with only join and microphone privileges.
  // Privilege/token durations are seconds from issue time, not Unix timestamps.
  const token=new Agora.AccessToken2(secret.appId,secret.certificate,Math.floor(now/1000),ttl)
  const rtc=new Agora.ServiceRtc(grant.channel,grant.uid)
  rtc.add_privilege(Agora.ServiceRtc.kPrivilegeJoinChannel,ttl)
  rtc.add_privilege(Agora.ServiceRtc.kPrivilegePublishAudioStream,ttl)
  token.add_service(rtc)
  const signed=token.build()
  if(!signed)throw new VoiceError(503,'تعذّر تأمين المكالمة.')
  return {appId:secret.appId,channel:grant.channel,uid:grant.uid,token:signed,
    expiresAt:new Date((Math.floor(now/1000)+ttl)*1000).toISOString(),callId:grant.callId}
}

// Dependencies are injected only by isolated tests; the deployed handler always
// uses authenticated Supabase RPCs and environment-only Agora credentials.
export function voiceEndpoint(deps={authorize,credentials}){
  return async(req:Request):Promise<Response>=>{
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
    try{
      if(req.method!=='POST')throw new VoiceError(405,'طريقة الطلب غير مدعومة.')
      if(!/^Bearer [^\s]+$/i.test(req.headers.get('Authorization')??''))throw new VoiceError(401,'يلزم تسجيل الدخول.')
      const callId=await readCallId(req)
      const secret=deps.credentials()
      const grant=await deps.authorize(req,callId)
      if(!grant)throw new VoiceError(409,'المكالمة غير متاحة أو انتهت.')
      if(grant.callId!==callId)throw new VoiceError(403,'المكالمة غير متاحة.')
      return new Response(JSON.stringify(mintVoiceToken(grant,secret)),{status:200,headers})
    }catch(error){
      const known=error instanceof VoiceError
      // Never echo SDK errors, tokens, JWTs or secret configuration.
      return new Response(JSON.stringify({error:known?error.message:'تعذّر الاتصال مؤقتًا.'}),
        {status:known?error.status:503,headers})
    }
  }
}
