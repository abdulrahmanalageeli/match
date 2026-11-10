import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openApns, type ApnsConfig } from '../server/apns.js';

// The caller never supplies a destination token or caller identity.
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 const origin=req.headers.origin;
 if(origin==='capacitor://localhost'||origin==='https://nisfayn-preview.vercel.app'){
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
 }
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST')return res.status(405).end();
 const {callId,testerSession}=req.body||{};
 if(typeof callId!=='string'||!/^[0-9a-f-]{36}$/i.test(callId)||JSON.stringify(req.body).length>4096)return res.status(400).json({error:'invalid'});
 const env=process.env,url=env.NISFAYN_SUPABASE_URL,key=env.NISFAYN_SERVICE_ROLE_KEY;
 if(url!=='https://wupkifqbwhhebwrgvwai.supabase.co'||!key||env.VERCEL_ENV!=='production'||env.NISFAYN_PUSH_ENABLED?.trim()!=='true')return res.status(503).json({error:'unavailable'});
 let transport:ReturnType<typeof openApns>|undefined;
 try{
  let callerId:string|null=null;
  if(testerSession!==undefined){if(typeof testerSession!=='string'||!/^[0-9a-f]{64}$/.test(testerSession))return res.status(401).end();}
  else{
   if(typeof req.headers.authorization!=='string'||!/^Bearer [^\s]+$/.test(req.headers.authorization))return res.status(401).end();
   const user=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:req.headers.authorization},signal:AbortSignal.timeout(5000)});
   if(!user.ok)return res.status(401).end();callerId=(await user.json()).id;
   if(!callerId)return res.status(401).end();
  }
  const result=await fetch(url+'/rest/v1/rpc/nisfayn_native_call_targets',{method:'POST',headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},body:JSON.stringify({call_id:callId,caller_id:callerId,test_session:testerSession||null}),signal:AbortSignal.timeout(5000)});
  if(!result.ok)return res.status(403).json({error:'unavailable'});
  const targets=await result.json() as {token:string;environment:'production'|'sandbox';callId:string;installation:string}[];
  const config:ApnsConfig={teamId:env.APNS_TEAM_ID?.trim()||'',keyId:env.APNS_KEY_ID?.trim()||'',privateKey:env.APNS_PRIVATE_KEY_BASE64||'',topic:'com.blindmatch.marriage',environment:env.APNS_ENVIRONMENT?.trim() as ApnsConfig['environment']};
  transport=openApns(config);
  const results=await Promise.all(targets.map(target=>transport!.sendCall(target)));
  return res.status(200).json({sent:results.filter(r=>r==='sent').length});
 }catch{return res.status(503).json({error:'unavailable'});}
 finally{transport?.close();}
}
