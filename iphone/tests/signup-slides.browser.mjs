// Local-only integration check: actual onboarding, interview, fields, and private draft persistence.
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
const artifacts=resolve(root,'.tmp/signup-slides-review');await mkdir(artifacts,{recursive:true});
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
function Fixture(){const query=new URLSearchParams(location.search),chapter=query.get('chapter')??'compatibility',live=query.has('interview');const ref=useRef(null);if(!ref.current){ref.current=initialDraft('${owner}',null);ref.current.step=chapter;if(['criteria','review'].includes(chapter))ref.current.permissions={version:'2026-11-07-privacy',assessment:true,sensitiveProfile:false,interview:true};}window.__onboardingDraft=ref;return <GuidedApplication initial={null} previouslyApproved={false} busy={false} back={()=>{}} onPrivacy={()=>{}} save={()=>{throw Error('Do not submit')}} demo={!live} preview={!live} startAt={chapter} draftRef={ref} draftOwner='${owner}' accountAgreements={{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true}} interviewAuth={live?{token:'${owner}'}:null}/>}
createRoot(document.getElementById('root')).render(<div className='phone-app' dir='rtl' lang='ar'><Fixture/></div>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-onboarding-interview'),server:{host:'127.0.0.1',port:5287,strictPort:true},optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},plugins:[{name:'isolated-onboarding-interview',enforce:'pre',resolveId(id){if(id==='virtual:onboarding-interview')return '\0onboarding-interview'},async load(id){const path=id.replaceAll('\\','/');if(path.endsWith('/src/cloud.ts'))return cloudMock;if(path.endsWith('/src/interview/api.ts'))return apiMock;if(path.endsWith('/src/motion/SkiaSurface.tsx'))return `import{createElement}from'react';export function SkiaSurface({className,fallback}){return createElement('div',{className,'aria-hidden':true},fallback)}`;if(id==='\0onboarding-interview')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code},configureServer(dev){dev.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__interview-draft-rpc'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.equal(input.expectedUser,owner);assert.equal(input.name,'marriage_onboarding_draft');calls.push(input);const{command,payload}=input.params;if(command==='save')drafts.set(owner,structuredClone(payload));if(command==='delete')drafts.delete(owner);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(command==='load'?drafts.get(owner)??null:{saved:true}));return}
 if(req.url?.startsWith('/__onboarding-interview')){const html=await dev.transformIndexHtml('/__onboarding-interview','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__onboarding-interview"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);return}next();
})}}]});await server.listen();
let browser,page;const errors=[],externalRequests=[],checks=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(u.hostname)||u.protocol==='data:')return route.continue();externalRequests.push(u.origin);return route.abort()});
 const next=()=>page.locator('.nf-intake-actions>button[type=submit]').click();
 async function open(chapter){await page.goto('http://127.0.0.1:5287/__onboarding-interview?chapter='+chapter,{waitUntil:'networkidle',timeout:60000});await page.locator('.wd-signup-slides').waitFor();}
 async function capture(name){await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(400);await page.screenshot({path:resolve(artifacts,name+'.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await open('identity');assert.equal(await page.locator('.nf-intake-title').isVisible(),false);assert.equal(await page.getByRole('progressbar').count(),1);await capture('01-name');await next();await page.locator('.wd-slide-error').waitFor();assert.equal(await page.locator('[data-field=city]').count(),0);
 await page.locator('[data-field=displayName]').fill('نورة');await page.getByRole('button',{name:'امرأة',exact:true}).click();assert.equal(await page.locator('.wd-slide-content').getAttribute('data-complete'),'true');await capture('01-name-complete');await page.locator('[data-field=displayName]').press('Enter');await page.getByText('متى يوم ميلادك؟',{exact:true}).waitFor();assert.equal(await page.locator('.nf-intake').getAttribute('data-chapter'),'identity');
 await page.locator('[data-field=birthDate]').fill('1998-05-12');await next();await page.getByText('وين تقيم حاليًا؟',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__onboardingDraft.current.answers.city),'');await capture('02-city');
 await page.getByRole('button',{name:'الرياض',exact:true}).click();await page.locator('.wd-slide-foot').getByRole('button',{name:'السابق'}).click();assert.equal(await page.locator('[data-field=birthDate]').inputValue(),'1998-05-12');await next();assert.equal(await page.getByRole('button',{name:'الرياض',exact:true}).getAttribute('aria-pressed'),'true');await next();await page.locator('.nf-intake[data-chapter=compatibility]').waitFor();checks.push('identity validation, Enter advances one slide, cities require selection, previous values preserved, Luna follows the essentials');await capture('03-assessment');
 await open('details');await page.getByRole('checkbox').first().check();await next();await page.getByText('المظهر واللباس',{exact:true}).first().waitFor();assert.equal(await page.locator('.nf-marriage-group').count(),1);
 await page.getByRole('button',{name:/^الطول/}).click();await page.getByRole('option',{name:'١٦٥ سم',exact:true}).click();await page.getByRole('button',{name:/^الوزن/}).click();await page.getByRole('option',{name:'٦٠ كجم',exact:true}).click();await next();await page.getByText('اختر درجة البشرة الأقرب لك.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'أفضل عدم الإفصاح',exact:true}).count(),0);await capture('04-appearance');
 await page.locator('.nf-tone-choices button').nth(2).click();await next();await page.getByRole('heading',{name:'اللغات والتواصل',exact:true}).waitFor();assert.equal(await page.locator('.nf-marriage-group').count(),1);checks.push('single details section, required skin after consent, publication remains separate');
 await page.locator('.wd-slide-foot').getByRole('button',{name:'السابق'}).click();assert.equal(await page.locator('.nf-tone-choices button[aria-pressed=true]').count(),1);assert.equal(await page.evaluate(()=>window.__onboardingDraft.current.permissions.sensitiveProfile),true);
 await next();await page.getByRole('checkbox',{name:'العربية',exact:true}).check();await page.getByRole('button',{name:/^ما اللغة التي تفضّل/}).click();await page.getByRole('option',{name:'العربية',exact:true}).click();await page.getByRole('button',{name:'أفضّل أن نتحدث لغة مشتركة',exact:true}).click();await next();
 await page.getByRole('button',{name:/^جنسيتك/}).click();await page.getByRole('option',{name:'سعودي',exact:true}).click();await next();
 await page.getByRole('button',{name:'خلال ٣–٦ أشهر',exact:true}).click();await page.getByRole('button',{name:'أفضل لقاءً بحضور الأهل قبل الخطوة الرسمية',exact:true}).click();await next();
 await page.getByRole('button',{name:'لم يسبق لي الزواج',exact:true}).click();await page.getByRole('button',{name:'لا أرغب في التعدد',exact:true}).click();await next();
 await page.getByRole('button',{name:/^عدد الأبناء/}).click();await page.getByRole('option',{name:'دون أبناء',exact:true}).click();await page.getByRole('button',{name:'لا أدخّن',exact:true}).click();await next();await page.getByRole('heading',{name:'الدين في حياتي',exact:true}).waitFor();await next();await page.locator('.nf-intake[data-chapter=criteria]').waitFor();checks.push('complete details reaches partner criteria without validation targeting a hidden section');
 await page.goto('http://127.0.0.1:5287/__onboarding-interview?chapter=preferences',{waitUntil:'networkidle',timeout:60000});await page.locator('.nf-family-choice').waitFor();assert.equal(await page.locator('.nf-family-choice button').count(),3);await page.getByRole('button',{name:'من البداية',exact:true}).click();assert.equal(await page.getByRole('button',{name:'من البداية',exact:true}).getAttribute('aria-pressed'),'true');await capture('05-preferences');checks.push('family timing keeps all three answers in compact tap cards');
 await page.emulateMedia({reducedMotion:'reduce'});await open('identity');await page.waitForTimeout(400);assert.equal(await page.locator('[data-motion-reveal]').last().evaluate(n=>getComputedStyle(n).opacity),'1');assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);await writeFile(resolve(artifacts,'results.json'),JSON.stringify({checks,errors,externalRequests},null,2));console.log(JSON.stringify({checks,artifacts}));
}finally{await browser?.close();await server.close();}
