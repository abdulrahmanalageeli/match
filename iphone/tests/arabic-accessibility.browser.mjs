import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output = resolve('.tmp/arabic-accessibility');
await mkdir(output, {recursive:true});
const server = await createServer({
  cacheDir:'node_modules/.vite-arabic-accessibility',
  optimizeDeps:{entries:['tests/fixtures/chat-privacy-qa.html']},
  server:{host:'127.0.0.1',port:5289,strictPort:true,hmr:false},
});
await server.listen();
const browser = await chromium.launch({channel:'chrome'});
const page = await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true,locale:'ar-SA',timezoneId:'Asia/Riyadh',colorScheme:'dark',reducedMotion:'reduce'});
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', e=>errors.push(e.message));
let access = 503;
const retry = page.getByRole('button',{name:'إعادة المحاولة',exact:true});
const input = page.getByRole('textbox',{name:'رسالتك'});
try {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol==='blob:' || url.protocol==='data:') return route.continue();
    if (url.hostname!=='127.0.0.1') return route.abort();
    if (url.pathname==='/__qa/profile') return route.fulfill({status:access,json:access===200});
    return route.continue();
  });
  const url = server.resolvedUrls.local[0]+'tests/fixtures/chat-privacy-qa.html?actor=abdulrahman&interrupt&case=a11y';
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:/فتح المحادثة مع/}).click();
  await input.waitFor();
  await page.evaluate(()=>document.documentElement.style.setProperty('--nf-system-text','32px'));
  const log = page.getByRole('log');
  await page.locator('[data-server-id=hello]').waitFor();
  const snapshot = await log.ariaSnapshot();
  for (const label of ['رسالة من رهام','رسالة منك','قُرئت','أحب أن يبقى حديثنا']) assert.ok(snapshot.includes(label), label);
  const contrast = await page.locator('.cm-bubble > p,.cm-bubble time,.cm-chat-person-copy strong,.cm-chat-plan button').evaluateAll(nodes => {
    const luminance = rgb => rgb.match(/[\d.]+/g).slice(0,3).reduce((sum,channel,index) => {
      const v = Number(channel)/255;
      return sum + [0.2126,0.7152,0.0722][index] * (v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    },0);
    return nodes.filter(node=>node.getClientRects().length).map(node=>{
      let surface=node;
      while(surface.parentElement && getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)') surface=surface.parentElement;
      const ink=luminance(getComputedStyle(node).color), paper=luminance(getComputedStyle(surface).backgroundColor);
      return {text:node.textContent,ratio:(Math.max(ink,paper)+.05)/(Math.min(ink,paper)+.05)};
    });
  });
  for (const item of contrast) assert.ok(item.ratio>=4.5,JSON.stringify(item));
  const time = page.locator('[data-server-id=hello] time');
  const timestamp = await time.getAttribute('datetime');
  assert.equal(await time.textContent(),new Intl.DateTimeFormat('ar-SA',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'}).format(new Date(timestamp)));
  for (const width of [320,375,430]) {
    await page.setViewportSize({width,height:width===430?932:667});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for (const box of await page.locator('.cm-chat-head button,.cm-media-tools button,.cm-chat-compose form button').evaluateAll(nodes=>nodes.map(n=>({name:n.getAttribute('aria-label'),w:n.offsetWidth,h:n.offsetHeight})))) {
      assert.ok(box.w>=44 && box.h>=44,JSON.stringify(box));
    }
  }
  await page.setViewportSize({width:375,height:667});
  assert.equal(await page.locator('.cm-bubble p').first().evaluate(e=>getComputedStyle(e).fontSize),'32px');
  await log.evaluate(e=>{e.scrollTop=0;});
  await page.screenshot({path:resolve(output,'chat-dark-375.png')});
  await page.locator('[data-server-id=regular]').getByRole('button',{name:'فتح الصورة بحجمها الكامل'}).click();
  const closePhoto = page.getByRole('button',{name:'إغلاق الصورة',exact:true});
  assert.deepEqual(await closePhoto.evaluate(e=>[getComputedStyle(e).color,getComputedStyle(e).backgroundColor]),['rgb(255, 255, 255)','rgb(25, 21, 25)']);
  await closePhoto.click();
  await page.getByRole('button',{name:/تفاصيل اتفاقكما/}).click();
  await page.getByRole('button',{name:'إغلاق تفاصيل الاتفاق'}).click();
  await input.fill('اختبار استعادة الإرسال');
  await page.getByRole('button',{name:'إرسال الرسالة',exact:true}).click();
  const failed = page.getByRole('button',{name:'إعادة الإرسال'});
  await failed.waitFor();
  await input.fill('مسودة أخرى');
  await failed.click();
  assert.equal(await input.inputValue(),'مسودة أخرى');
  assert.equal(await input.evaluate(e=>document.activeElement===e),true);
  assert.equal(await page.getByText('اختبار استعادة الإرسال',{exact:true}).count(),1);
  await page.setViewportSize({width:375,height:350});
  await page.waitForFunction(()=>document.documentElement.hasAttribute('data-nf-chat-keyboard'));
  assert.ok((await log.boundingBox()).height>=70);
  assert.ok(await input.evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
  await page.getByLabel('اختيار صورة للمحادثة').setInputFiles(resolve('public/demo/portraits/sarah-realistic-v2.webp'));
  const sendMedia = page.getByRole('button',{name:'إرسال المرفق',exact:true});
  await sendMedia.scrollIntoViewIfNeeded();
  assert.ok(await sendMedia.evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight+1));
  assert.ok((await log.boundingBox()).height>=48);
  await page.setViewportSize({width:375,height:667});
  await page.getByRole('button',{name:'عرض ملف رهام'}).click();
  await page.getByRole('alert').filter({hasText:'تعذّر التحقق'}).waitFor();
  assert.equal(await page.locator('.mp-hero').count(),0);
  access=200;
  await retry.click();
  await page.locator('.mp-hero h1').waitFor();
  assert.ok(await page.locator('.mp-hero h1').evaluate(e=>document.activeElement===e));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:resolve(output,'profile-dark-375.png')});
  access=403;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.getByText('الملف غير متاح.').waitFor();
  assert.equal(await page.locator('.mp-hero').count(),0);
  await page.getByRole('button',{name:'العودة للمحادثة'}).click();
  await page.getByRole('button',{name:'خيارات المحادثة'}).click();
  assert.equal(await page.getByRole('button',{name:/الصور الخاصة/}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS Arabic chat semantics, Riyadh time, large text at three widths, controls, retry, constrained viewport, profile access and regular and view-once chat media.');
} catch (error) {
  console.error(errors);
  await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
  throw error;
} finally {
  await browser.close();
  await server.close();
}
