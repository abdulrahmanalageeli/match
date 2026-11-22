// Interruption, editable partial suggestions and signed-in draft recovery on the current form.
// The complete routes are covered by registration-matching.browser.mjs.
// Run: node tests/onboarding-interview.browser.mjs. No production services or member records.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import catalog from '../src/compatibility/catalog.json' with { type: 'json' };
import { initialInterviewDocument } from '../api/_lib/interview.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'playwright');
const artifacts=resolve(root,'.tmp/onboarding-interview-review');await mkdir(artifacts,{recursive:true});
const owner='11111111-1111-1111-1111-111111111111',drafts=new Map(),calls=[];
const quote='أرغب في الإنجاب وأفضّل شريكًا يرغب في الإنجاب. لم أحسم بعد أين سأعيش.';
const children = catalog.dimensions.find(d => d.id === 'children_plan');
const proposed = [
  {fieldId:children.id,side:'self'},
  {fieldId:children.id,side:'partner'},
  {fieldId:'residence_plan',side:'self'},
].map(({fieldId,side}) => ({id:['preference',fieldId,side].join(':'),kind:'preference',fieldId,side,values:['A'],
  summary:'من الإجابة التجريبية',evidence:[{turnId:'t1',quote}],needsClarification:fieldId === 'residence_plan'}));
