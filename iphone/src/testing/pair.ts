import { demoCommunity, demoProfile, matchesDiscoveryFilters, sanitizeMessage, searchMessageRows, type ActivityNotification, type CommunitySource, type Message, type PublicPerson, type SeriousnessAgreement } from '../community/data';
import { marriageProjectUrl, marriagePublishableKey } from '../deployment';
import { dimensions, interests, preferencePercentage, type MatchFit } from '../compatibility/model';
import { beenaRankMultiplier, compareBeena, type BeenaFit, type SharedBeenaStory } from '../beena/model';
import type { Profile, ProfilePortrait } from '../types';
import type { VoiceCall, VoiceCredentials } from '../voice/source';
import { normalizeReadinessDraft } from '../readiness/model';
import { boundedFamilyPayload, unwrapFamilyResult } from '../family/model';
import { requestAi } from '../ai/client';
import { manualVerificationSource } from '../verification/client';
import type { ManualVerificationClaim } from '../verification/model';
export type Actor='abdulrahman'|'reham';
export type TestSession={actor:Actor;session:string;profile:Profile;profileRevision:string};
type Row=Omit<Message,'reply'>&{sender:Actor;reply?:{id:string;body:string;sender:Actor;deletedAt?:string|null}|null};
type PublicTestProfile=Partial<Profile>&{beenaStory?:SharedBeenaStory};
const unavailablePairFit:MatchFit={version:'marriage-v2',band:'insufficient',provisional:true,covered:0,total:dimensions.length,
 strengths:[],discussion:[],missing:dimensions.map(item=>item.id),assessmentComplete:false,percentage:null,beena:compareBeena()};
