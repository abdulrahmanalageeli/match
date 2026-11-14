import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NISFAYN_PLAYWRIGHT_MODULE||'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output=resolve('.tmp/accepted-thread');await mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5283,strictPort:true}});await server.listen();
let browser,page;const errors=[],external=[];
try {
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['microphone']});
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const url=new URL(r.request().url());if(url.hostname==='127.0.0.1'||url.protocol==='blob:'||url.protocol==='data:')return r.continue();external.push(url.origin);return r.abort();});
 await page.goto('http://127.0.0.1:5283/tests/fixtures/chat-privacy-qa.html?actor=abdulrahman&case='+Date.now());
 await page.getByRole('button',{name:/فتح المحادثة مع/}).click();
 await page.getByRole('textbox',{name:'رسالتك'}).waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:resolve(output,'thread.png')});
 const sizes=await page.locator('.cm-media-tools button,.cm-chat-head > button,.cm-chat-compose form > button').evaluateAll(els=>els.map(e=>({label:e.getAttribute('aria-label'),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
 assert(sizes.every(s=>s.w>=44&&s.h>=44),JSON.stringify(sizes));
 const input=page.getByRole('textbox',{name:'رسالتك'});
 await input.fill('يسعدني أن نبدأ حديثنا بهدوء.');await page.getByRole('button',{name:'إرسال الرسالة',exact:true}).click();
 assert(await input.evaluate(e=>document.activeElement===e),'composer retains focus');
 await page.getByLabel('جارٍ الإرسال',{exact:true}).waitFor();
 await page.getByLabel('تم التسليم',{exact:true}).last().waitFor();
 await page.locator('.cm-message-row').last().getByLabel('قُرئت',{exact:true}).waitFor();
 await page.screenshot({path:resolve(output,'receipt.png')});
 async function hold(row){const bubble=row.locator('.cm-bubble > p').last();await bubble.scrollIntoViewIfNeeded();const box=await bubble.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(520);await page.mouse.up();}
 await hold(page.locator('[data-server-id="hello"]'));await page.getByRole('button',{name:'تفاعل قلب',exact:true}).click();await page.locator('[data-server-id="hello"] .cm-reaction-chip').waitFor();
 await hold(page.locator('[data-server-id="hello"]'));await page.waitForTimeout(400);await page.screenshot({path:resolve(output,'actions.png')});await page.getByRole('button',{name:'الرد على الرسالة',exact:true}).click();await page.locator('.cm-reply-draft').waitFor();
 await input.fill('شكرًا، وأنا أيضًا.');await page.getByRole('button',{name:'إرسال الرسالة',exact:true}).click();await page.waitForTimeout(1100);
 await hold(page.locator('.cm-message-row').last());await page.getByRole('button',{name:'حذف لدى الجميع',exact:true}).click();
 await page.screenshot({path:resolve(output,'delete.png')});
 await page.getByRole('button',{name:'حذف لدى الجميع',exact:true}).click();await page.locator('.cm-message-row').last().getByText('تم حذف هذه الرسالة',{exact:true}).waitFor();
 await page.getByLabel('اختيار صورة للمحادثة').setInputFiles(resolve('public/demo/portraits/sarah-realistic-v2.webp'));
 await page.getByRole('button',{name:'إرسال المرفق',exact:true}).waitFor();await page.screenshot({path:resolve(output,'photo-preview.png')});await page.getByRole('button',{name:'إرسال المرفق',exact:true}).click();await page.waitForTimeout(700);
 await page.getByRole('button',{name:'رسالة صوتية',exact:true}).click();await page.waitForTimeout(1300);await page.getByRole('button',{name:'إنهاء التسجيل ومعاينته'}).click();await page.getByRole('button',{name:'إرسال المرفق',exact:true}).waitFor();await page.waitForTimeout(400);await page.screenshot({path:resolve(output,'voice-preview.png')});await page.getByRole('button',{name:'إرسال المرفق',exact:true}).click();await page.waitForTimeout(700);
 await page.locator('.cm-message-row').last().getByRole('button',{name:'تشغيل التسجيل الصوتي'}).click();await page.waitForTimeout(300);
 await page.getByRole('button',{name:'إذن المكالمات',exact:true}).click();await page.getByRole('button',{name:'إرسال دعوة للمكالمات'}).click();await page.getByRole('heading',{name:'الدعوة وصلت'}).waitFor();await page.screenshot({path:resolve(output,'call-request.png')});await page.getByRole('button',{name:'إغلاق',exact:true}).click();
 await input.focus();await page.setViewportSize({width:390,height:480});await page.waitForTimeout(150);
 assert.equal(await page.locator('.cm-chat-plan').isVisible(),false);assert((await input.boundingBox()).y<480);await page.screenshot({path:resolve(output,'keyboard-simulation.png')});
 await page.setViewportSize({width:320,height:667});await input.blur();await page.waitForTimeout(150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(output,'small-phone.png')});
 for(const mode of ['os','app']){await page.emulateMedia({reducedMotion:mode==='os'?'reduce':'no-preference'});if(mode==='app')await page.evaluate(()=>document.documentElement.dataset.nfMotion='reduced');await input.fill('فحص تقليل الحركة '+mode);await page.getByRole('button',{name:'إرسال الرسالة',exact:true}).click();assert.equal(await page.locator('.cm-bubble[data-composed]').evaluate(e=>getComputedStyle(e).animationName),'none');await page.waitForTimeout(900);}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: accepted entry, 44px targets, optimistic text/focus, sent/delivered/read, real hold/reaction/reply/delete, photo upload, fake microphone recording/playback, call request, keyboard geometry, 320px overflow, OS/app reduced motion; zero external requests.');
}catch(error){await page?.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});console.error({errors,external});throw error;}finally{await browser?.close();await server.close();}

