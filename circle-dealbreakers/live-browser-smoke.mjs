import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/timgo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const hostCode=(await readFile(new URL('.env.host',import.meta.url),'utf8')).trim().split('=')[1];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();let hostLoggedIn=false;
try{
 await page.goto('https://blindmatch.app/circle/host.html',{waitUntil:'networkidle',timeout:45000});
 await page.locator('#login').waitFor({state:'visible'});
 await page.locator('#host-code').fill(hostCode);await page.locator('#login-form button').click();
 await page.locator('#dashboard').waitFor({state:'visible',timeout:30000});hostLoggedIn=true;
 const cookie=(await context.cookies()).find(c=>c.name==='circle_host');assert(cookie?.httpOnly&&cookie?.secure&&cookie?.sameSite==='Lax');
 assert(!(await page.evaluate(()=>document.cookie)).includes('circle_host'));
 await page.screenshot({path:'circle-dealbreakers/live-host.png',fullPage:true});
 await page.goto('https://blindmatch.app/circle/presenter.html');await page.locator('#original-slide').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('original-slide').naturalWidth>0);assert.equal(await page.locator('#locked').isVisible(),false);
 await page.locator('#join-toggle').click();await page.locator('#join-dialog').waitFor({state:'visible'});await page.screenshot({path:'circle-dealbreakers/live-join-qr.png'});
 await page.goto('https://blindmatch.app/circle/report.html');await page.locator('#report-toolbar').waitFor({state:'visible',timeout:30000});
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});const guest=await mobile.newPage();await guest.goto('https://blindmatch.app/circle/');await guest.locator('#open-anonymous').waitFor({state:'visible',timeout:30000});await guest.locator('#open-anonymous').click();await guest.locator('#anonymous-dialog').waitFor({state:'visible'});assert(await guest.locator('#anonymous-text').isVisible());assert.equal(await guest.locator('#guest-name').count(),0);assert(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await guest.screenshot({path:'circle-dealbreakers/live-mobile-join.png',fullPage:true});await mobile.close();
 console.log('Live browser passed: anonymous mobile popup without login, original presentation/QR, private anonymous list and report.');
}finally{
 if(hostLoggedIn)await page.evaluate(async()=>{const {api}=await import('./event-api.js');await api('hostLogout');}).catch(()=>{});
 await browser.close();
}

