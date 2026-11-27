import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const server = await createServer({server:{host:'127.0.0.1',port:0}});
await server.listen();
let browser;
try {
  browser = await chromium.launch({channel:'chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const context = await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true,permissions:['microphone']});
  context.setDefaultTimeout(15_000);
  const sender = await context.newPage(), peer = await context.newPage();
  const faults = [];
  for (const page of [sender,peer]) page.on('pageerror',error => faults.push(error.message));
  const attempts = Array.from({length:4},()=>Promise.withResolvers());
  let uploadIndex = 0;
  await context.route('**/__qa/upload/*', async route => {
    const status = await new Promise(resolve => attempts[uploadIndex++].resolve({id:route.request().url().split('/').at(-1), finish:resolve}));
    await route.fulfill({status,body:''});
  });
  const url = 'http://127.0.0.1:'+server.httpServer.address().port+'/tests/fixtures/chat-privacy-qa.html?delivery&case='+Date.now();
  await Promise.all([[sender,'abdulrahman'],[peer,'reham']].map(async ([page,actor])=>{
    await page.goto(url+'&actor='+actor);
    await page.getByRole('button',{name:/فتح المحادثة مع/}).click();
    await page.getByRole('textbox',{name:'رسالتك'}).waitFor();
  }));
  const pagesRead = () => peer.evaluate(()=>performance.getEntriesByName('qa-thread-page').length);
  const start = await pagesRead();
  const baseline = await peer.locator('.cm-message-row').count();
  async function photo(once) {
    await sender.getByLabel('اختيار صورة للمحادثة').setInputFiles(resolve('public/brand/arrival/riyadh-sunset.webp'));
    if (once) await sender.getByRole('checkbox',{name:/عرض لمرة واحدة/}).check();
    await sender.getByRole('button',{name:'إرسال المرفق',exact:true}).click();
  }
  async function pending() {
    const row = sender.locator('.cm-message-row').filter({has:sender.getByLabel('جارٍ الإرسال',{exact:true})});
    await row.waitFor();
    assert.equal(await sender.locator('.cm-media-preview').count(),0);
    assert(await sender.getByRole('textbox',{name:'رسالتك'}).isEditable());
    return row;
  }
  async function confirm(index, expectedCount) {
    (await attempts[index].promise).finish(200);
    await peer.waitForFunction(count=>document.querySelectorAll('.cm-message-row').length===count,expectedCount);
    const id = await peer.locator('.cm-message-row').last().getAttribute('data-server-id');
    await sender.locator('[data-server-id="'+id+'"] [data-receipt]').waitFor();
    assert.equal(await sender.locator('.cm-message-row').count(),expectedCount);
    assert(await peer.evaluate(id=>performance.getEntriesByName('qa-thread-rows').some(mark=>mark.detail.includes(id)),id));
  }
  await photo(false);
  const first = await pending();
  await first.locator('img[src^="blob:"]').waitFor();
  const originalPreview = await first.locator('img').getAttribute('src');
  assert.equal(await peer.locator('.cm-message-row').count(),baseline);
  (await attempts[0].promise).finish(503);
  const failed = sender.locator('.cm-message-row').filter({has:sender.getByRole('button',{name:'إعادة الإرسال'})});
  await failed.waitFor();
  await failed.getByRole('button',{name:'إعادة الإرسال'}).click();
  await pending();
  assert.equal((await attempts[1].promise).id,(await attempts[0].promise).id);
  await confirm(1,baseline+1);
  assert.equal(await sender.locator('.cm-message-row').last().locator('img').getAttribute('src'),originalPreview,'the photo stays visible through acknowledgement');
  await photo(true);
  const once = await pending();
  assert.equal(await once.locator('img').count(),0);
  await once.getByRole('button',{name:'صورة لمرة واحدة أرسلتها'}).waitFor();
  await confirm(2,baseline+2);
  await peer.locator('.cm-message-row').last().getByRole('button',{name:'فتح الصورة لمرة واحدة'}).waitFor();
  await peer.getByRole('button',{name:'رسالة صوتية',exact:true}).click();
  await peer.getByRole('button',{name:'إنهاء التسجيل ومعاينته'}).waitFor();
  await peer.waitForTimeout(1200);
  await peer.getByRole('button',{name:'إنهاء التسجيل ومعاينته'}).click();
  await peer.getByRole('button',{name:'إرسال المرفق',exact:true}).click();
  const voice = peer.locator('.cm-message-row').last();
  await voice.getByLabel('جارٍ الإرسال',{exact:true}).waitFor();
  await voice.locator('audio').waitFor({state:'attached'});
  assert.equal(await sender.locator('.cm-message-row').count(),baseline+2);
  (await attempts[3].promise).finish(200);
  await sender.locator('.cm-message-row').last().getByRole('button',{name:'تشغيل التسجيل الصوتي'}).waitFor();
  await voice.locator('[data-receipt]').waitFor();
  assert.equal(await pagesRead(),start,'no additional thread pages during incremental delivery');
  await peer.evaluate(()=>{
    for (const kind of ['typing','ownRead']) window.dispatchEvent(new CustomEvent('qa-chat-wake',{detail:{kind,requestId:'local-privacy-qa'}}));
    for (const kind of ['typing','message','receipt','ownRead']) window.dispatchEvent(new CustomEvent('qa-chat-wake',{detail:{kind,requestId:'another-room',messageId:'not-in-this-room'}}));
  });
  assert.equal(await pagesRead(),start,'unrelated signals do not read this thread');
  const rowReads = await peer.evaluate(()=>performance.getEntriesByName('qa-thread-rows').length);
  await peer.evaluate(()=>window.dispatchEvent(new CustomEvent('qa-chat-wake',{detail:{kind:'receipt',requestId:'local-privacy-qa'}})));
  await peer.waitForFunction(before=>performance.getEntriesByName('qa-thread-rows').length>before,rowReads);
  assert.equal(await pagesRead(),start,'receipts update outgoing rows without paging the conversation');
  await peer.evaluate(()=>window.dispatchEvent(new CustomEvent('qa-chat-wake')));
  await peer.waitForFunction(initial=>performance.getEntriesByName('qa-thread-page').length>initial,start);
  assert.deepEqual(faults,[]);
  console.log('Two accounts passed photo failure and retry, view-once, reverse-direction voice, scoped reads and full recovery.');
} finally {
  await browser?.close();
  await server.close();
}
