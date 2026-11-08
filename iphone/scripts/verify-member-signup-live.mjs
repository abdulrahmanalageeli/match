// Opt-in release check: one synthetic, never-approved member; self-deleted in
// finally. No email, messages, calls, payments or real member mutations.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { marriageProjectUrl as url, marriagePublishableKey as key } from '../src/deployment.ts';
if(process.argv[2]!=='--run')throw Error('Pass --run for the authorized synthetic release check');
const credentials={email:'nisfayn-release-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url')};
const recoveryFile=new URL('../.vercel/release-test-account.json',import.meta.url);
writeFileSync(recoveryFile,JSON.stringify(credentials),{mode:0o600});
let token,created=false,cleaned=false;
async function request(path,body,access=token){
 const response=await fetch(url+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Origin:'https://nisfayn-preview.vercel.app',...(access?{Authorization:'Bearer '+access}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=null;}
 if(!response.ok)throw Error(path+' failed: '+response.status+' '+(data?.error_description||data?.message||data?.error||''));
 return data;
}
try{
 const result=await request('/functions/v1/member-signup',{...credentials,consent:{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true}},null);
 assert.equal(result.ok,true);created=true;
 const login=await request('/auth/v1/token?grant_type=password',credentials,null);token=login.access_token;
 assert(token);const id=login.user.id;
 assert.equal(login.user.app_metadata.emailOwnershipVerified,false);
 assert.equal(login.user.app_metadata.signupKind,'member_self_claimed_email');
 const initial=await request('/rest/v1/rpc/marriage_state',{});
 assert.equal(initial.profile,null);assert.equal(initial.user.applicationStatus,'draft');
 console.log('PASS: real member signup without email step; unverified ownership; no public profile');
 const draft={version:1,owner:id,baseline:createHash('sha256').update('new').digest('hex'),step:'story',returnToReview:false,
  permissions:{version:'2026-11-07-privacy',sensitiveProfile:false,assessment:false},
  answers:{displayName:'تحقق الإصدار',gender:'man',age:'29',city:'الرياض',profession:'',bio:'',contact:'',preferredMinAge:'18',preferredMaxAge:'65',familyPreference:'بعد التعارف الأول',interestIds:[],surveyAnswers:{}}};
 await request('/rest/v1/rpc/marriage_onboarding_draft',{command:'save',payload:draft});
 const first=await request('/rest/v1/rpc/marriage_onboarding_draft',{command:'load',payload:{}});
 assert.equal(first.answers.displayName,draft.answers.displayName);assert.equal(first.step,'story');
 await request('/auth/v1/logout?scope=local',{});
 const resumed=await request('/auth/v1/token?grant_type=password',credentials,null);token=resumed.access_token;
 const saved=await request('/rest/v1/rpc/marriage_onboarding_draft',{command:'load',payload:{}});
 assert.equal(saved.answers.displayName,draft.answers.displayName);assert.equal(saved.step,'story');
 console.log('PASS: private onboarding survives logout and fresh password login');
 const preference=await request('/rest/v1/rpc/marriage_push_settings',{});
 assert.equal(typeof preference.enabled,'boolean');
 console.log('PASS: real account notification settings are available without granting permission');
}finally{
 if(created){
  if(!token){const login=await request('/auth/v1/token?grant_type=password',credentials,null);token=login.access_token;}
  assert.equal(await request('/rest/v1/rpc/marriage_delete_account',{}),true);cleaned=true;
  console.log('PASS: synthetic member and private draft self-deleted; no approved profile created');
 }
 if(!created||cleaned)unlinkSync(recoveryFile);
}
