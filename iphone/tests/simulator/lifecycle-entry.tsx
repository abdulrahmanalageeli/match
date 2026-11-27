import {createRoot} from 'react-dom/client';
import App from '../../src/App';
import {initialDraft} from '../../src/onboarding/draft';
import {intakeVault,pendingIntake} from '../../src/onboarding/persistence';
import {initializeDevicePreferences} from '../../src/settings/preferences';
import '../../src/design.css';
import '../../src/flows.css';
import '../../src/screens.css';
import '../../src/motion.css';
import '../../src/mobile/keyboard.css';
import '../../src/onboarding/arrivalJourney.css';
import '../../src/onboarding/arrivalAssessments.css';
import '../../src/community/arrivalDiscovery.css';
import '../../src/community/arrivalChat.css';
import '../../src/arrivalSurfaces.css';
import '../../src/typography.css';
import '../../src/accessibility.css';

const audit=window as Window & Record<string,any>;
const root=createRoot(document.getElementById('root')!);
const loopback='http://127.0.0.1:18767';
const fetchLocal=window.fetch.bind(window);
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
const step=(value:string)=>{audit.lifecycleEntryStep=value;};
const ensure=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
async function wait<T>(read:()=>T|undefined|null|false,label:string){
  for(let i=0;i<440;i++){const value=read();if(value)return value;await tick();}
  throw Error(audit.lifecycleEntryStep+' / '+label+' / '+document.body.innerText.slice(-750)+' / '+JSON.stringify(audit.__trace?.slice(-5)));
}
const buttons=(scope:ParentNode=document)=>Array.from(scope.querySelectorAll<HTMLButtonElement>('button'));
function dismissOptionalDeviceOffer(){
  document.querySelector<HTMLButtonElement>('dialog.device-unlock-offer[open] .f-secondary')?.click();
}
window.fetch=async(input,options)=>{
  const url=new URL(input instanceof Request?input.url:String(input),document.baseURI);
  if(url.pathname==='/api/interview')return Response.json({document:null,revision:0,fallbackAvailable:true});
  if(url.origin===loopback && /^\/entry\/(man|woman)$/.test(url.pathname) ||
    (url.protocol===location.protocol&&url.host===location.host) || ['blob:','data:'].includes(url.protocol))return fetchLocal(input,options);
  throw Error('Unexpected external entry fixture request '+url.hostname);
};
let mount=0;
audit.runLifecycleEntry=async(gender:'man'|'woman')=>{
  ensure(gender==='man'||gender==='woman','Unexpected gender');
  step('read free-account SQL snapshots');
  const response=await fetch(loopback+'/entry/'+gender);
  if(!response.ok)throw Error('Missing applied pair: '+response.status);
  const record=await response.json(),{profile,account}=record.actor;
  ensure(record.draft.user.id===account.id&&record.draft.user.applicationStatus==='draft'&&record.pending.user.applicationStatus==='pending'&&record.approved.user.applicationStatus==='approved'&&!record.approved.membership.active,'SQL lifecycle responses');
  const other=record.cards.find((peer:any)=>peer.id!==account.id&&peer.eligible);
  ensure(other,'Missing reciprocal directory member');
  audit.__case=record;audit.__phase='draft';audit.__trace=[];audit.__releasePhoto=undefined;audit.__downloadedPhoto=false;
  initializeDevicePreferences();
  localStorage.setItem('wudayn.feature-overview.v1','seen');
  // Treat this as a fresh return to the submitted signup's account draft. The signup fixture can have left a Keychain checkpoint under the same synthetic UUID.
  if(pendingIntake.available(account.id))await pendingIntake.clear(account.id);
  const {_answerProvenance,_membershipReadiness,_applicationIntegrity,...memberProfile}=profile;
  const draft=initialDraft(account.id,null);
  draft.step='review';
  draft.answers={...initialDraft(account.id,memberProfile).answers,membershipReadiness:_membershipReadiness};
  draft.permissions={version:profile.signupConsents.version,assessment:profile.signupConsents.assessment,sensitiveProfile:profile.signupConsents.sensitiveProfile,sensitivePublication:profile.signupConsents.sensitivePublication};
  await intakeVault.save(draft,intakeVault.revision(account.id));
  step('real App final review');
  root.render(<App key={++mount}/>);
  const review=()=>document.querySelector('main[data-chapter=review]');
  const box=await wait(()=>Array.from(review()?.querySelectorAll<HTMLInputElement>('input[type=checkbox]')??[]).find(n=>Array.from(n.labels||[]).some(l=>l.textContent?.includes('أقرّ بصدق إجاباتي'))),'restored review declaration');
  await wait(()=>audit.__downloadedPhoto,'restored private portrait');
  ensure(!box.checked,'Integrity acceptance must reset on resume');box.click();
  const submit=await wait(()=>buttons(review()!).find(n=>!n.disabled&&n.textContent?.trim()==='إرسال طلب العضوية'),'submit application');
  await tick();submit.click();
  await wait(()=>audit.__releasePhoto,'App requested portrait finalization');
  step('application pending while photo finalizes');
  ensure(audit.__phase==='pending'&&!document.querySelector('.df-discovery,.wd-paywall')&&!document.body.innerText.includes('طلبك قيد المراجعة'),'Unexpected intermediate destination');
  audit.__releasePhoto();
  step('approved member enters free Discovery');
  const directory=await wait(()=>document.querySelector('.df-discovery .wd-membership-entry[data-tier=free]')?.closest('.df-discovery'),'free Discovery');
  ensure(document.body.innerText.includes('حُفظ ملفك وتفضيلاتك'),'Missing confirmation');
  dismissOptionalDeviceOffer();
  const all=await wait(()=>buttons(directory).find(n=>n.textContent?.trim()==='جميع الملفات'),'directory');
  all.click();
  await wait(()=>Array.from(directory.querySelectorAll('.dr-person-row')).find(row=>row.getAttribute('aria-label')==='ملف '+other.alias&&row.querySelector('[data-weekly-person]')?.getAttribute('data-weekly-person')===other.id),'exact other signup in directory');
  const events=audit.__trace.filter(([name]:[string])=>['marriage_state','marriage_apply','marriage_portrait_stage_action','marriage_browse'].includes(name));
  const apply=events.findIndex((e:string[])=>e[0]==='marriage_apply');
  const final=events.findIndex((e:string[])=>e[0]==='marriage_portrait_stage_action'&&e[1]==='pending'&&e[2]==='finalize');
  const read=events.findIndex((e:string[],i:number)=>i>final&&e[0]==='marriage_state'&&e[1]==='approved');
  const browse=events.findIndex((e:string[],i:number)=>i>read&&e[0]==='marriage_browse'&&e[1]==='approved');
  ensure(apply>=0&&final>apply&&read>final&&browse>read,'Unexpected persist/approve/discovery order');
  step('approved member reopens Discovery');
  root.render(<App key={++mount}/>);
  await wait(()=>audit.__trace.filter(([n,state]:string[])=>n==='marriage_state'&&state==='approved').length>=2,'approved session refresh');
  await wait(()=>document.querySelector('.df-discovery .wd-membership-entry[data-tier=free]'),'restored free discovery');
  step('member entry verified');
  return {gender,actor:account.id,peer:other.id,alias:other.alias,events,free:true,restored:true};
};
