// Full new-member profile signup using captured real Luna responses. Auth/SMS and
// persistence are isolated; this test never creates members or sends real messages.
// Run after generating .tmp/full-interview-review/luna-session.json.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import { confirmInterviewChoices, initialInterviewDocument } from '../api/_lib/interview.mjs';
import personality from '../src/compatibility/personality-catalog.json' with { type:'json' };
import preferences from '../src/compatibility/catalog.json' with { type:'json' };
import topics from '../src/interview/catalog.json' with { type:'json' };

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const synthetic=process.argv.includes('--synthetic');
const artifacts=resolve(root,'.tmp/full-interview-review',synthetic?'simulated-navigation':'');
function navigationFixture(){
 const document=initialInterviewDocument(),initialSnapshot={document:structuredClone(document),revision:1},steps=[];
 for(let i=0;i<topics.length;i++){
  const question=structuredClone(document.currentQuestion),answer=personality.slice(i*2,i*2+2).map(q=>'غالبًا '+q.prompt).join(' ')+' أرغب بالأطفال وأفضل شريكًا يرغب بالأطفال.';
  document.turns.push({id:'nav-'+i,topic:question.topic,question:question.text,answer,skipped:false});
  document.proposals=personality.slice(0,(i+1)*2).map((q,n)=>({id:'personality:'+q.id,kind:'personality',fieldId:q.id,side:'self',values:['D'],summary:'اختيار اصطناعي لتجربة واجهة التسجيل فقط.',evidence:[{turnId:'nav-'+Math.floor(n/2),quote:document.turns[Math.floor(n/2)].answer}],needsClarification:false}));
  document.proposals.push(...['self','partner'].map(side=>({id:'children:'+side,kind:'preference',fieldId:'children_plan',side,values:['A'],summary:'اختيار اصطناعي لتجربة واجهة التسجيل فقط.',evidence:[{turnId:'nav-0',quote:'أرغب بالأطفال وأفضل شريكًا يرغب بالأطفال.'}],needsClarification:false})));
  document.currentQuestion=i+1<topics.length?{topic:topics[i+1].id,text:topics[i+1].question,suggestions:[]}:null;document.status=document.currentQuestion?'active':'review';document.lastMode='guided';
  steps.push({question,answer,snapshot:{document:structuredClone(document),revision:i+2}});
 }
 return{initialSnapshot,steps,finalSnapshot:steps.at(-1).snapshot,synthetic:true,provider:'simulated-navigation-only'};
}
const session=synthetic?navigationFixture():JSON.parse(await readFile(process.env.WUDAYN_INTERVIEW_SESSION||resolve(artifacts,'luna-session.json'),'utf8'));
const require=createRequire(import.meta.url);
const{chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
await mkdir(artifacts,{recursive:true});
if(synthetic)await writeFile(resolve(artifacts,'navigation-session.json'),JSON.stringify(session,null,2));
const owner='11111111-1111-4111-8111-111111111111',drafts=new Map(),calls=[];
const steps=session.steps;
assert(Array.isArray(steps)&&steps.length>0,'Capture an interview first, or pass --synthetic for UI navigation only');
const snapshotOf=value=>value?.snapshot??value;
const initial=snapshotOf(session.initialSnapshot??session.initial);
assert(initial?.document?.currentQuestion,'Capture must include initial snapshot');
let snapshot={document:null,revision:0},answerIndex=0,captureIndex=0;
const cloudMock=`
export const cloud={},cloudSelected=true,cloudConnection={url:'http://127.0.0.1',key:'mock'},phoneOtpEnabled=false;
export class CloudError extends Error{}
export async function cloudSessionId(){return '${owner}'}
export async function cloudLogout(){}
export async function callRpc(name,params,expectedUser){const response=await fetch('/__full-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,params,expectedUser})});if(!response.ok)throw Error('Mock draft failure');return response.json()}
export function createRecoveryClient(){return cloud}
export async function cloudRequest(){throw Error('Submitting real member data is prohibited')}
export async function resendSignupConfirmation(){throw Error('No email in this check')}
export async function sendPhoneOtp(){throw Error('No SMS in this check')}
export async function verifyPhoneOtp(){throw Error('No SMS in this check')}
`;
const apiMock=`
export class InterviewError extends Error{}
export async function requestInterview(auth,payload){const response=await fetch('/__full-interview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw Error(await response.text());const next=await response.json();window.__interviewReplay=next;window.__interviewLastAction=payload.action;if(payload.action==='answer'||payload.action==='review')window.__interviewCapturedActions=(window.__interviewCapturedActions??0)+1;return next}
`;
const fixture=`
import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';
import'/src/ambient.css';import'/src/home.css';import'/src/design.css';import'/src/flows.css';import'/src/screens.css';import'/src/motion.css';import'/src/onboarding/arrivalJourney.css';import'/src/onboarding/arrivalAssessments.css';import'/src/arrivalSurfaces.css';import'/src/typography.css';
import{GuidedApplication}from'/src/onboarding/GuidedApplication';import{initializeDevicePreferences}from'/src/settings/preferences';import{describeFit}from'/src/compatibility/model';
initializeDevicePreferences();
window.__compareSignup=profile=>{const member={...profile,id:'member'},peer={...profile,id:'peer',gender:'man'},before={...member,surveyAnswers:{},personalityAnswers:{},beena:null};return{before:describeFit(before,peer),after:describeFit(member,peer)}};
function Fixture(){const ref=useRef(null);window.__fullDraft=ref;const[saved,setSaved]=useState(null);return saved?<main dir='rtl'><h1>تم إرسال الملف</h1></main>:<GuidedApplication initial={null} previouslyApproved={false} busy={false} back={()=>{throw Error('Unexpected exit')}} onPrivacy={()=>{}} save={profile=>{window.__fullSubmitted=profile;setSaved(profile)}} draftRef={ref} draftOwner='${owner}' interviewAuth={{token:'${owner}'}}/>}
createRoot(document.getElementById('root')).render(<div className='phone-app' dir='rtl' lang='ar'><Fixture/></div>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-full-signup-interview'),server:{host:'127.0.0.1',port:5281,strictPort:true},optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},plugins:[{name:'full-signup-interview',enforce:'pre',resolveId(id){if(id==='virtual:full-signup')return '\0full-signup'},async load(id){const path=id.replaceAll('\\','/');if(path.endsWith('/src/cloud.ts'))return cloudMock;if(path.endsWith('/src/interview/api.ts'))return apiMock;if(path.endsWith('/src/motion/SkiaSurface.tsx'))return `import{createElement}from'react';export function SkiaSurface({className,fallback}){return createElement('div',{className,'aria-hidden':true},fallback)}`;if(id==='\0full-signup')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code},configureServer(dev){dev.middlewares.use(async(req,res,next)=>{
 try{
  if(['/__full-draft','/__full-interview'].includes(req.url)&&req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);res.setHeader('Content-Type','application/json');
   if(req.url==='/__full-draft'){
    assert.equal(input.expectedUser,owner);assert.equal(input.name,'marriage_onboarding_draft');calls.push(input);const{command,payload}=input.params;
    if(command==='save')drafts.set(owner,structuredClone(payload));if(command==='delete')drafts.delete(owner);
    res.end(JSON.stringify(command==='load'?drafts.get(owner)??null:{saved:true}));return;
   }
   const action=input.action;
   if(action==='start')snapshot={document:structuredClone(initial.document),revision:snapshot.revision+1};
   else if(action==='draft')snapshot={document:{...snapshot.document,draftAnswer:input.answer},revision:snapshot.revision+1};
   else if(action==='answer'){
    const step=steps[captureIndex++];answerIndex++;assert(step,'Unexpected repeated interview turn');assert.equal(step.action??'answer','answer');assert.equal(input.answer,step.answer,'Browser sends the captured persona answer');
    snapshot={document:structuredClone(snapshotOf(step).document),revision:snapshot.revision+1};
   }else if(action==='review'){
    const step=steps[captureIndex];const reviewed=snapshotOf(step?.action==='review'?steps[captureIndex++]:session.finalSnapshot??session.final??steps.at(-1));assert.equal(reviewed.document.status,'review','A review response must actually be captured; never fabricate a successful review');snapshot={document:structuredClone(reviewed.document),revision:snapshot.revision+1};
   }else if(action==='confirm')snapshot={document:confirmInterviewChoices(snapshot.document,input.choices,input.shareReview),revision:snapshot.revision+1};
   else assert.equal(action,'load','No deletion or unexpected API action during check');
   res.end(JSON.stringify(snapshot));return;
  }
  if(req.url?.startsWith('/__full-signup')){const html=await dev.transformIndexHtml('/__full-signup','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__full-signup"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);return}next();
 }catch(error){res.statusCode=500;res.end(error.message)}
})}}]});
await server.listen();
let browser,page;const errors=[],externalRequests=[],checks=[],screens=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA',reducedMotion:'no-preference'});page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)||url.protocol==='data:')return route.continue();externalRequests.push(url.origin);return route.abort()});
 async function capture(name){await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(500);await page.screenshot({path:resolve(artifacts,name+'.png')});screens.push(name)}
 async function next(chapter){await page.locator('.nf-intake-actions>button[type=submit]').click();await page.locator(`[data-chapter="${chapter}"]`).waitFor();await page.waitForTimeout(420)}
 async function choose(label,option){await page.getByRole('combobox',{name:label,exact:true}).fill(option);await page.getByRole('option',{name:option,exact:true}).click()}
 await page.goto('http://127.0.0.1:5281/__full-signup',{waitUntil:'networkidle',timeout:60000});await page.locator('[data-chapter="identity"]').waitFor();
 await page.getByLabel('الاسم المعروض',{exact:true}).fill('سارة');await page.getByRole('button',{name:'امرأة',exact:true}).click();await page.locator('input[data-field="birthDate"]').fill('1997-04-15');await choose('مدينة الإقامة','الرياض');await capture('signup-01-identity');await next('story');
 await choose('مجال العمل أو الوضع المهني','الهندسة والعمارة');await page.locator('textarea[data-field="bio"]').fill('أحب الهدوء والقراءة والمشي. أبحث عن حياة مستقرة فيها تفاهم ووضوح، مع شريك يقدّر الحوار والعمل والعائلة.');await next('details');await capture('signup-02-details');
 await next('avatar');await capture('signup-03-avatar');await next('criteria');await page.getByRole('checkbox',{name:/أوافق على تحليل إجاباتي للتوافق/}).click();await next('compatibility');await capture('signup-04-interview-choice');checks.push('fresh identity, birthday, searchable city/profession, bio, optional details/photo, and assessment consent completed');
 await page.getByRole('button',{name:'ابدأ الحوار',exact:true}).click();await page.locator('.wi-consent input').check();await page.getByRole('button',{name:'خلّنا نبدأ',exact:true}).click();
 const seen=[];let expectedDocument=initial.document;
 for(let i=0;i<steps.length;i++){
  const step=steps[i],action=step.action??'answer',expected=expectedDocument.currentQuestion;
  if(action==='answer'){
   await page.locator('#wi-answer').waitFor();const actual=await page.locator('.wi-question h1').innerText();assert.equal(actual,expected.text);assert(!seen.includes(actual),'No identical question repeats in actual conversation');seen.push(actual);
   await page.locator('#wi-answer').fill(step.answer);if(i===0||i===steps.length-1)await capture('signup-interview-'+String(i+1).padStart(2,'0'));if(new Set(expectedDocument.turns.filter(turn=>!turn.skipped).map(turn=>turn.topic)).size===topics.length&&!screens.includes('signup-interview-followup')){assert.equal(await page.locator('.wi-progress-heading>span').innerText(),'تفاصيل تكمّل الصورة');await capture('signup-interview-followup')}await page.getByRole('button',{name:'متابعة',exact:true}).click();
  }else{assert.equal(action,'review','Only captured answer/review actions are supported');await page.getByRole('button',{name:expectedDocument.status==='active'?'مراجعة ما فهمناه':'تحديث قراءة الجلسة',exact:true}).click()}
  expectedDocument=snapshotOf(step).document;
  await page.waitForFunction(({action,count,status,captured})=>window.__interviewCapturedActions===captured&&window.__interviewLastAction===action&&window.__interviewReplay?.document.turns.length===count&&window.__interviewReplay.document.status===status,{action,count:expectedDocument.turns.length,status:expectedDocument.status,captured:i+1});
  if(expectedDocument.pendingAnalysis)await page.locator(expectedDocument.status==='active'?'.wi-fallback':'.wi-notice').waitFor();
  if(expectedDocument.currentQuestion)await page.waitForFunction(question=>document.querySelector('.wi-question h1')?.textContent===question,expectedDocument.currentQuestion.text);
 }
 if(snapshotOf(steps.at(-1)).document.status==='active')await page.getByRole('button',{name:'مراجعة ما فهمناه',exact:true}).click();await page.locator('.wi-review').waitFor();
 assert.equal(await page.evaluate(()=>Object.keys(window.__fullDraft.current.answers.personalityAnswers??{}).length),0);assert.equal(await page.evaluate(()=>Object.keys(window.__fullDraft.current.answers.surveyAnswers??{}).length),0);checks.push(`${synthetic?'simulated navigation':'captured Luna'} turns rendered with animation and no identical repeats; no assessment writes before confirmation`);
 const proposed=snapshot.document.proposals,personalityProposal=(!synthetic&&proposed.find(p=>p.kind==='personality'&&p.fieldId==='planning'))||proposed.find(p=>p.kind==='personality'),excluded=proposed.find(p=>synthetic?p.kind!=='personality'&&!p.needsClarification:p.kind==='preference'&&p.side==='self'&&p.fieldId!=='children_plan'&&!p.needsClarification),reviewEdits=[];
 assert(personalityProposal,'capture contains a personality interpretation');await page.getByRole('button',{name:'اختيار الواضح منها',exact:true}).click();
 const personalityCard=page.locator('.wi-proposal').filter({has:page.locator('.wi-personality-statement',{hasText:personality.find(q=>q.id===personalityProposal.fieldId).prompt})});await personalityCard.locator('details>summary').click();const changed=!synthetic&&personalityProposal.fieldId==='planning'?'D':personalityProposal.values[0]==='C'?'D':'C';await personalityCard.locator('select').selectOption(changed);await personalityCard.locator('input[type=checkbox]').check();reviewEdits.push({fieldId:personalityProposal.fieldId,proposed:personalityProposal.values[0],confirmed:changed});
 if(!synthetic){const social=proposed.find(p=>p.kind==='personality'&&p.fieldId==='social_energy');if(social){const card=page.locator('.wi-proposal').filter({has:page.locator('.wi-personality-statement',{hasText:personality.find(q=>q.id==='social_energy').prompt})});await card.locator('details>summary').click();await card.locator('select').selectOption('B');await card.locator('input[type=checkbox]').check();reviewEdits.push({fieldId:social.fieldId,proposed:social.values[0],confirmed:'B',explicitlyReviewed:true})}}
 if(excluded){const rendered=['personality','self','partner','importance'].flatMap(group=>proposed.filter(p=>group==='personality'?p.kind==='personality':p.kind!=='personality'&&p.side===group));await page.locator('.wi-proposal').nth(rendered.findIndex(p=>p.id===excluded.id)).locator('input[type=checkbox]').uncheck();}
 await personalityCard.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(artifacts,'signup-05-review-interpretation.png')});
 assert.equal(await page.evaluate(()=>Object.keys(window.__fullDraft.current.answers.personalityAnswers??{}).length),0);await page.locator('.wi-review>.wi-button-primary').click();await page.locator('.wi-complete').waitFor();await page.locator('.wi-complete>.wi-button-primary').click();await page.locator('[data-chapter="compatibility"]').waitFor();
 const confirmed=snapshot.document.confirmed;assert(confirmed.length>0);if(excluded)assert(!confirmed.some(p=>p.id===excluded.id));assert.equal(await page.evaluate(id=>window.__fullDraft.current.answers.personalityAnswers[id],personalityProposal.fieldId),changed);await capture('signup-06-confirmed-preferences');
 const orderedPreferences=['plans','timing','values','lifestyle','communication','personality'].flatMap(category=>preferences.dimensions.filter(d=>d.category===category));
 const firstMissing=orderedPreferences.flatMap(d=>[{d,side:'self',key:d.id},{d,side:'partner',key:d.partnerId}]).find(({key})=>!confirmed.some(p=>p.kind==='preference'&&(p.side==='self'?p.fieldId:preferences.dimensions.find(d=>d.id===p.fieldId)?.partnerId)===key));
 if(firstMissing&&await page.locator('.compat-panel h3').count())assert.equal(await page.locator('.compat-panel h3').innerText(),firstMissing.side==='self'?(firstMissing.d.id==='wife_work'?'هل ترغبين في العمل بعد الزواج؟':firstMissing.d.selfPrompt):firstMissing.d.partnerPrompt);
 await next('personality');const confirmedPersonality=confirmed.filter(p=>p.kind==='personality');if(confirmedPersonality.length===12){assert.equal(await page.locator('.nf-personality-card').count(),0);checks.push('all12 confirmed personality answers show completion without another questionnaire')}else{assert.equal(await page.locator('.wi-personality-manual').getAttribute('open'),null);checks.push(`${confirmedPersonality.length}/12 personality answers confirmed; remainder is optional, with no forced repeated questionnaire`)}await capture('signup-07-personality');await next('beena');await capture('signup-08-beena');await next('preferences');
 await page.locator('[data-field="contact"]').fill('synthetic-sarah@example.test');await next('review');await capture('signup-09-profile-review');
 await page.getByRole('checkbox',{name:/عمري ١٨ عامًا فأكثر/}).check();await page.getByRole('checkbox',{name:/أوافق على شروط الاستخدام/}).check();await page.getByRole('checkbox',{name:/اطّلعت على إشعار الخصوصية/}).check();await page.locator('.nf-intake-actions>button[type=submit]').click();await page.getByRole('heading',{name:'تم إرسال الملف',exact:true}).waitFor();
 const submitted=await page.evaluate(()=>window.__fullSubmitted);assert.equal(submitted.personalityAnswers[personalityProposal.fieldId],changed);assert.equal(submitted.personalityVersion,'personality-v1');assert.equal(submitted.signupConsents.assessment,true);assert.equal(submitted.displayName,'سارة');assert.equal(submitted.birthDate,'1997-04-15');assert.equal(submitted.city,'الرياض');
 for(const p of confirmed){if(p.kind==='personality')assert.equal(submitted.personalityAnswers[p.fieldId],p.values[0]);if(p.kind==='preference'){const d=preferences.dimensions.find(d=>d.id===p.fieldId);assert.equal(submitted.surveyAnswers[p.side==='self'?d.id:d.partnerId],p.values[0])}}
 const scores=await page.evaluate(profile=>window.__compareSignup(profile),submitted);assert.equal(scores.before.fit.personality.percentage,null);if(confirmedPersonality.length===12)assert.equal(scores.after.fit.personality.percentage,100);assert(scores.after.fit.covered>=scores.before.fit.covered);checks.push('confirmed choices survive final signup submission and feed the actual compatibility model');
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);await writeFile(resolve(artifacts,'full-signup-submitted.json'),JSON.stringify(submitted,null,2));await writeFile(resolve(artifacts,'full-signup-browser-results.json'),JSON.stringify({source:synthetic?'simulated-navigation-only':'captured-luna',checks,questions:seen,confirmed:confirmed.length,reviewEdits,excluded:excluded?.id??null,personalityCoverage:confirmedPersonality.length,preferenceCoverage:scores.after.fit.covered,scores,errors,externalRequests,screens},null,2));console.log(JSON.stringify({source:synthetic?'simulated-navigation-only':'captured-luna',checks,questions:seen.length,confirmed:confirmed.length,personalityCoverage:confirmedPersonality.length,artifacts}));
}catch(error){await page?.screenshot({path:resolve(artifacts,'full-signup-failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(artifacts,'full-signup-failure.json'),JSON.stringify({error:error.message,errors,externalRequests,answerIndex,chapter:await page?.locator('main[data-chapter]').getAttribute('data-chapter').catch(()=>null)},null,2));throw error}
finally{await browser?.close();await server.close()}
