// Local-only account entry: exercise real UI with a stubbed phone confirmation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output = resolve(root, '.tmp/auth-app-entry');
await mkdir(output, { recursive: true });
const fixture = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {Auth} from '/src/Screens.tsx';import '/src/design.css';import '/src/flows.css';import '/src/screens.css';import '/src/motion.css';import '/src/arrivalSurfaces.css';import '/src/typography.css';
window.__submitted=[];window.__sms=[];window.__privacy=0;window.__back=0;
function Fixture(){const[login,setLogin]=useState(false);return <div className="phone-app"><Auth login={login} ready busy={false} back={()=>window.__back++} switchMode={()=>setLogin(v=>!v)} submit={(...args)=>window.__submitted.push(args)} onPrivacy={()=>window.__privacy++} onDemo={()=>{}} onPhoneVerified={()=>{}}/></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
const server = await createServer({root,mode:'demo',configFile:resolve(root,'vite.config.ts'),cacheDir:resolve(root,'node_modules/.vite-auth-app-entry'),server:{host:'127.0.0.1',port:5292,strictPort:true},
  optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react','@capacitor/core','react-native-reanimated','react-native-worklets','@supabase/supabase-js']},
  plugins:[{name:'local-auth-entry',enforce:'pre',resolveId(id){if(id==='virtual:auth-app-entry')return '\0auth-app-entry';if(id.endsWith('/auth/SignupSms'))return '\0signup-confirm-stub';},
    async load(id){if(id==='\0auth-app-entry')return(await transformWithEsbuild(fixture,'auth-fixture.tsx',{loader:'tsx',jsx:'automatic'})).code;if(id==='\0signup-confirm-stub')return 'export async function confirmSignupSms(email){window.__sms.push(email);return {phoneProof:"local-test-proof",deviceId:"local-test-device"}}';},
    configureServer(dev){dev.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/__auth-app-entry')){res.setHeader('Content-Type','text/html');res.end(await dev.transformIndexHtml('/__auth-app-entry','<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/@id/__x00__auth-app-entry"></script></body></html>'));return;}next();});}}]});
await server.listen();let browser;const errors=[];
try{browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.goto('http://127.0.0.1:5292/__auth-app-entry',{waitUntil:'domcontentloaded',timeout:60000});await page.locator('input[name=email]').waitFor();await page.waitForTimeout(800);
 for(const width of [320,390,430,1024]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('input[name=email]').evaluate(el=>getComputedStyle(el).fontSize),'16px');assert.equal(await page.locator('input[name=email]').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','group rows must not retain boxed web inputs');}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'credentials-390.png'),fullPage:true});
 await page.getByRole('button',{name:'متابعة',exact:true}).click();assert.equal(await page.locator('[data-entry-step=credentials]').count(),1,'empty credentials cannot progress');
 await page.locator('input[name=email]').fill('qa@example.com');await page.locator('input[name=password]').fill('local-password-12');await page.getByRole('button',{name:'متابعة',exact:true}).click();
 await page.locator('[data-entry-step=consent]').waitFor();assert.equal(await page.locator('input[type=checkbox]:checked').count(),0);assert.equal(await page.locator('input[name=email]').count(),0);
 assert.deepEqual(await page.evaluate(()=>window.__sms),[],'credential step cannot send SMS');assert.deepEqual(await page.evaluate(()=>window.__submitted),[],'credential step cannot create account');
 const create=page.getByRole('button',{name:'إنشاء الحساب',exact:true});assert.equal(await create.isDisabled(),true);await page.screenshot({path:resolve(output,'consent-390.png'),fullPage:true});
 await page.getByRole('button',{name:'قراءة شروط الاستخدام وإشعار الخصوصية',exact:true}).click();assert.equal(await page.evaluate(()=>window.__privacy),1);
 const choices=page.locator('input[type=checkbox]');assert.equal(await choices.nth(0).evaluate(el=>getComputedStyle(el).appearance),'none');await choices.nth(0).check();assert.equal(await choices.nth(0).evaluate(el=>getComputedStyle(el,'::after').content),'""');await choices.nth(1).check();assert.equal(await create.isDisabled(),true);await choices.nth(2).check();assert.equal(await create.isDisabled(),false);
 await page.getByRole('button',{name:'رجوع',exact:true}).click();assert.equal(await page.locator('input[name=email]').inputValue(),'qa@example.com');assert.equal(await page.locator('input[name=password]').inputValue(),'local-password-12');assert.equal(await page.evaluate(()=>window.__back),0);
 await page.getByRole('button',{name:'متابعة',exact:true}).click();await create.click();await page.waitForFunction(()=>window.__submitted.length===1);
 const submitted=await page.evaluate(()=>window.__submitted[0]);assert.equal(submitted[0],'qa@example.com');assert.equal(submitted[2].adult,true);assert.equal(submitted[2].terms,true);assert.equal(submitted[2].privacy,true);assert.ok(submitted[2].version);assert.equal(submitted[3].phoneProof,'local-test-proof');
 await page.getByRole('button',{name:'لدي حساب بالفعل',exact:true}).click();await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();await page.waitForFunction(()=>window.__submitted.length===2);assert.equal(await page.evaluate(()=>window.__sms.length),1,'login does not use signup phone confirmation');
 assert.deepEqual(errors,[]);console.log('Passed: responsive entry, required credentials, consent gating, privacy link, back preservation, SMS handoff and login.');
}finally{await browser?.close();await server.close();}