type State={pairFit?:MatchFit;manualVerifications?:Partial<Record<Actor,ManualVerificationClaim[]>>;beenaFit?:BeenaFit;onlineActors?:Partial<Record<Actor,boolean>>;interests?:Partial<Record<Actor,boolean>>;hiddenPeople?:Partial<Record<Actor,boolean>>;allowRematch?:boolean;rematchRequestedBy?:Actor;matchCelebration?:string;celebrationSeen?:Partial<Record<Actor,string>>;profileRevision:string;rewind?:{actor:Actor;stage:number};matchedAt?:string;journeyUpdatedAt?:string;exclusive?:boolean;exclusiveConsent?:Partial<Record<Actor,boolean>>;retiredFictional?:boolean;actor:Actor;matched:boolean;seriousness?:Omit<SeriousnessAgreement,'actor'>;messages:Row[];read:Partial<Record<Actor,string>>;delivered?:Partial<Record<Actor,string>>;callPermission?:{status:'none'|'pending'|'accepted'|'declined';invitedBy?:Actor};profiles:Partial<Record<Actor,PublicTestProfile>>;stage:number;agree:Partial<Record<Actor,boolean>>;call:(VoiceCall&{caller:Actor})|null};
export const testStorage='nisfayn-private-pair-v1';
const endpoint=marriageProjectUrl+'/functions/v1/pair-test';
export async function testRequest<T>(action:string,session='',payload:unknown={},login?:{actor:Actor;password:string}):Promise<T>{
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:marriagePublishableKey},body:JSON.stringify({action,session,payload,...login}),signal:AbortSignal.timeout(12000)});
 const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'تعذّر الاتصال.'),{status:response.status});return result;
}
export function testProfile(actor:Actor,profile?:Partial<Profile>):Profile{
 const defaults:Profile={...demoProfile,beena:null,displayName:actor==='reham'?'رهام':'عبدالرحمن',gender:actor==='reham'?'woman':'man',age:actor==='reham'?27:29,
 profession:actor==='reham'?'ملف اختبار':'تطوير نصفين',bio:actor==='reham'?'ملف رهام لتجربة نصفين مع عبدالرحمن. المعلومات والإجابات الأولية أمثلة قابلة للتعديل.':'أطوّر تجربة نصفين وأختبر التعارف والمحادثات مع رهام. المعلومات والإجابات الأولية أمثلة قابلة للتعديل.',
 contact:actor+'@example.invalid',publicAvatar:actor==='reham'?{style:'hijab',skinTone:'tone_3'}:null,
 marriageBasics:actor==='reham'?demoProfile.marriageBasics:{heightCm:178,weightKg:78,nationality:'سعودي',maritalStatus:'never_married',smoking:'never',childrenCount:0,tribalBackground:'prefer_not_to_say'},
 };
 return {...defaults,...profile,gender:defaults.gender};
}
export function testPerson(actor:Actor,profile?:PublicTestProfile):PublicPerson{
 const p=profile??{};
 return {id:actor,alias:p.displayName || (actor==='reham'?'رهام':'عبدالرحمن'),age:p.age??0,city:p.city??'',occupation:p.profession??'',bio:p.bio??'',
 publicAvatar:p.publicAvatar,portrait:p.portrait,marriageBasics:p.marriageBasics,lookingFor:p.lookingFor,valuesStatement:p.valuesStatement,lifeTogether:p.lifeTogether,
 marriageIntent:p.marriageIntent,familyPreference:p.familyPreference,education:p.education,
 beenaStory:profile?.beenaStory?{scenarioId:profile.beenaStory.scenarioId,text:profile.beenaStory.text}:undefined,
 demoPhoto:actor==='abdulrahman'?'/demo/portraits/tester-shemagh.webp':undefined,interests:interests.filter(item=>p.interestIds?.includes(item.id)).map(item=>item.label),reasons:['تعارف متبادل مفعّل للاختبار']};
}
export function pairSource(account:TestSession,viewer:()=>Profile,onProfile?:(profile:Profile,revision:string)=>boolean){
 let profileRevision=account.profileRevision;
 const peer:Actor=account.actor==='reham'?'abdulrahman':'reham';
 let cached:State|null=null,at=0,pending:{version:number;promise:Promise<State>}|null=null,revision=0,acknowledging=false,deliveredId='';
 let stateSignature='',acceptedProfileSignature=JSON.stringify([account.profileRevision,account.profile]);
 const local=demoCommunity(()=>{
  const current=viewer(),own=cached?.profiles[account.actor];
  const latest=own?{...testProfile(account.actor,own),gender:current.gender}:current;
  return account.actor==='reham'?{...latest,gender:'woman'}:latest;
 },false,{
  storageKey:`nisfayn-simulation-v1-${account.actor}-${viewer().gender}`,
  externalAccepted:()=>Number(cached?.matched),
  canAct:()=>Boolean(cached)&&!cached?.exclusive,
 });
 const listeners=new Set<()=>void>();let timer:number|undefined,polling=false;
 const notify=()=>listeners.forEach(f=>f());
 function syncOwnProfile(s:State){
  const own=s.profiles[account.actor];if(!onProfile||!own||!s.profileRevision)return;
  const profile=testProfile(account.actor,own),signature=JSON.stringify([s.profileRevision,profile]);
  if(signature!==acceptedProfileSignature&&onProfile(profile,s.profileRevision)){
   acceptedProfileSignature=signature;profileRevision=s.profileRevision;
  }
 }
 function acceptState(s:State){cached=s;at=Date.now();stateSignature=JSON.stringify(s);syncOwnProfile(s);}
 async function poll(){
  if(document.hidden||polling||!listeners.size)return;
  polling=true;
  try{await state(true);}catch{/* Retry on the next tick or foreground transition. */}
  finally{polling=false;}
 }
 const visible=()=>{if(!document.hidden)void poll();};
 let retired=false;
 async function retireFictional(s:State){if(!s.exclusive){retired=false;return;}if(retired)return;retired=true;for(const c of await local.inbox())await local.act(c.id,c.status==='pending'&&c.direction==='incoming'?'decline':'cancel');}
 async function available(id?:string){const s=await state();await retireFictional(s);if(s.exclusive&&id!=='tester-pair')throw Error('أنت في تعارف حصري. أنهِ التعارف الحالي قبل بدء تواصل آخر.');return s;}
 async function state(force=false):Promise<State>{
  if(pending?.version===revision)return pending.promise;
  if(!force&&cached&&Date.now()-at<700){syncOwnProfile(cached);return cached;}
  const version=revision;
  const promise:Promise<State>=testRequest<State>('state',account.session).then(s=>{
   if(version!==revision)return state(true);
   const changed=stateSignature!==JSON.stringify(s);
   acceptState(s);acknowledge(s);if(changed)notify();return s;
  }).finally(()=>{if(pending?.promise===promise)pending=null;});
  pending={version,promise};return promise;
 }
 async function mutate(action:string,payload:unknown={}){
  const version=++revision,s=await testRequest<State>(action,account.session,payload);
  if(version===revision){revision++;acceptState(s);}
  else {revision++;await state(true);}
  notify();return s;
 }
 function acknowledge(s:State){const latest=s.messages.filter(m=>m.sender!==account.actor).at(-1);if(!latest||acknowledging||latest.id===deliveredId)return;acknowledging=true;void testRequest('delivered',account.session,{id:latest.id}).then(()=>{deliveredId=latest.id;}).catch(()=>{}).finally(()=>{acknowledging=false;});}
 const messages=(s:State)=>s.messages.map(m=>sanitizeMessage({...m,reply:m.reply?{id:m.reply.id,body:m.reply.body,senderIsMe:m.reply.sender===account.actor,deletedAt:m.reply.deletedAt}:null,senderIsMe:m.sender===account.actor,deliveredAt:m.sender===account.actor&&s.delivered?.[peer]&&s.delivered[peer]!>=m.createdAt?s.delivered[peer]:null,readAt:m.sender===account.actor&&s.read[peer]&&s.read[peer]!>=m.createdAt?s.read[peer]:null}));
 const permission=(s:State)=>({status:s.callPermission?.status||'none' as const,direction:s.callPermission?.invitedBy?(s.callPermission.invitedBy===account.actor?'outgoing' as const:'incoming' as const):undefined});
 const unread=(s:State)=>s.messages.filter(m=>!m.deletedAt&&m.sender!==account.actor&&(!s.read[account.actor]||m.createdAt>s.read[account.actor]!)).length;
 function requirePairChat(s:State){if(!s.matched||!s.seriousness||!['accepted','family'].includes(s.seriousness.status)||s.seriousness.status==='accepted'&&(!s.seriousness.deadline||Date.parse(s.seriousness.deadline)<=Date.now()))throw Object.assign(Error('المحادثة غير متاحة.'),{status:403});}
 const progress=(s:State)=>({rewindMine:s.rewind?.actor===account.actor,rewindPeer:s.rewind?.actor===peer,updatedAt:s.journeyUpdatedAt,stage:s.stage,exclusive:!!s.exclusive,consentMine:!!s.exclusiveConsent?.[account.actor],consentPeer:!!s.exclusiveConsent?.[peer],mine:s.stage===0?!!s.exclusiveConsent?.[account.actor]:!!s.agree[account.actor],peer:s.stage===0?!!s.exclusiveConsent?.[peer]:!!s.agree[peer]});
 const call=(s:State):VoiceCall|null=>s.call?{...s.call,direction:s.call.caller===account.actor?'outgoing':'incoming',person:testPerson(peer,s.profiles[peer])}:null;
 const person=(s:State):PublicPerson=>({...testPerson(peer,s.profiles[peer]),manualVerifications:s.manualVerifications?.[peer],online:s.onlineActors?.[peer]===true,interested:s.interests?.[account.actor]===true,
  fit:s.pairFit??unavailablePairFit});
 async function mediaDownload(id:string,attachmentId:string,viewOnce:boolean){
  if(id!=='tester-pair')throw Error('الملف غير متاح.');
  const response=await fetch(endpoint+'?action=media_download',{method:'POST',headers:{apikey:marriagePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({session:account.session,payload:{id:attachmentId,viewOnce}}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok){const error=await response.json().catch(()=>null);throw Error(error?.error||(viewOnce?'تعذّر فتح الصورة. إذا استُهلكت محاولة العرض، اطلب إرسالها مجددًا.':'الملف غير متاح.'));}
  const blob=await response.blob();
  if(!blob.size||!(blob.type==='image/jpeg'||!viewOnce&&blob.type.startsWith('audio/')))throw Error('الملف غير متاح.');
  if(viewOnce){revision++;cached=null;at=0;listeners.forEach(f=>f());}
  return URL.createObjectURL(blob);
 }
 const source:CommunitySource={...local,
  ...manualVerificationSource(account.session),
  suggestOpener:()=>requestAi({mode:'opener'},account.session),
  familyTestMode: true,
  familyEligibleConnection: id => id === 'tester-pair',
  async family(action,payload={}){const result=unwrapFamilyResult(await testRequest('family',account.session,{...boundedFamilyPayload(action,payload),action}));if(!['state','messages','export'].includes(action))listeners.forEach(f=>f());return result;},
  readinessTestMode: true,
  readinessEligibleConnection: id => id === 'tester-pair',
  async readiness(action,payload={}){const result=await testRequest<import('../readiness/model').ReadinessResult>('passport',account.session,{...(action==='save'?normalizeReadinessDraft(payload):payload),action});if(action!=='get'&&action!=='view')listeners.forEach(f=>f());return result;},
  async portraitState(photo){const info=await testRequest<ProfilePortrait|null>('portrait_info',account.session,{id:photo.id,metadataOnly:true});if(!info||info.id!==photo.id)throw Error('الصورة غير متاحة.');return info;},
  async portraitUrl(photo){
   const response=await fetch(endpoint+'?action=portrait_download',{method:'POST',headers:{apikey:marriagePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({session:account.session,payload:{id:photo.id}}),cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(!response.ok){const error=await response.json().catch(()=>null);throw Error(error?.error||'الصورة غير متاحة.');}
   const blob=await response.blob();if(blob.type!=='image/jpeg')throw Error('تعذّر تحميل الصورة.');return URL.createObjectURL(blob);
  },
  async setPortrait(file,blur,reveal){
   if(file.type!=='image/jpeg'||!file.size||file.size>3*1024*1024)throw Error('استخدم صورة JPEG بحجم لا يتجاوز ٣ ميغابايت.');
   if(!Number.isInteger(blur)||blur<0||blur>100)throw Error('اختر درجة تمويه من ٠ إلى ١٠٠.');
   const policy=reveal?.policy??'never';
   if(!['never','matched','serious','family'].includes(policy))throw Error('اختاري موعدًا صالحًا لإزالة التمويه.');
   if(policy!=='never'&&(!blur||!reveal?.clearBlob||reveal.clearBlob.type!=='image/jpeg'||!reveal.clearBlob.size||reveal.clearBlob.size>3*1024*1024))throw Error('اختاري الصورة مجددًا لحفظ نسخة واضحة خاصة.');
   const headers:Record<string,string>={apikey:marriagePublishableKey,'x-test-session':account.session,'x-portrait-blur':String(blur),'x-profile-revision':profileRevision,'x-portrait-reveal':policy};
   let body:Blob|FormData=file;
   if(policy!=='never') {const form=new FormData();form.append('blurred',file,'portrait.jpg');form.append('clear',reveal!.clearBlob!,'portrait-clear.jpg');body=form;}
   else headers['Content-Type']='image/jpeg';
   const response=await fetch(endpoint+'?action=portrait_upload',{method:'POST',headers,body,signal:AbortSignal.timeout(45000)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'تعذّر رفع الصورة.');
   const saved=result as State;revision++;cached=saved;at=Date.now();profileRevision=saved.profileRevision;listeners.forEach(f=>f());
   const portrait=saved.profiles[account.actor]?.portrait;if(!portrait)throw Error('لم تُحفظ الصورة. أعد المحاولة.');return portrait;
  },
  async setPortraitPolicy(photo,policy){const saved=await mutate('portrait_policy',{id:photo.id,revealPolicy:policy,expectedRevision:profileRevision});profileRevision=saved.profileRevision;const portrait=saved.profiles[account.actor]?.portrait;if(!portrait)throw Error('الصورة غير متاحة.');return portrait;},
  async removePortrait(){const saved=await mutate('portrait_remove',{expectedRevision:profileRevision});profileRevision=saved.profileRevision;},
  async heartbeat(){await mutate('heartbeat');},
  async setInterest(id,interested){if(id!==peer)return local.setInterest!(id,interested);await mutate(interested?'interest':'uninterest',{person:id});},
  async dismissPerson(id){if(id!==peer)return local.dismissPerson!(id);await mutate('dismiss_person',{person:id});},
  async reportPerson(id,reason){if(id!==peer)return local.reportPerson!(id,reason);await mutate('report_person',{person:id,reason});},
  gallery: subject=>subject && ![peer,account.actor].includes(subject as Actor) ? Promise.resolve([]) : testRequest('gallery_list',account.session,{subject}),
  async galleryUrl(photo){return (await testRequest<{url:string}>('gallery_url',account.session,{id:photo.id})).url;},
  async addGallery(file){const response=await fetch(endpoint+'?action=gallery_upload',{method:'POST',headers:{apikey:marriagePublishableKey,'Content-Type':'image/jpeg','x-test-session':account.session},body:file,signal:AbortSignal.timeout(45000)});const result=await response.json();if(!response.ok)throw Error(result.error||'تعذّر رفع الصورة.');listeners.forEach(f=>f());},
  async removeGallery(photo){await testRequest('gallery_remove',account.session,{id:photo.id});listeners.forEach(f=>f());},
  async rewindStep(id,stage,agree){return id==='tester-pair'?progress(await mutate('rewind',{stage,agree})):local.rewindStep!(id,stage,agree);},
  async request(id){const s=await available();if((await local.inbox()).filter(c=>c.status==='accepted').length+Number(s.matched)>=2)throw Error('الحد الأقصى تعارفان متزامنان.');if(id===peer){await mutate("rematch_request");return "tester-pair";}return local.request(id);},
  async demoAcceptOutgoing(id){const s=await available(id);const others=(await local.inbox()).filter(c=>c.status==='accepted'&&!['demo-mutual','demo-incoming'].includes(c.id));if(others.length+Number(s.matched)>=2)throw Error('الحد الأقصى تعارفان متزامنان.');return local.demoAcceptOutgoing!(id);},
  async noteProfileOpen(id){if(id===peer)await mutate('profile_visit',{person:id});else await local.noteProfileOpen?.(id);},
  async notifications(){const rows=await testRequest<(Omit<ActivityNotification,'person'>&{actor:Actor})[]>('notifications',account.session);const s=await state();return [...rows.map(row=>({...row,person:{...testPerson(row.actor,s.profiles[row.actor]),exclusive:s.exclusive}})),...await local.notifications?.()??[]].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},
  async readNotifications(ids){const localIds=new Set((await local.notifications?.()??[]).map(n=>n.id));await local.readNotifications?.(ids.filter(id=>localIds.has(id)));const remote=ids.filter(id=>!localIds.has(id));if(remote.length)await mutate('notifications_read',{ids:remote});},
  watch(listener){listeners.add(listener);if(timer===undefined){timer=window.setInterval(()=>void poll(),850);document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);window.addEventListener('focus',visible);void poll();}
   const stopLocal=local.watch(listener);return()=>{stopLocal();listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=undefined;document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);window.removeEventListener('focus',visible);}};},
  async discover(filters){
   const s=await state();if(s.exclusive)return [];
   const full=(await local.inbox()).filter(c=>c.status==='accepted').length+Number(s.matched)>=2;
   const partner=person(s);
   const includePeer=!s.matched&&s.allowRematch&&!s.hiddenPeople?.[account.actor]&&matchesDiscoveryFilters(partner,filters)&&
    !filters.work;
   const people=[...(includePeer?[{...partner,connectionId:s.rematchRequestedBy?'tester-pair':undefined,connectionStatus:s.rematchRequestedBy?'pending' as const:undefined}]:[]),
    ...await local.discover({...filters,offset:0,afterId:undefined})].map(p=>({...p,viewerAtCapacity:full}));
   people.sort(filters.sort==='youngest'?(a,b)=>a.age-b.age:filters.sort==='oldest'?(a,b)=>b.age-a.age:
    (a,b)=>(preferencePercentage(b.fit)??-1)*beenaRankMultiplier(b.fit?.beena)-(preferencePercentage(a.fit)??-1)*beenaRankMultiplier(a.fit?.beena));
   const offset=filters.offset??(filters.afterId?people.findIndex(p=>p.id===filters.afterId)+1:0);
   const page=people.slice(offset,offset+24);
   return page;
  },
  async inbox(){const s=await state();await retireFictional(s);const fictional=(await local.inbox()).filter(c=>c.id!=='demo-mutual'&&c.id!=='demo-incoming');return [...(s.matched||s.rematchRequestedBy?[{id:'tester-pair',celebrationKey:s.matched&&s.matchCelebration!==s.celebrationSeen?.[account.actor]?s.matchCelebration:undefined,createdAt:s.matchedAt,updatedAt:s.matchedAt,status:s.matched?'accepted' as const:'pending' as const,direction:s.rematchRequestedBy===account.actor?'outgoing' as const:'incoming' as const,person:{...person(s),exclusive:s.exclusive},lastMessage:messages(s).at(-1)||null,unreadCount:unread(s)}]:[]),...fictional];},
  async thread(id,before){if(id!=='tester-pair'){await available(id);return local.thread(id,before);}const s=await state();if(!s.matched)throw Object.assign(Error('التعارف مغلق.'),{status:403});const list=messages(s),end=before?list.findIndex(m=>m.id===before):list.length;return list.slice(Math.max(0,end-50),end);},
  async messageChanges(id,messageIds){if(id!=='tester-pair'){await available(id);return local.messageChanges!(id,messageIds);}const s=await state();if(!s.matched)throw Object.assign(Error('التعارف مغلق.'),{status:403});const ids=new Set(messageIds);return messages(s).filter(m=>ids.has(m.id));},
  async searchMessages(id,query,beforeId,kind){if(id!=='tester-pair'){await available(id);return local.searchMessages!(id,query,beforeId,kind);}const s=await state(true);requirePairChat(s);return searchMessageRows(messages(s),query,beforeId,kind);},
  async readState(id){if(id!=='tester-pair'){await available(id);return local.readState!(id);}const s=await state(true);requirePairChat(s);const rows=s.messages.filter(m=>!m.deletedAt&&m.sender!==account.actor&&(!s.read[account.actor]||m.createdAt>s.read[account.actor]!));return {firstUnreadId:rows[0]?.id??null,unreadCount:rows.length};},
  async setTyping(id,active){if(id!=='tester-pair'){await available(id);return local.setTyping!(id,active);}await testRequest('typing_set',account.session,{active});},
  async typingState(id){if(id!=='tester-pair'){await available(id);return local.typingState!(id);}return testRequest<boolean>('typing_state',account.session);},
  async deleteMessage(id,messageId){if(id!=='tester-pair'){await available(id);return local.deleteMessage!(id,messageId);}revision++;const saved=await testRequest<State|{ok:true}>('message_delete',account.session,{id:messageId});revision++;cached='messages' in saved?saved:null;at=cached?Date.now():0;listeners.forEach(f=>f());},
  async reactToMessage(id,messageId,reaction){if(id!=='tester-pair'){await available(id);return local.reactToMessage!(id,messageId,reaction);}const saved=await mutate('message_react',{id:messageId,reaction});return messages(saved).find(message=>message.id===messageId)?.reactions??[];},
  async send(id,body,clientId,replyToId){if(id!=='tester-pair'){await available(id);return local.send(id,body,clientId,replyToId);}await mutate('send',{body,clientId,replyToId});return clientId;},
  async sendMedia(id,file,kind,clientId,duration,viewOnce=false){
   if(id!=='tester-pair'){await available(id);return local.sendMedia!(id,file,kind,clientId,duration,viewOnce);}
   if(!file.size||file.size>8*1024*1024)throw Error('الحد الأقصى للملف ٨ ميغابايت.');
   if(viewOnce&&kind!=='photo')throw Error('العرض لمرة واحدة متاح للصور فقط.');
   const response=await fetch(endpoint+'?action=upload',{method:'POST',headers:{apikey:marriagePublishableKey,'Content-Type':file.type.split(';')[0],'x-test-session':account.session,'x-client-id':clientId,'x-view-once':String(viewOnce),...(kind==='audio'&&duration?{'x-duration-ms':String(Math.round(duration*1000))}:{})},body:file,signal:AbortSignal.timeout(45000)});
   const data=await response.json();if(!response.ok)throw Error(data.error||'تعذّر إرسال الملف.');revision++;cached=data;at=Date.now();listeners.forEach(f=>f());return clientId;
  },
  async mediaUrl(id,attachmentId){if(id!=='tester-pair'){await available(id);return local.mediaUrl!(id,attachmentId);}return mediaDownload(id,attachmentId,false);},
  async openMedia(id,attachmentId){if(id!=='tester-pair'){await available(id);return local.openMedia!(id,attachmentId);}return mediaDownload(id,attachmentId,true);},
  async callPermission(id){return id==='tester-pair'?permission(await state()):{status:'accepted'};},
  async requestCallPermission(id,action){if(id!=='tester-pair')throw Error('هذه شخصية توضيحية.');return permission(await mutate('permission_'+action));},
  async agreement(id){if(id!=='tester-pair')return {status:'accepted',actor:account.actor};const s=await state();return {status:'none',...s.seriousness,actor:account.actor};},
  async agree(id,action,payload={}){if(id!=='tester-pair')throw Error('هذه شخصية توضيحية.');const s=await mutate('agreement_'+action,payload);return {status:'none',...s.seriousness,actor:account.actor};},
  async markRead(id,through){if(id!=='tester-pair')return local.markRead(id,through);await mutate('read',{id:through});},
  async unreadCount(){const s=await state();await retireFictional(s);return unread(s)+await local.unreadCount();},
  async act(id,action,reason,allowRematch=false){if(id!=='tester-pair'){if(action==='accept')await available(id);return local.act(id,action,reason,allowRematch);}if(action==='accept'){if((await local.inbox()).filter(c=>c.status==='accepted').length>=2)throw Error('الحد الأقصى تعارفان متزامنان.');await mutate('rematch_accept');return;}if(action==='decline'){await mutate('rematch_decline');return;}if(['block','report','cancel'].includes(action))await mutate('close',action==='report'?{report:true,reason}:action==='block'?{block:true}:{allowRematch});},
  async acknowledgeMatch(key){const s=await state();if(key===s.matchCelebration)await mutate('match_seen',{key});else await local.acknowledgeMatch?.(key);},
  async progress(id){return id==='tester-pair'?progress(await state()):local.progress!(id);},
  async nextStep(id,stage,agree,exclusiveConsent=false){return id==='tester-pair'?progress(await mutate('step',{stage,agree,exclusiveConsent})):local.nextStep!(id,stage,agree,exclusiveConsent);},
 };
 const voice={
  async start(requestId:string,clientId:string){if(requestId!=='tester-pair')throw Error('المكالمات متاحة بين عبدالرحمن ورهام فقط.');return call(await mutate('call_start',{clientId}))!;},
  async state(_id:string|null){return call(await state());},
  async act(callId:string,action:'accept'|'decline'|'end'){return call(await mutate('call_'+action,{callId}))!;},
  credentials:(callId:string)=>testRequest<VoiceCredentials>('token',account.session,{callId}),
 };
 return {source,voice,async save(profile:Profile){const saved=await mutate('profile',{profile,expectedRevision:profileRevision});profileRevision=saved.profileRevision;return saved;},reset:()=>mutate('reset')};
}
