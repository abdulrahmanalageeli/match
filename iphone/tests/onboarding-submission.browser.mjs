// Local-only fictional image, with mocked portrait staging and matching. No external services.
// Run: node tests/signup-slides.browser.mjs. No production services or member records.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import catalog from '../src/compatibility/catalog.json' with { type: 'json' };
import personality from '../src/compatibility/personality-catalog.json' with { type: 'json' };

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const gender=process.env.NISFAYN_QA_GENDER==='man'?'man':'woman';
const width=Number(process.env.NISFAYN_QA_WIDTH||390),reducedMotion=process.env.NISFAYN_QA_REDUCED_MOTION==='1';
const artifacts=resolve(root,'.tmp/onboarding-submission-review',`${width}-${reducedMotion?'reduced':'normal'}`);await mkdir(artifacts,{recursive:true});
const owner='11111111-1111-1111-1111-111111111111',drafts=new Map(),calls=[];
const quote='أحب الهدوء والوضوح، وتكوين أسرة مستقرة. أفضّل أن نتحدث بصراحة عن اختلافاتنا.';
const proposed=[...catalog.dimensions.flatMap(item=>['self','partner'].map(side=>({id:`preference:${item.id}:${side}`,kind:'preference',fieldId:item.id,side,values:[item.options[0].code]}))),...personality.map(item=>({id:`personality:${item.id}`,kind:'personality',fieldId:item.id,side:'self',values:['C']}))].map(item=>({...item,summary:'من إجابتك',evidence:[{turnId:'t1',quote}],needsClarification:false}));
const base={version:'interview-v1',consentVersion:'wudayn-interview-v1',model:'gpt-6-luna',promptVersion:'wudayn-interview-3',status:'active',turns:[],currentQuestion:{topic:'intent',text:'كيف تتصور حياتك المشتركة؟',suggestions:[]},proposals:[],readiness:[],clarifications:[],confirmed:[],lastRequestId:null,lastMode:'luna',pendingAnalysis:false,draftAnswer:'',reviewSharing:false,confirmedAt:null};
const apiMock=`
let snapshot={document:null,revision:0,coverage:{answered:0,required:44},fallbackAvailable:true};const base=${JSON.stringify(base)},proposals=${JSON.stringify(proposed)};
export class InterviewError extends Error{}
export async function requestInterview(auth,payload){
 (window.__interviewCalls??=[]).push(payload);await new Promise(resolve=>setTimeout(resolve,40));
 if(payload.action==='start')snapshot={...snapshot,document:structuredClone(base),revision:1};
 if(payload.action==='draft')snapshot={...snapshot,document:{...snapshot.document,draftAnswer:payload.answer},revision:snapshot.revision+1};
 if(payload.action==='answer')snapshot=new URLSearchParams(location.search).has('failure')?{...snapshot,fallbackAvailable:true,document:{...snapshot.document,pendingAnalysis:true,lastMode:'guided',proposals:proposals.slice(0,3).map((item,index)=>({...item,needsClarification:index===2})),draftAnswer:''},revision:snapshot.revision+1}:{...snapshot,coverage:{answered:44,required:44},document:{...snapshot.document,status:'review',turns:[{id:'t1',topic:'intent',question:base.currentQuestion.text,answer:payload.answer,skipped:false}],currentQuestion:null,proposals,draftAnswer:''},revision:snapshot.revision+1};
 if(payload.action==='confirm')snapshot={...snapshot,document:{...snapshot.document,status:'confirmed',confirmed:payload.choices.map(choice=>({...proposals.find(item=>item.id===choice.id),values:choice.values})),reviewSharing:payload.shareReview},revision:snapshot.revision+1};
 return structuredClone(snapshot);
}`;
const cloudMock=`
export const cloud={},cloudSelected=true,cloudConnection={url:'http://127.0.0.1',key:'mock'},phoneOtpEnabled=false;
export class CloudError extends Error{}
export async function cloudSessionId(){return '${owner}'}
export async function cloudLogout(){}
export async function callRpc(name,params,expectedUser){const response=await fetch('/__interview-draft-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,params,expectedUser})});if(!response.ok)throw Error('Mock draft failure');return response.json()}
export function createRecoveryClient(){return cloud}
export async function cloudRequest(){throw Error('Submitting a real application is forbidden')}
export async function resendSignupConfirmation(){throw Error('No email in this check')}
export async function sendPhoneOtp(){throw Error('No SMS in this check')}
export async function verifyPhoneOtp(){throw Error('No SMS in this check')}
`;
const fixture=`
import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';
import'/src/ambient.css';import'/src/home.css';import'/src/design.css';import'/src/flows.css';import'/src/screens.css';import'/src/motion.css';import'/src/onboarding/arrivalJourney.css';import'/src/onboarding/arrivalAssessments.css';import'/src/arrivalSurfaces.css';import'/src/typography.css';
import{GuidedApplication}from'/src/onboarding/GuidedApplication';import{initialDraft}from'/src/onboarding/draft';import{initializeDevicePreferences}from'/src/settings/preferences';
initializeDevicePreferences();
function Fixture(){const query=new URLSearchParams(location.search),chapter=query.get('chapter')??'compatibility',live=query.has('interview');const ref=useRef(null);if(!ref.current){ref.current=initialDraft('${owner}',null);ref.current.step=chapter;if(chapter!=='identity'){Object.assign(ref.current.answers,{displayName:'نورة',gender:'${gender}',birthDate:'1998-05-12',age:'28',city:'الرياض',marriageBasics:{maritalStatus:'never_married',polygynyPreference:'not_open'}});}Object.assign(ref.current.answers,{profession:'التقنية والبرمجة',education:'بكالوريوس',bio:'نبذة تجريبية عن الحياة والاهتمامات',lookingFor:'شريك متفهم',lifeTogether:'حياة هادئة',marriageIntent:'الزواج',valuesStatement:'الاحترام',contact:'fictional@example.test',familyPreference:'من البداية',preferredMinAge:'22',preferredMaxAge:'45',surveyAnswers:Object.fromEntries(${JSON.stringify(catalog.dimensions)}.flatMap(d=>[[d.id,d.options[0].code],[d.partnerId,d.options[0].code]])),personalityAnswers:Object.fromEntries(${JSON.stringify(personality)}.map(q=>[q.id,'C'])),partnerCriteria:Object.fromEntries(['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking'].map(k=>[k,{mode:'any'}]))});Object.assign(ref.current.answers.marriageBasics,{heightCm:165,weightKg:65,skinTone:'tone_4',dressStyle:'hijab',dressFlexibility:'keep',spokenLanguages:['العربية'],preferredLanguage:'العربية',languageOpenness:'flexible',nationality:'سعودي',childrenCount:0,smoking:'never',marriageTimeline:'when_ready',meetingPreference:'discuss_together',tribalBackground:'prefer_not_to_say',religiousAffiliation:'prefer_not_to_say',prayerPractice:'prefer_not_to_say'});ref.current.permissions={version:'2026-11-07-privacy',assessment:true,sensitiveProfile:true,sensitivePublication:true,interview:true};}window.__onboardingDraft=ref;return <GuidedApplication initial={null} previouslyApproved={false} busy={false} back={()=>{}} onPrivacy={()=>{}} save={(profile,portrait,policy,provenance,readiness)=>{window.__submitted={profile,portrait,policy,provenance,readiness}}} demo={!live} preview={!live} portraitSource={live?{}:null} startAt={chapter} draftRef={ref} draftOwner='${owner}' accountAgreements={{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true}} interviewAuth={live?{token:'${owner}'}:null}/>}
createRoot(document.getElementById('root')).render(<div className='phone-app' dir='rtl' lang='ar'><Fixture/></div>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-onboarding-interview'),server:{host:'127.0.0.1',port:5295,strictPort:true},optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},plugins:[{name:'isolated-onboarding-interview',enforce:'pre',resolveId(id){if(id==='virtual:onboarding-interview')return '\0onboarding-interview'},async load(id){const path=id.replaceAll('\\','/');if(path.endsWith('/src/photos/stagedPortrait.ts'))return `
export async function stageOnboardingPortrait(draft,gender,consented){if(!consented)throw Error('consent required');window.__photoCalls.push('stage:'+gender);return {...draft,staged:{id:'fictional-photo',status:gender==='woman'?'ready':'uploaded',portrait:{id:'fictional-photo',path:'synthetic',blur:draft.blur,revealPolicy:draft.revealPolicy}}}}
export async function retryStagedPortrait(draft){window.__photoCalls.push('verify:mock');return {...draft,staged:{...draft.staged,status:'verified'}}}
export async function requestPortraitModeration(draft){return {...draft,staged:{...draft.staged,status:'moderation'}}}
export async function resumeStagedPortrait(){return null} export async function finalizeStagedPortrait(draft){return draft.staged.portrait} export async function discardStagedPortrait(){}
`;if(path.endsWith('/src/cloud.ts'))return cloudMock;if(path.endsWith('/src/interview/api.ts'))return apiMock;if(path.endsWith('/src/motion/SkiaSurface.tsx'))return `import{createElement}from'react';export function SkiaSurface({className,fallback}){return createElement('div',{className,'aria-hidden':true},fallback)}`;if(id==='\0onboarding-interview')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code},configureServer(dev){dev.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__interview-draft-rpc'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.equal(input.expectedUser,owner);assert.equal(input.name,'marriage_onboarding_draft');calls.push(input);const{command,payload}=input.params;if(command==='save')drafts.set(owner,structuredClone(payload));if(command==='delete')drafts.delete(owner);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(command==='load'?drafts.get(owner)??null:{saved:true}));return}
 if(req.url?.startsWith('/__onboarding-interview')){const html=await dev.transformIndexHtml('/__onboarding-interview','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__onboarding-interview"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);return}next();
})}}]});await server.listen();
let browser,page;const errors=[],externalRequests=[],checks=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:reducedMotion?'reduce':'no-preference'});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(u.hostname)||u.protocol==='data:')return route.continue();externalRequests.push(u.origin);return route.abort()});
 const next=()=>page.locator('.nf-intake-actions>button[type=submit]').click();
 async function open(chapter){await page.goto('http://127.0.0.1:5295/__onboarding-interview?chapter='+chapter,{waitUntil:'networkidle',timeout:60000});await page.locator('.wd-signup-slides').waitFor();}
 async function capture(name){await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(400);await page.screenshot({path:resolve(artifacts,name+'.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.goto('http://127.0.0.1:5295/__onboarding-interview?chapter=avatar&interview',{waitUntil:'networkidle',timeout:60000});
 await page.locator('main[data-chapter=avatar]').waitFor();
 await page.evaluate(()=>{window.__photoCalls=[]});
 if(gender==='woman')await page.getByRole('button',{name:/صورة بتمويه اختياري/}).click();
 const imageBytes=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=500;c.height=600;const x=c.getContext('2d');x.fillStyle='#c4a3a3';x.fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]});
 await page.locator('input[type=file]').setInputFiles({name:'fictional.png',mimeType:'image/png',buffer:Buffer.from(imageBytes,'base64')});
 await page.getByRole('button',{name:'اعتماد الإطار',exact:true}).click();
 await page.locator('.nf-photo-consent input').waitFor();
 await page.locator('.nf-photo-consent input').check();
 await page.getByText(gender==='man'?'صورتك جاهزة، اكتملت مطابقة الصورة.':'صورتك جاهزة بإعدادات الخصوصية التي اخترتِها.',{exact:true}).waitFor({timeout:30000});
 assert.deepEqual(await page.evaluate(()=>window.__photoCalls),gender==='man'?['stage:man','verify:mock']:['stage:woman']);
 await capture('verified-'+gender);
 await next();await page.locator('main[data-chapter=readiness]').waitFor();
 await page.getByRole('button',{name:'أرتاح لإشراك الأهل من البداية',exact:true}).click();
 await page.getByRole('button',{name:'أقدر أبدأ خطوة رسمية قريب',exact:true}).click();
 await page.getByRole('checkbox',{name:'أوافق على اتفاق العضوية'}).check();
 await next();await page.locator('main[data-chapter=review]').waitFor();await capture('review-'+gender);
 await next();await page.waitForFunction(()=>window.__submitted!=null);
 const submitted=await page.evaluate(()=>({gender:window.__submitted.profile.gender,consents:window.__submitted.profile.signupConsents,photo:window.__submitted.portrait?.staged?.status,answers:Object.keys(window.__submitted.profile.personalityAnswers||{}).length}));
 assert.equal(submitted.gender,gender);assert.equal(submitted.consents.assessment,true);assert.equal(submitted.consents.sensitivePublication,true);assert.equal(submitted.photo,gender==='man'?'verified':'ready');assert.equal(submitted.answers,15);
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);
 console.log('PASS: '+gender+' seeded answers, mocked photo stage, readiness and browser submission to an in-memory callback; not an end-to-end account or backend test');
}catch(error){await page?.screenshot({path:resolve(artifacts,'failure.png'),fullPage:true}).catch(()=>{});console.error('PAGE ERRORS',errors,await page?.locator('body').innerText().catch(()=>''));throw error;}finally{await browser?.close();await server.close();}
