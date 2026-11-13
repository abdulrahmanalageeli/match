import type { VercelRequest,VercelResponse } from '@vercel/node';
import { createHash,randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { authenticaOtp } from '../server/authenticaOtp.js';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 const origin=req.headers.origin;
 if(origin!=='https://nisfayn-preview.vercel.app'&&origin!=='capacitor://localhost')return res.status(403).json({error:'not_allowed'});
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
 if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return res.status(405).end();
 const p=req.body??{};
 if(JSON.stringify(p).length>2048||!['send','verify'].includes(p.action)||typeof p.deviceId!=='string'||!/^(web|ios):[a-f0-9-]{36}$/i.test(p.deviceId))return res.status(400).json({error:'invalid'});
 const url=process.env.NISFAYN_SUPABASE_URL,key=process.env.NISFAYN_SERVICE_ROLE_KEY;
 if(url!=='https://wupkifqbwhhebwrgvwai.supabase.co'||!key||!process.env.AUTHENTICA_KEY?.trim())return res.status(503).json({error:'unavailable'});
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
 const deviceHash=hash('wudayn-device-v1:'+p.deviceId);
 async function rpc(action:string,payload:Record<string,unknown>){const result=await client.rpc('marriage_signup_sms',{action,payload});if(result.error)throw Error(result.error.message.includes('rate_limited')?'rate_limited':'expired');return result.data;}
 try{
  if(p.action==='send'){
   if(typeof p.email!=='string'||p.email.length>254||!/^\S+@\S+\.\S+$/.test(p.email)||typeof p.phone!=='string'||!/^\+9665\d{8}$/.test(p.phone)||p.consent!==true||p.consentVersion!=='signup-sms-device-v1')return res.status(400).json({error:'invalid'});
   const network=req.headers['x-vercel-forwarded-for'];
   if(typeof network!=='string'||!network)return res.status(503).json({error:'unavailable'});
   const proof=randomBytes(32).toString('hex'),proofHash=hash(proof);
   const state=await rpc('start',{proofHash,deviceHash,consentVersion:p.consentVersion,email:p.email.trim().toLowerCase(),phone:p.phone,networkHash:hash(key+':sms-network:'+network.split(',')[0].trim())});
   await authenticaOtp('send',p.phone);await rpc('sent',{proofHash});
   return res.status(200).json({proof,duplicateDevice:state.duplicateDevice===true,retryAfter:60});
  }
  if(typeof p.proof!=='string'||!/^[a-f0-9]{64}$/.test(p.proof)||typeof p.otp!=='string'||!/^\d{4,8}$/.test(p.otp))return res.status(400).json({error:'invalid'});
  const proofHash=hash(p.proof),claim=await rpc('claim',{proofHash,deviceHash});
  let verified=false;
  try{verified=await authenticaOtp('verify',claim.phone,p.otp);}
  finally{await rpc('finish',{proofHash,lease:claim.lease,verified});}
  return res.status(verified?200:422).json(verified?{verified:true}:{error:'wrong_code'});
 }catch(e){const code=e instanceof Error?e.message:'';return res.status(code==='rate_limited'?429:code==='expired'?409:503).json({error:['rate_limited','expired'].includes(code)?code:'unavailable'});}
}
