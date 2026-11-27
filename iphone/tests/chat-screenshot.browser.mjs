// UIKit is represented by the Capacitor callback only. OS screenshot rendering needs a physical iPhone.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const { chromium } = createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({root,cacheDir:'node_modules/.vite-capture-privacy',optimizeDeps:{entries:['tests/fixtures/chat-privacy-qa.html']},server:{host:'127.0.0.1',port:0,hmr:false}});
await server.listen();
const browser = await chromium.launch({channel:'chrome'});
try {
  const context = await browser.newContext({locale:'ar-SA',viewport:{width:390,height:844},reducedMotion:'reduce'});
  const sender=await context.newPage(), peer=await context.newPage(), errors=[];
  for(const page of [sender,peer]) page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const mockPlatform = platform => {
    window.CapacitorCustomPlatform={name:platform};
    window.__glows=0;
    const listeners = new Map();
    window.__emitCapture=(context=window.__visibleChat) => {
      const eventId=crypto.randomUUID();
      listeners.forEach(callback=>callback({context,eventId}));
      return eventId;
    };
    window.Capacitor={
      PluginHeaders:[{name:'PrivateSession',methods:[
        ...['setScreenshotContext','setCaptureScope','showScreenshotGlow','read','save','clear'].map(name=>({name,rtype:'promise'})),
        ...['addListener','removeListener'].map(name=>({name,rtype:'callback'})),
      ]}],
      nativePromise:async(_plugin,method,options)=>{
        if(method==='read')return {token:null};
        if(method==='showScreenshotGlow')window.__glows++;
        if(method==='setScreenshotContext'){
          if(options.active)window.__visibleChat=options.context;
          else if(window.__visibleChat===options.context)window.__visibleChat=null;
        }
      },
      nativeCallback:async(_plugin,method,options,callback)=>{
        if(method==='removeListener'){listeners.delete(options.callbackId);return;}
        const id=crypto.randomUUID();
        if(options.eventName==='chatScreenshot')listeners.set(id,callback);
        return id;
      },
    };
  };
  await sender.addInitScript(mockPlatform,'ios');
  await peer.addInitScript(mockPlatform,'web');
  const base=server.resolvedUrls.local[0]+'tests/fixtures/chat-privacy-qa.html?case=notice&captures&actor=';
  await Promise.all([sender.goto(base+'reham'),peer.goto(base+'abdulrahman')]);
  const open = page => page.getByRole('button',{name:/فتح المحادثة مع/}).first();
  await open(peer).waitFor({timeout:90000});
  await sender.bringToFront();
  await open(sender).click({timeout:90000});
  await sender.waitForFunction(()=>!!window.__visibleChat);
  const old=await sender.evaluate(()=>window.__visibleChat);
  const output=resolve(root,'.tmp/chat-screenshot');
  await mkdir(output,{recursive:true});
  for(const width of [320,390,430]) {
    await sender.setViewportSize({width,height:844});
    assert.equal(await sender.locator('.cm-chat-capture-notice').count(),0,'no persistent screenshot disclosure');
  }
  // A shortcut on its own and a stale/wrong context cannot create an alert.
  await sender.keyboard.press('PrintScreen');
  await sender.evaluate(()=>window.__emitCapture());
  if(await sender.locator('#wd-capture-note').isVisible()) await sender.locator('.wd-capture-resume').click();
  await sender.evaluate(()=>{
    window.__emitCapture(crypto.randomUUID());
    window.dispatchEvent(new Event('wudayn:privacy-covered'));
    window.__emitCapture();
    window.dispatchEvent(new Event('wudayn:privacy-visible'));
  });
  assert.equal(await sender.locator('.cm-chat-capture-notice [role=alert]').count(),0);
  assert.equal(await sender.locator('.cm-chat-capture-event').count(),0,'covered or unrelated captures stay out of chat');
  const event=await sender.evaluate(()=>window.__emitCapture());
  const ownNotice=sender.locator('.cm-chat-capture-event');
  await ownNotice.getByText('لقطة شاشة منك',{exact:true}).waitFor();
  const capturedAt=await ownNotice.locator('time').getAttribute('datetime');
  const retry=sender.getByRole('button',{name:'إعادة المحاولة',exact:true});
  await retry.waitFor();
  assert.equal(await peer.locator('[data-kind=screenshot]').count(),0);
  await retry.click();
  await retry.waitFor({state:'hidden'});
  assert.equal(await ownNotice.count(),1,'retry keeps one sender receipt');
  assert.equal(await ownNotice.locator('time').getAttribute('datetime'),capturedAt,'retry preserves capture time');
  assert.equal(await sender.evaluate(()=>window.__glows),0,'the native glow is for incoming notices');
  const entry=peer.locator('button[data-kind=screenshot]');
  await peer.bringToFront();
  await entry.waitFor({timeout:15000});
  await entry.click();
  await peer.locator('[data-conversation-id="local-privacy-qa"] .cm-chat-capture-notice strong').waitFor();
  assert((await peer.locator('.cm-chat-capture-notice strong').textContent()).includes('رهام'));
  const rect=await peer.locator('.cm-chat-capture-event').boundingBox();
  assert(rect&&rect.width<=430&&rect.height<50,'compact in-chat event');
  await sender.bringToFront();
  await sender.getByRole('button',{name:'رجوع',exact:true}).click();
  await sender.waitForFunction(()=>!window.__visibleChat);
  await sender.evaluate(previous=>window.__emitCapture(previous),old);
  await sender.getByRole('button',{name:'فتح المحادثة مع عضو ثانٍ'}).click();
  await sender.waitForFunction(previous=>window.__visibleChat&&window.__visibleChat!==previous,old);
  await sender.evaluate(previous=>window.__emitCapture(previous),old);
  assert.equal(await sender.locator('.cm-chat-capture-event').count(),0,'a receipt stays in its own conversation');
  const stored=await sender.evaluate(()=>JSON.parse(localStorage.getItem('nisfayn-local-chat-privacy-qa-notice-captures')||'[]'));
  assert.deepEqual(stored.map(row=>[row.requestId,row.id]),[['local-privacy-qa',event]]);
  const nativePeer=await context.newPage();
  nativePeer.on('pageerror',e=>errors.push(e.message));
  await nativePeer.addInitScript(mockPlatform,'ios');
  await nativePeer.goto(base+'abdulrahman');
  await nativePeer.bringToFront();
  await nativePeer.locator('button[data-kind=screenshot]').click();
  await nativePeer.waitForFunction(()=>!!window.__visibleChat);
  const notice=page=>page.locator('.cm-chat-capture-event time');
  await notice(nativePeer).waitFor();
  assert.equal(await nativePeer.evaluate(()=>window.__glows),0,'opening a recent alert is history');
  const store='nisfayn-local-chat-privacy-qa-notice-captures';
  async function receive(page) {
    const timestamp=await sender.evaluate(key=>{
      const rows=JSON.parse(localStorage.getItem(key));
      const createdAt=new Date().toISOString();
      rows.push({requestId:'local-privacy-qa',sender:'reham',id:crypto.randomUUID(),createdAt});
      localStorage.setItem(key,JSON.stringify(rows));
      return createdAt;
    },store);
    await page.waitForFunction(at=>document.querySelector('.cm-chat-capture-event time')?.dateTime===at,timestamp,{timeout:15000});
    assert.equal(await notice(page).count(),1,'one chat notice remains after refreshing the thread');
  }
  await receive(nativePeer);
  assert.equal(await nativePeer.evaluate(()=>window.__glows),1,'a new peer capture triggers one native glow');
  await nativePeer.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'nisfayn-local-chat-privacy-qa-notice-captures'})));
  await nativePeer.getByRole('button',{name:'رجوع',exact:true}).click();
  await open(nativePeer).click();
  await notice(nativePeer).waitFor();
  assert.equal(await nativePeer.evaluate(()=>window.__glows),1,'refresh and reopening do not replay the glow');
  await nativePeer.evaluate(()=>{const sheet=document.createElement('dialog');sheet.id='test-sheet';document.body.append(sheet);sheet.showModal();});
  await receive(nativePeer);
  await nativePeer.evaluate(()=>document.querySelector('#test-sheet').remove());
  assert.equal(await nativePeer.evaluate(()=>window.__glows),1,'a modal suppresses the glow');
  await peer.bringToFront();
  await receive(peer);
  assert.equal(await peer.evaluate(()=>window.__glows),0,'a browser receives the notice without native feedback');
  assert.deepEqual(errors,[]);
  console.log('Verified both in-chat receipts, retry without duplication, exact chat routing, peer-only iOS glow, modal/replay suppression, and layout at 320, 390 and 430px.');
} finally {await browser.close();await server.close();}
