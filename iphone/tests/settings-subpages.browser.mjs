import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);const {chromium}=require('C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output=resolve('.tmp/settings-pass2');await mkdir(output,{recursive:true});
const server=await createServer({optimizeDeps:{entries:['tests/fixtures/settings-qa.html']},server:{host:'127.0.0.1',port:5286,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[],external=[];page.setDefaultTimeout(60000);
page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1'||['data:','blob:'].includes(u.protocol))return r.continue();external.push(u.origin);return r.abort();});
try {
 for(const width of [390,320]){
 await page.setViewportSize({width,height:844});await page.goto('http://127.0.0.1:5286/tests/fixtures/settings-qa.html');await page.locator('.st-title').waitFor();
 if(width===320){await page.getByRole('switch',{name:'تكبير النص',exact:true}).click();await page.getByRole('switch',{name:'تقليل الحركة',exact:true}).click();}
 async function capture(name){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');await page.screenshot({path:resolve(output,`${name}-${width}.png`),fullPage:true});}
 await capture('settings');
 await page.getByRole('button',{name:/عضويتي/}).click();await capture('membership');await page.getByRole('button',{name:'العودة للتجربة',exact:true}).click();
 await page.getByRole('button',{name:/الخصوصية وشروط العضوية/}).click();await capture('policy');await page.locator('.flow-header .f-icon').click();
 await page.getByRole('button',{name:/صورتي الخاصة/}).click();await capture('private-photo');await page.getByRole('button',{name:'إغلاق الصور الخاصة',exact:true}).click();await page.getByRole('button',{name:/خصوصية بيانات الملف/}).click();await capture('data-privacy');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/إيقاف الترشيحات مؤقتًا/}).click();await capture('pause-confirm');await page.getByRole('button',{name:'تراجع',exact:true}).click();
 await page.getByRole('button',{name:'عرض ملفي كما يراه الآخرون',exact:true}).click();await page.locator('.mp-profile').waitFor();await capture('own-profile');await page.locator('.mp-back').click();
 await page.locator('.st-member-photos').click();await page.locator('.pg-open').waitFor();await capture('gallery');await page.locator('.pg-open').click();await page.locator('.pg-lightbox[open]').waitFor();await capture('lightbox');assert(await page.locator('.pg-close').evaluate(e=>e.getBoundingClientRect().height>=44));await page.keyboard.press('Escape');await page.locator('.pg-remove').click();await capture('photo-confirm');await page.getByRole('button',{name:'تراجع',exact:true}).click();await page.locator('.mp-back').click();
 for(const [entry,screen,name] of [['.st-family-entry button','.fb-screen','family'],['.st-readiness-entry button','.rp-screen','passport']]){await page.locator(entry).click();await page.locator(screen).waitFor();await page.waitForTimeout(250);await capture(name);if(width===320)assert.equal(await page.locator(name==='family'?'.fb-hero':'.rp-cover').evaluate(e=>getComputedStyle(e).animationName),'none');await page.locator(screen+' header button').first().click();assert(await page.locator(entry).evaluate(e=>document.activeElement===e),'back focus');}
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>document.documentElement.dataset.nfMotion='system');await page.locator('.st-family-entry button').click();assert.equal(await page.locator('.fb-hero').evaluate(e=>getComputedStyle(e).animationName),'none');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: three settings passes; 390px and 320px + large text/app reduced motion; no overflow, gallery targets, dialogs cancelled, panel return focus, zero external requests.');
}finally{await browser.close();await server.close();}
