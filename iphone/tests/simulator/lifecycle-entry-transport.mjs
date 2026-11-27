const copy=value=>structuredClone(value);
const actor=()=>window.__case.actor.account;
const user=()=>({...actor(),app_metadata:{signupConsent:actor().agreements}});
function phase(value){window.__phase=value;}
async function answer(name,p={}){
 const sample=window.__case;
 window.__trace.push([name,window.__phase,p.command||p.action||p.options?.mode||'']);
 switch(name){
  case 'marriage_social_onboarding_status':return {required:false};
  case 'marriage_state':return copy(sample[window.__phase]);
  case 'marriage_push_privacy':return {configured:true,preview:'private'};
  case 'marriage_push_controls':case 'marriage_push_settings':return {};
  case 'marriage_onboarding_draft':
    if(p.command==='save')window.__draft=copy(p.payload);
    if(p.command==='delete')window.__draft=null;
    return p.command==='load'?window.__draft:null;
  case 'marriage_portrait_stage_resume':return window.__phase==='approved'?null:copy(sample.stage);
  case 'marriage_apply':{
   const orig=sample.actor.profile, given=p.payload;
   if(window.__phase!=='draft'||given.gender!==orig.gender||given.contact!==orig.contact||given.displayName!==orig.displayName||given._applicationIntegrity!==orig._applicationIntegrity||given._membershipReadiness.family!==orig._membershipReadiness.family||given.signupConsents.photo!==true||given.signupConsents.sensitivePublication!==false)throw Error('Submitted profile diverges from earlier UI run');
   for(const key of ['surveyAnswers','personalityAnswers'])if(JSON.stringify(Object.entries(given[key]).sort())!==JSON.stringify(Object.entries(orig[key]).sort()))throw Error('Assessment mismatch');
   phase('pending');return copy(sample.pending);
  }
  case 'marriage_portrait_stage_action':
    if(p.action!=='finalize'||p.photo!==sample.stage.id||window.__phase!=='pending')throw Error('Incorrect finalization');
    await new Promise(ok=>window.__releasePhoto=ok);
    phase('approved');return copy(sample.approved.profile.portrait);
  case 'marriage_browse':
   if(window.__phase!=='approved')throw Error('Premature discovery');
   return copy(sample.cards);
  case 'marriage_unread_count':return 0;
  case 'marriage_heartbeat':case 'marriage_launch_note':case 'marriage_call_state':case 'marriage_portrait_view':case 'marriage_push_updates':return null;
  case 'marriage_member_conduct':case 'wudayn_publications':case 'marriage_inbox':case 'marriage_notifications':case 'marriage_conversation_pilot_notices':case 'marriage_request_history':return [];
  default:throw Error('Unimplemented local RPC '+name);
 }
}
export function createClient(){
 return {
  auth:{getSession:async()=>({data:{session:{user:user(),access_token:'fixture'}}}),getUser:async()=>({data:{user:user()}})},
  channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:async()=>{},
  storage:{from:()=>({download:async()=>{window.__downloadedPhoto=true;return {data:new Blob(['fixture'],{type:'image/jpeg'})};},createSignedUrl:async()=>({data:null})})},
  rpc(name,p){const result=answer(name,p).then(data=>({data,error:null}));result.abortSignal=()=>result;return result;},
  functions:{invoke:async()=>({data:null,error:null})}
 };
}
