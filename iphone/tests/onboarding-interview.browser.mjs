// Local-only integration check: actual onboarding, interview, fields, and private draft persistence.
// Run: node tests/onboarding-interview.browser.mjs. No production services or member records.
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
const artifacts=resolve(root,'.tmp/onboarding-interview-review');await mkdir(artifacts,{recursive:true});
const owner='11111111-1111-1111-1111-111111111111',drafts=new Map(),calls=[];
const quote='أحب الهدوء والوضوح، وتكوين أسرة مستقرة. أفضّل أن نتحدث بصراحة عن اختلافاتنا.';
const proposed=[...catalog.dimensions.flatMap(item=>['self','partner'].map(side=>({id:`preference:${item.id}:${side}`,kind:'preference',fieldId:item.id,side,values:[item.options[0].code]}))),...personality.map(item=>({id:`personality:${item.id}`,kind:'personality',fieldId:item.id,side:'self',values:['C']}))].map(item=>({...item,summary:'من إجابتك',evidence:[{turnId:'t1',quote}],needsClarification:false}));
const base={version:'interview-v1',consentVersion:'wudayn-interview-v1',model:'gpt-6-luna',promptVersion:'wudayn-interview-3',status:'active',turns:[],currentQuestion:{topic:'intent',text:'كيف تتصور حياتك المشتركة؟',suggestions:[]},proposals:[],readiness:[],clarifications:[],confirmed:[],lastRequestId:null,lastMode:'luna',pendingAnalysis:false,draftAnswer:'',reviewSharing:false,confirmedAt:null};
const apiMock=`
let snapshot={document:null,revision:0,coverage:{answered:0,required:44},fallbackAvailable:false};const base=${JSON.stringify(base)},proposals=${JSON.stringify(proposed)};
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
function Fixture(){const query=new URLSearchParams(location.search),chapter=query.get('chapter')??'compatibility',live=query.has('interview');const ref=useRef(null);if(!ref.current){ref.current=initialDraft('${owner}',null);Object.assign(ref.current.answers,{displayName:'نورة',gender:'woman',birthDate:'1998-05-12',age:'28',city:'الرياض',profession:'مهندسة',bio:'أحب الهدوء والقراءة والوقت مع العائلة.',contact:'qa@example.com'});ref.current.step=chapter;if(['criteria','review'].includes(chapter))ref.current.permissions={version:'2026-11-07-privacy',assessment:true,sensitiveProfile:false,interview:true};}window.__onboardingDraft=ref;return <GuidedApplication initial={null} previouslyApproved={false} busy={false} back={()=>{}} onPrivacy={()=>{}} save={()=>{throw Error('Do not submit')}} demo={!live} preview={!live} startAt={chapter} draftRef={ref} draftOwner='${owner}' accountAgreements={{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true}} interviewAuth={live?{token:'${owner}'}:null}/>}
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
 const next=()=>page.locator('.nf-intake-actions>button[type=submit]').click();
 async function open(query){await page.goto('http://127.0.0.1:5279/__onboarding-interview?'+query,{waitUntil:'networkidle',timeout:60000});await page.locator('.nf-intake').waitFor();}
 async function capture(name){await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(200);await page.screenshot({path:resolve(artifacts,name+'.png'),fullPage:true})}
 await open('interview');
 await page.getByRole('checkbox',{name:/أوافق على جلسة التوافق/}).click();await page.getByRole('button',{name:'ابدأ الحوار',exact:true}).click();
 await page.locator('#wi-answer').waitFor();assert.equal(await page.locator('.wi-consent').count(),0,'accepted consent is reused');assert.equal(await page.locator('.nf-session-fallback').count(),0,'AI remains the normal registration path');
 await page.locator('#wi-answer').fill(quote);await page.getByRole('button',{name:'إرسال الرسالة'}).click();await page.locator('.wi-review').waitFor();
 assert.equal(await page.locator('.wi-proposal input[type=checkbox]').count(),0);assert.equal(await page.locator('.wi-review-group').count(),3);await capture('01-grouped-review');
 await page.getByRole('button',{name:'هذا يمثّلني، اعتماد الملخص'}).click();await page.locator('.wi-complete').waitFor();await page.locator('.wi-complete>.wi-button-primary').click();
 await page.waitForFunction(()=>Object.keys(window.__onboardingDraft.current.answers.personalityAnswers??{}).length===12);
 assert.equal(await page.evaluate(()=>Object.keys(window.__onboardingDraft.current.answers.surveyAnswers).length),32);
 assert.equal(await page.evaluate(()=>window.__interviewCalls.filter(call=>call.action==='confirm').length),1);
 await next();await page.locator('[data-chapter=criteria]').waitFor();checks.push('required AI session reuses consent, confirms all44 once, then moves directly to partner criteria');await capture('02-after-ai-criteria');
 await open('interview&failure');await page.getByRole('checkbox',{name:/أوافق على جلسة التوافق/}).click();await page.getByRole('button',{name:'ابدأ الحوار',exact:true}).click();await page.locator('#wi-answer').fill(quote);await page.getByRole('button',{name:'إرسال الرسالة'}).click();await page.getByRole('button',{name:'إكمال الأسئلة مباشرة',exact:true}).click();await page.getByText('نكمل من حيث وصلنا',{exact:true}).waitFor();await capture('02-fallback-summary');await page.getByRole('button',{name:'اعتماد ما راجعته وإكمال المتبقي'}).click();await page.locator('.compat-panel').waitFor();assert.equal(await page.evaluate(()=>Object.keys(window.__onboardingDraft.current.answers.surveyAnswers).length),2);assert.equal(await page.evaluate(()=>window.__interviewCalls.filter(call=>call.action==='confirm').length),0);assert.equal(await page.locator('.compat-next').isDisabled(),true);checks.push('server-attested failure reviews partial answers once and opens only the required remainder');
 for(const chapter of ['story','details','criteria']){await open('chapter='+chapter);await next();await page.locator('#nf-intake-error').waitFor();assert.equal(await page.locator('.nf-intake').getAttribute('data-chapter'),chapter);assert(await page.locator('#nf-intake-error').innerText());const focus=await page.evaluate(()=>document.activeElement?.getAttribute('data-field')||document.activeElement?.closest('[data-section]')?.getAttribute('data-section'));assert(focus,chapter+' validation focuses its field');await capture('03-required-'+chapter);if(chapter!=='story')assert.equal(await page.locator('details.nf-marriage-group[open]').count(),1,chapter+' expands only the first incomplete group');checks.push(chapter+' blocks missing required answers and focuses a usable field');}
 await open('chapter=compatibility');await page.getByRole('checkbox',{name:/أوافق على جلسة التوافق/}).click();await page.locator('.compat-panel').waitFor();assert.equal(await page.locator('.compat-skip').count(),0);assert.equal(await page.locator('.compat-next').isDisabled(),true);await next();await page.locator('#nf-intake-error').waitFor();
 for(let index=0;index<32;index++){await page.locator('.compat-choice').first().click();if(index<31)await page.locator('.compat-next').click();}
 await page.locator('.nf-personality-card').waitFor();assert.equal(await page.locator('.nf-personality-later').count(),0);assert.equal(await page.locator('.nf-personality-next').isDisabled(),true);
 for(let index=0;index<12;index++){await page.locator('.nf-personality-options button').first().click();if(index<11)await page.locator('.nf-personality-next').click();}
 await next();await page.locator('[data-chapter=criteria]').waitFor();checks.push('demo fallback requires all32 preferences and12 personality answers in one chapter');
 await open('chapter=review');assert.equal(await page.getByRole('checkbox',{name:/عمري ١٨|شروط الاستخدام|اطّلعت على إشعار/}).count(),0);assert.equal(await page.getByText('بيننا · مواقف الحياة',{exact:true}).count(),0);await page.getByText('ملامح شخصيتك',{exact:true}).click();await page.getByRole('button',{name:'تعديل ملامح شخصيتك'}).click();await page.locator('[data-chapter=compatibility]').waitFor();checks.push('account consent receipts are reused and review edit returns to the combined assessment');
 await open('chapter=review');await capture('04-review');
 assert.deepEqual(errors,[],'no browser rendering errors');assert.deepEqual(externalRequests,[],'no external service access');await writeFile(resolve(artifacts,'results.json'),JSON.stringify({checks,errors,externalRequests,artifacts},null,2));console.log(JSON.stringify({checks,artifacts}));
}catch(error){await page?.screenshot({path:resolve(artifacts,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(artifacts,'failure.json'),JSON.stringify({error:error.message,errors,externalRequests},null,2));throw error}
finally{await browser?.close();await server.close()}
