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
  await sender.addInitScript(() => {
    window.CapacitorCustomPlatform={name:'ios'};
    const listeners = new Map();
    window.__emitCapture=(context=window.__visibleChat) => {
      const eventId=crypto.randomUUID();
      listeners.forEach(callback=>callback({context,eventId}));
      return eventId;
    };
    window.Capacitor={
      PluginHeaders:[{name:'PrivateSession',methods:[
        ...['setScreenshotContext','setCaptureScope','read','save','clear'].map(name=>({name,rtype:'promise'})),
        ...['addListener','removeListener'].map(name=>({name,rtype:'callback'})),
      ]}],
      nativePromise:async(_plugin,method,options)=>{
        if(method==='read')return {token:null};
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
  });
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
    const notice=sender.locator('.cm-chat-capture-notice');
    const rect=await notice.boundingBox();
    assert(rect && rect.width<=width && rect.x>=0 && rect.height<90,`Unreadable chat disclosure at ${width}`);
    assert((await notice.textContent()).includes('لقطات المتصفح'));
    await notice.screenshot({path:resolve(output,`notice-${width}.png`)});
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
  const event=await sender.evaluate(()=>window.__emitCapture());
  const retry=sender.getByRole('button',{name:'إعادة المحاولة',exact:true});
  await retry.waitFor();
  assert.equal(await peer.locator('[data-kind=screenshot]').count(),0);
  await retry.click();
  await retry.waitFor({state:'hidden'});
  const entry=peer.locator('button[data-kind=screenshot]');
  await peer.bringToFront();
  await entry.waitFor({timeout:15000});
  await entry.click();
  await peer.locator('[data-conversation-id="local-privacy-qa"] .cm-chat-capture-notice strong').waitFor();
  assert((await peer.locator('.cm-chat-capture-notice strong').textContent()).includes('رهام'));
  await sender.bringToFront();
  await sender.getByRole('button',{name:'رجوع',exact:true}).click();
  await sender.waitForFunction(()=>!window.__visibleChat);
  await sender.evaluate(previous=>window.__emitCapture(previous),old);
  await sender.getByRole('button',{name:'فتح المحادثة مع عضو ثانٍ'}).click();
  await sender.waitForFunction(previous=>window.__visibleChat&&window.__visibleChat!==previous,old);
  await sender.evaluate(previous=>window.__emitCapture(previous),old);
  const stored=await sender.evaluate(()=>JSON.parse(localStorage.getItem('nisfayn-local-chat-privacy-qa-notice-captures')||'[]'));
  assert.deepEqual(stored.map(row=>[row.requestId,row.id]),[['local-privacy-qa',event]]);
  assert.deepEqual(errors,[]);
  console.log('Verified callback routing, cover and navigation suppression, retry, peer notification and layout at 320, 390 and 430px.');
} finally {await browser.close();await server.close();}
