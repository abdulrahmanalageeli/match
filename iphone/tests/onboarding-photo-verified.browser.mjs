// Local-only fictional image, with mocked portrait staging and matching. No external services.
// Run with Playwright installed or set NISFAYN_PLAYWRIGHT_MODULE to its package path.
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
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'playwright');
const gender=process.env.NISFAYN_QA_GENDER==='man'?'man':'woman';
const width=Number(process.env.NISFAYN_QA_WIDTH||390),reducedMotion=process.env.NISFAYN_QA_REDUCED_MOTION==='1';
const artifacts=resolve(root,'.tmp/photo-verification-review',`${width}-${reducedMotion?'reduced':'normal'}`);await mkdir(artifacts,{recursive:true});
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
function Fixture(){const query=new URLSearchParams(location.search),chapter=query.get('chapter')??'compatibility',live=query.has('interview');const ref=useRef(null);if(!ref.current){ref.current=initialDraft('${owner}',null);ref.current.step=chapter;if(chapter!=='identity'){Object.assign(ref.current.answers,{displayName:'نورة',gender:'${gender}',birthDate:'1998-05-12',age:'28',city:'الرياض',marriageBasics:{maritalStatus:'never_married',polygynyPreference:'not_open'}});}if(['criteria','review'].includes(chapter))ref.current.permissions={version:'2026-11-07-privacy',assessment:true,sensitiveProfile:false,interview:true};}window.__onboardingDraft=ref;return <GuidedApplication initial={null} previouslyApproved={false} busy={false} back={()=>{}} onPrivacy={()=>{}} save={()=>{throw Error('Do not submit')}} demo={!live} preview={!live} portraitSource={live?{}:null} startAt={chapter} draftRef={ref} draftOwner='${owner}' accountAgreements={{version:'2026-11-07-privacy',adult:true,terms:true,privacy:true}} interviewAuth={live?{token:'${owner}'}:null}/>}
createRoot(document.getElementById('root')).render(<div className='phone-app' dir='rtl' lang='ar'><Fixture/></div>);
`;
const server=await createServer({root,configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-onboarding-interview'),server:{host:'127.0.0.1',port:5296,strictPort:true},optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets'],esbuildOptions:{resolveExtensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.mjs','.json']}},plugins:[{name:'isolated-onboarding-interview',enforce:'pre',resolveId(id){if(id==='virtual:onboarding-interview')return '\0onboarding-interview'},async load(id){const path=id.replaceAll('\\','/');if(path.endsWith('/src/photos/stagedPortrait.ts'))return `
import {captureForPhoto} from '/src/photos/verifyPhoto';
export async function stageOnboardingPortrait(draft,gender,consented){if(!consented)throw Error('consent required');if(draft.staged)return draft;window.__photoCalls.push('stage:'+gender);return {...draft,staged:{id:'fictional-photo',status:gender==='woman'?'ready':'uploaded',portrait:{id:'fictional-photo',path:'synthetic',blur:draft.blur,revealPolicy:draft.revealPolicy}}}}
export async function retryStagedPortrait(draft){const image=await captureForPhoto(true,draft.staged.id,draft.url);if(!image)throw Error('Expected a new camera frame');window.__photoCalls.push('verify:mock');return {...draft,staged:{...draft.staged,status:'verified'}}}
export async function requestPortraitModeration(draft){return {...draft,staged:{...draft.staged,status:'moderation'}}}
export async function resumeStagedPortrait(){return null} export async function finalizeStagedPortrait(draft){return draft.staged.portrait}
export async function discardStagedPortrait(draft){if(window.__failDiscard){window.__failDiscard=false;throw Error('synthetic outage');}window.__photoCalls.push('discard:'+draft.staged.id)}
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
 async function open(chapter){await page.goto('http://127.0.0.1:5296/__onboarding-interview?chapter='+chapter,{waitUntil:'networkidle',timeout:60000});await page.locator('.wd-signup-slides').waitFor();}
 async function capture(name){await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();scrollTo(0,0)});await page.waitForTimeout(400);await page.screenshot({path:resolve(artifacts,name+'.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.goto('http://127.0.0.1:5296/__onboarding-interview?chapter=avatar&interview',{waitUntil:'networkidle',timeout:60000});
 await page.locator('main[data-chapter=avatar]').waitFor();
 await page.evaluate(()=>{window.__photoCalls=[]});
 if(gender==='woman')await page.getByRole('button',{name:/صورة بتمويه اختياري/}).click();
 const imageBytes=await page.evaluate(()=>{
   const chart=document.createElement('canvas'); chart.width=900; chart.height=500;
   const ctx=chart.getContext('2d'),gradient=ctx.createLinearGradient(0,0,900,500);
   gradient.addColorStop(0,'#7a132f'); gradient.addColorStop(1,'#fae2a3');
   ctx.fillStyle=gradient; ctx.fillRect(0,0,900,500);
   return chart.toDataURL('image/png').split(',')[1];
 });
 await page.locator('input[type=file]').setInputFiles({name:'fictional.png',mimeType:'image/png',buffer:Buffer.from(imageBytes,'base64')});
 await page.getByRole('button',{name:'اعتماد الإطار',exact:true}).click();
 await page.locator('.nf-photo-consent input').waitFor();
 const reframe=page.getByRole('button',{name:'تعديل الإطار',exact:true});
 await reframe.click();
 const zoom=page.getByRole('slider',{name:'التكبير'});
 await zoom.press('End');
 await page.locator('.portrait-crop-stage').press('ArrowLeft');
 await page.locator('.portrait-crop-stage').press('ArrowLeft');
 const sample=await page.locator('.portrait-crop-stage canvas').evaluate(canvas=>[...canvas.getContext('2d').getImageData(160,200,1,1).data]);
 await capture('crop-'+gender);
 await page.getByRole('button',{name:'اعتماد الإطار',exact:true}).click();
 await reframe.click();
 assert.equal(await zoom.inputValue(),'2.5');
 assert.deepEqual(await page.locator('.portrait-crop-stage canvas').evaluate(canvas=>[...canvas.getContext('2d').getImageData(160,200,1,1).data]),sample);
 await page.getByRole('button',{name:'إلغاء',exact:true}).click();
 const rendered=await page.locator('.nf-photo-stage img').evaluate(async img=>{
   await img.decode();
   const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
   const ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
   return {width:c.width,height:c.height,pixel:[...ctx.getImageData(320,400,1,1).data]};
 });
 assert.deepEqual([rendered.width,rendered.height],[640,800]);
 assert.ok(sample.every((value,i)=>Math.abs(value-rendered.pixel[i])<=4),'Public image must match the approved crop');
 if(gender==='man')await page.evaluate(()=>{
   window.__testTracks=[];
   let attempts=0;
   navigator.mediaDevices.getUserMedia=async()=>{
     if(++attempts===1)throw new DOMException('Test permission denied','NotAllowedError');
     const c=document.createElement('canvas'); c.width=240; c.height=320;
     const ctx=c.getContext('2d'),media=c.captureStream(8),track=media.getVideoTracks()[0];
     window.__testTracks.push(track);
     let count=0;
     const timer=setInterval(()=>{if(track.readyState==='ended'){clearInterval(timer);return;}ctx.fillStyle=count++%2?'#956274':'#a97688';ctx.fillRect(0,0,c.width,c.height);},80);
     return media;
   };
 });
 await page.locator('.nf-photo-consent input').check();
 if(gender==='man'){
   const camera=page.getByRole('dialog',{name:'مطابقة صورتك'});
   await camera.waitFor();
   assert.equal(await camera.getByRole('button',{name:'فتح الكاميرا'}).isDisabled(),true);
   assert.equal(await camera.locator('img').getAttribute('src'),await page.locator('.nf-photo-stage img').getAttribute('src'));
   await camera.getByRole('button',{name:'إلغاء التحقق'}).click();
   await page.getByRole('button',{name:'إعادة المحاولة',exact:true}).click();
   await camera.getByRole('checkbox').check();
   await camera.getByRole('button',{name:'فتح الكاميرا'}).click();
   await camera.getByRole('alert').waitFor();
   await camera.getByRole('button',{name:'فتح الكاميرا'}).click();
   await camera.getByRole('button',{name:'التقاط صورتي'}).click();
   const review=page.getByRole('dialog',{name:'راجع لقطة المطابقة'});
   await review.waitFor();
   assert.equal(await page.evaluate(()=>window.__testTracks[0].readyState),'ended');
   await review.getByRole('button',{name:'إعادة الالتقاط'}).click();
   await camera.getByRole('button',{name:'التقاط صورتي'}).click();
   await capture('compare-man');
   assert.equal(await page.evaluate(()=>window.__testTracks.every(t=>t.readyState==='ended')),true);
   await review.getByRole('button',{name:'مطابقة الصورة',exact:true}).click();
 }
 await page.getByText(gender==='man'?'صورتك جاهزة، اكتملت مطابقة الصورة.':'صورتك جاهزة بإعدادات الخصوصية التي اخترتِها.',{exact:true}).waitFor({timeout:30000});
 assert.deepEqual(await page.evaluate(()=>window.__photoCalls),gender==='man'?['stage:man','verify:mock']:['stage:woman']);
 await capture('verified-'+gender);
 await next();await page.locator('main[data-chapter=readiness]').waitFor();
 await page.getByRole('button',{name:'رجوع',exact:true}).click();
 await page.locator('main[data-chapter=avatar]').waitFor();
 await reframe.click();
 assert.equal(await zoom.inputValue(),'2.5');
 await page.getByRole('button',{name:'اعتماد الإطار',exact:true}).click();
 const stagedCalls=gender==='man'?['stage:man','verify:mock']:['stage:woman'];
 assert.deepEqual(await page.evaluate(()=>window.__photoCalls),stagedCalls,'Back and unchanged framing must retain the staged image');
 if(gender==='woman')assert.equal(await page.locator('#portrait-blur').isEnabled(),true);
 await page.evaluate(()=>{window.__failDiscard=true;});
 const consent=page.locator('.nf-photo-consent input');
 await consent.click();
 await page.getByText('تعذّر إلغاء حفظ الصورة. حاول مجددًا لإزالتها.',{exact:true}).waitFor();
 assert.equal(await consent.isChecked(),true);
 await consent.click();
 await page.locator('.nf-photo-stage img').waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>window.__photoCalls),[...stagedCalls,'discard:fictional-photo']);
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);
 console.log('PASS: '+gender+' crop, reframe, cancellation and exported pixels; '+(gender==='man'?'comparison, permission denial, retry, capture and retake with synthetic camera frames; ':'')+'mocked photo service advanced to readiness');
}catch(error){await page?.screenshot({path:resolve(artifacts,'failure.png'),fullPage:true}).catch(()=>{});console.error(await page?.locator('body').innerText().catch(()=>''));throw error;}finally{await browser?.close();await server.close();}
