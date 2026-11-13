// Local-only integration check: actual onboarding, interview, fields, and private draft persistence.
// Run: node tests/onboarding-interview.browser.mjs. No production services or member records.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import catalog from '../src/compatibility/catalog.json' with { type: 'json' };
import scenarios from '../src/beena/catalog.json' with { type: 'json' };

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const artifacts=resolve(root,'.tmp/onboarding-interview-review');await mkdir(artifacts,{recursive:true});
const owner='11111111-1111-1111-1111-111111111111',drafts=new Map(),calls=[];
const quote='أرغب بالأطفال وأفضّل شريكة ترغب بالأطفال، وأرتاح للاستقرار في مدينتي. ننسق مع الأهل معًا ونراجع الأرقام قبل المصاريف.';
const proposed=[['preference','children_plan','self',['A']],['preference','children_plan','partner',['A']],['preference','residence_plan','self',['A']],['beena','family_boundaries','self',['A']],['beena','family_boundaries','partner',['A']],['beena','finances','self',['A']]].map(([kind,fieldId,side,values],index)=>({id:'choice-'+index,kind,fieldId,side,values,summary:'تفضيل صريح من إجابتك، راجعه قبل اعتماده.',evidence:[{turnId:'t1',quote}],needsClarification:false}));
const base={version:'interview-v1',consentVersion:'wudayn-interview-v1',model:'gpt-6-luna',promptVersion:'wudayn-interview-1',status:'active',turns:[],currentQuestion:{topic:'intent',text:'كيف تتصور حياتك المشتركة؟',suggestions:[]},proposals:[],readiness:[],clarifications:[],confirmed:[],lastRequestId:null,lastMode:'luna',pendingAnalysis:false,draftAnswer:'',reviewSharing:false,confirmedAt:null};
const apiMock=`
let snapshot={document:null,revision:0};const base=${JSON.stringify(base)},proposals=${JSON.stringify(proposed)};
export class InterviewError extends Error{}
export async function requestInterview(auth,payload){
 await new Promise(resolve=>setTimeout(resolve,40));
 if(payload.action==='start')snapshot={document:structuredClone(base),revision:1};
 if(payload.action==='draft')snapshot={document:{...snapshot.document,draftAnswer:payload.answer},revision:snapshot.revision+1};
 if(payload.action==='answer')snapshot={document:{...snapshot.document,status:'review',turns:[{id:'t1',topic:'intent',question:base.currentQuestion.text,answer:payload.answer,skipped:false}],currentQuestion:null,proposals,draftAnswer:''},revision:snapshot.revision+1};
 if(payload.action==='confirm')snapshot={document:{...snapshot.document,status:'confirmed',confirmed:payload.choices.map(choice=>({...proposals.find(item=>item.id===choice.id),values:choice.values})),reviewSharing:payload.shareReview},revision:snapshot.revision+1};
 if(payload.action==='delete')throw Error('No deletion in this check');
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
import{GuidedApplication}from'/src/onboarding/GuidedApplication';import{initializeDevicePreferences}from'/src/settings/preferences';
initializeDevicePreferences();
function Fixture(){const ref=useRef(null);window.__onboardingDraft=ref;const[open,setOpen]=useState(true);return open?<GuidedApplication initial={null} previouslyApproved={false} busy={false} back={()=>setOpen(false)} onPrivacy={()=>{}} save={()=>{throw Error('Do not submit')}} startAt='compatibility' draftRef={ref} draftOwner='${owner}' interviewAuth={{token:'${owner}'}}/>:<button onClick={()=>setOpen(true)}>استئناف التسجيل</button>}
createRoot(document.getElementById('root')).render(<div className='phone-app' dir='rtl' lang='ar'><Fixture/></div>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-onboarding-interview'),server:{host:'127.0.0.1',port:5279,strictPort:true},optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},plugins:[{name:'isolated-onboarding-interview',enforce:'pre',resolveId(id){if(id==='virtual:onboarding-interview')return '\0onboarding-interview'},async load(id){const path=id.replaceAll('\\','/');if(path.endsWith('/src/cloud.ts'))return cloudMock;if(path.endsWith('/src/interview/api.ts'))return apiMock;if(path.endsWith('/src/motion/SkiaSurface.tsx'))return `import{createElement}from'react';export function SkiaSurface({className,fallback}){return createElement('div',{className,'aria-hidden':true},fallback)}`;if(id==='\0onboarding-interview')return(await transformWithEsbuild(fixture,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code},configureServer(dev){dev.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__interview-draft-rpc'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.equal(input.expectedUser,owner);assert.equal(input.name,'marriage_onboarding_draft');calls.push(input);const{command,payload}=input.params;if(command==='save')drafts.set(owner,structuredClone(payload));if(command==='delete')drafts.delete(owner);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(command==='load'?drafts.get(owner)??null:{saved:true}));return}
 if(req.url?.startsWith('/__onboarding-interview')){const html=await dev.transformIndexHtml('/__onboarding-interview','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__onboarding-interview"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);return}next();
})}}]});await server.listen();
let browser,page;const errors=[],externalRequests=[],checks=[];
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ar-SA',reducedMotion:'reduce'});page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)||url.protocol==='data:')return route.continue();externalRequests.push(url.origin);return route.abort()});
 async function capture(name){await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(200);await page.screenshot({path:resolve(artifacts,name+'.png')})}
 await page.goto('http://127.0.0.1:5279/__onboarding-interview',{waitUntil:'networkidle',timeout:60000});
 // ConsentGate replaces the checkbox with a compact summary immediately after acceptance.
 await page.getByRole('checkbox',{name:/أوافق على تحليل إجاباتي للتوافق/}).click();
 await page.locator('.wi-onboarding-choice').waitFor();await capture('01-choice');
 await page.getByRole('button',{name:'ابدأ الحوار',exact:true}).click();await page.locator('.wi-consent input').check();
 await page.getByRole('button',{name:'أفضّل الأسئلة المباشرة',exact:true}).click();await page.locator('.compat-panel').waitFor();assert.equal(await page.locator('.compat-panel h3').innerText(),catalog.dimensions.find(item=>item.id==='children_plan').selfPrompt);checks.push('interview fallback enters direct questions');
 await page.getByRole('button',{name:'أكمل عبر جلسة التوافق',exact:true}).click();await page.getByRole('button',{name:'خلّنا نبدأ',exact:true}).click();await page.locator('#wi-answer').fill(quote);await page.getByRole('button',{name:'متابعة',exact:true}).click();await page.locator('.wi-review').waitFor();
 await page.getByRole('button',{name:'اختيار الواضح منها',exact:true}).click();await page.locator('.wi-review>.wi-button-primary').click();await page.locator('.wi-complete').waitFor();await page.locator('.wi-complete>.wi-button-primary').click();
 await page.waitForFunction(()=>window.__onboardingDraft.current?.answers.surveyAnswers?.partner_children_plan==='A');
 assert.equal(await page.locator('.compat-panel h3').innerText(),catalog.dimensions.find(item=>item.id==='residence_plan').partnerPrompt);checks.push('confirmed sides omitted; unanswered partner side retained');await capture('02-remaining');
 await page.getByRole('button',{name:'مراجعة كل الإجابات',exact:true}).click();await page.locator('.compat-outline summary').click();const childrenButton=page.locator('.compat-sections button').filter({hasText:'الأطفال'});await childrenButton.click();assert.equal(await page.locator('.compat-panel h3').innerText(),catalog.dimensions.find(item=>item.id==='children_plan').selfPrompt);await page.getByRole('button',{name:'إظهار المتبقي فقط',exact:true}).click();checks.push('confirmed preferences remain editable');
 await page.locator('.nf-intake-actions>button[type=submit]').click();await page.locator('[data-chapter=personality]').waitFor();assert.equal(await page.locator('.personality-panel').count()>0||await page.getByText('أقرب إلى طبيعتك',{exact:true}).count()>0,true);checks.push('personality remains an independent assessment');
 await page.locator('.nf-intake-actions>button[type=submit]').click();await page.locator('[data-chapter=beena]').waitFor();await page.locator('.bn-scene h3').waitFor();assert.equal(await page.locator('.bn-scene h3').innerText(),'أي التصرفات ترتاح إليها من شريكك؟');assert((await page.locator('.bn-scene-heading').innerText()).includes(scenarios.find(item=>item.id==='finances').title));checks.push('Beena continues at unanswered finances partner side');await capture('03-beena-remaining');
 await page.waitForFunction(()=>document.querySelector('.nf-intake-save-status')?.getAttribute('data-state')==='saved');
 assert.equal(drafts.get(owner).answers.surveyAnswers.children_plan,'A');assert.equal(drafts.get(owner).answers.beena.answers.finances.self,'A');
 await page.reload({waitUntil:'networkidle'});await page.locator('.compat-panel h3').waitFor();assert.equal(await page.locator('.compat-panel h3').innerText(),catalog.dimensions.find(item=>item.id==='residence_plan').partnerPrompt);checks.push('private saved draft reload preserves interview coverage');await capture('04-restored');
 assert.deepEqual(errors,[],'no browser rendering errors');assert.deepEqual(externalRequests,[],'no external service access');await writeFile(resolve(artifacts,'results.json'),JSON.stringify({checks,errors,externalRequests,artifacts},null,2));console.log(JSON.stringify({checks,artifacts}));
}catch(error){await page?.screenshot({path:resolve(artifacts,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(artifacts,'failure.json'),JSON.stringify({error:error.message,errors,externalRequests},null,2));throw error}
finally{await browser?.close();await server.close()}