const base = initialInterviewDocument(true);
const apiMock=`
let snapshot=JSON.parse(sessionStorage.getItem('local-qa-interview') || 'null') ?? {document:null,revision:0,fallbackAvailable:false};
const base=${JSON.stringify(base)},proposals=${JSON.stringify(proposed)};
export class InterviewError extends Error{}
export async function requestInterview(auth,payload){
 (window.__interviewCalls??=[]).push(payload);
 if(payload.action==='start') snapshot={document:structuredClone(base),revision:1};
 else if(payload.action==='draft') snapshot={...snapshot,document:{...snapshot.document,draftAnswer:payload.answer},revision:snapshot.revision+1};
 else if(payload.action==='answer'){
   snapshot={...snapshot,fallbackAvailable:true,document:{...snapshot.document,pendingAnalysis:true,lastMode:'guided',proposals,draftAnswer:'',
     turns:[{id:'t1',topic:'intent',question:base.currentQuestion.text,answer:payload.answer,skipped:false}]},revision:snapshot.revision+1};
 } else if(payload.action!=='load') throw Error('Unexpected interview request '+payload.action);
 sessionStorage.setItem('local-qa-interview',JSON.stringify(snapshot));
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
function Fixture(){const query=new URLSearchParams(location.search),chapter=query.get('chapter')??'compatibility',live=query.has('interview');const ref=useRef(null);if(!ref.current && !sessionStorage.getItem('restore-private-draft')){ref.current=initialDraft('${owner}',null);Object.assign(ref.current.answers,{displayName:'نورة',gender:'woman',birthDate:'1998-05-12',age:'28',city:'الرياض',profession:'مهندسة',bio:'أحب الهدوء والقراءة والوقت مع العائلة.',contact:'qa@example.invalid',marriageBasics:{nationality:'سعودي',maritalStatus:'never_married',polygynyPreference:'not_open'}});ref.current.step=chapter;if(['criteria','review'].includes(chapter))ref.current.permissions={version:'2026-11-07-privacy',assessment:true,sensitiveProfile:false,interview:true};}window.__onboardingDraft=ref;return <GuidedApplication initial={null} previouslyApproved={false} busy={false} back={()=>{}} onPrivacy={()=>{}} save={()=>{throw Error('Do not submit')}} demo={!live} preview={!live} startAt={chapter} draftRef={ref} draftOwner='${owner}' accountAgreements={{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true}} interviewAuth={live?{token:'${owner}'}:null}/>}
createRoot(document.getElementById('root')).render(<div className='phone-app' dir='rtl' lang='ar'><Fixture/></div>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-onboarding-interview'),server:{host:'127.0.0.1',port:5279,strictPort:true},optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},plugins:[{name:'isolated-onboarding-interview',enforce:'pre',resolveId(id){if(id==='virtual:onboarding-interview')return '\0onboarding-interview'},async load(id){const path=id.replaceAll('\\','/');if(path.endsWith('/src/cloud.ts'))return cloudMock;if(path.endsWith('/src/interview/api.ts'))return apiMock;if(path.endsWith('/src/motion/SkiaSurface.tsx'))return `import{createElement}from'react';export function SkiaSurface({className,fallback}){return createElement('div',{className,'aria-hidden':true},fallback)}`;if(id==='\0onboarding-interview')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code},configureServer(dev){dev.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__interview-draft-rpc'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.equal(input.expectedUser,owner);assert.equal(input.name,'marriage_onboarding_draft');calls.push(input);const{command,payload}=input.params;if(command==='save')drafts.set(owner,structuredClone(payload));if(command==='delete')drafts.delete(owner);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(command==='load'?drafts.get(owner)??null:{saved:true}));return}
 if(req.url?.startsWith('/__onboarding-interview')){const html=await dev.transformIndexHtml('/__onboarding-interview','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__onboarding-interview"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);return}next();
})}}]});await server.listen();
let browser,page;const errors=[],externalRequests=[],checks=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA',reducedMotion:'reduce'});page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)||url.protocol==='data:')return route.continue();externalRequests.push(url.origin);return route.abort()});

 async function open(query){await page.goto('http://127.0.0.1:5279/__onboarding-interview?'+query,{waitUntil:'networkidle',timeout:60000});await page.locator('.nf-intake').waitFor();}
 async function capture(name){await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(200);await page.screenshot({path:resolve(artifacts,name+'.png'),fullPage:true})}
 await open('interview');
 await page.getByRole('checkbox',{name:/أوافق على جلسة التوافق/}).click();
 await page.getByRole('button',{name:'ابدأ الحوار مع لونا',exact:true}).click();
 await page.locator('#wi-answer').fill(quote);
 await page.getByRole('button',{name:'إرسال الرسالة',exact:true}).click();
 await page.getByRole('button',{name:'إكمال الأسئلة مباشرة',exact:true}).click();
 await page.getByRole('heading',{name:'نكمل من حيث وصلنا',exact:true}).waitFor();
 const selfGroup=page.locator('.wi-review-group').filter({has:page.getByText('عن حياتك',{exact:true})});
 const first=selfGroup.locator('.wi-proposal').first();
 await first.locator(':scope > summary').click();
 await first.locator('select').selectOption('C');
 await capture('01-corrected-partial-review');
 await page.getByRole('button',{name:'اعتماد ما راجعته وإكمال المتبقي',exact:true}).click();
 await page.locator('.compat-panel').waitFor();
 const expected={children_plan:'C',partner_children_plan:'A'};
 assert.deepEqual(await page.evaluate(()=>window.__onboardingDraft.current.answers.surveyAnswers),expected);
 assert.equal(await page.locator('.compat-next').isDisabled(),true);
 assert.equal(await page.evaluate(()=>window.__interviewCalls.some(call=>['confirm','structuredConfirm','directConfirm'].includes(call.action))),false);
 await new Promise((resolve,reject)=>{
   const until=Date.now()+10000;
   const interval=setInterval(()=>{
     if(drafts.get(owner)?.answers.surveyAnswers?.children_plan==='C'){clearInterval(interval);resolve();}
     else if(Date.now()>until){clearInterval(interval);reject(Error('Corrected choices were not saved to the account draft'));}
   },50);
 });
 checks.push('Corrected one self answer, kept the reviewed partner choice, left the uncertain residence question unanswered');
 await page.evaluate(()=>sessionStorage.setItem('restore-private-draft','1'));
 await page.reload({waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__onboardingDraft?.current?.answers.surveyAnswers?.children_plan==='C');
 assert.deepEqual(await page.evaluate(()=>window.__onboardingDraft.current.answers.surveyAnswers),expected);
 assert.equal(drafts.get(owner).permissions.assessment,true);
 checks.push('Reload recovered the same private draft and two exact answers after the synthetic provider interruption');
 await capture('02-recovered-partial-assessment');
 assert.deepEqual(errors,[],'no browser rendering errors');assert.deepEqual(externalRequests,[],'no external service access');await writeFile(resolve(artifacts,'results.json'),JSON.stringify({checks,errors,externalRequests,artifacts},null,2));console.log(JSON.stringify({checks,artifacts}));
}catch(error){await page?.screenshot({path:resolve(artifacts,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(artifacts,'failure.json'),JSON.stringify({error:error.message,dom:await page?.locator('body').innerText(),errors,externalRequests},null,2));throw error}
finally{await browser?.close();await server.close()}
