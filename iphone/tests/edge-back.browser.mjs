import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({root, cacheDir:'.tmp/node_modules/.vite-edge-back', optimizeDeps:{entries:['tests/fixtures/chat-privacy-qa.html']},
  server:{host:'127.0.0.1',port:0,hmr:false}});
await server.listen();
let browser;
try {
  browser = await chromium.launch({channel:'chrome'});
  for (const [width,height] of [[375,812],[393,852]]) {
    const page = await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,locale:'ar-SA',
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
    page.setDefaultTimeout(20000);
    page.on('pageerror',error=>console.error('Preview error:', error.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto(new URL('tests/fixtures/chat-privacy-qa.html',server.resolvedUrls.local[0]).href,{waitUntil:'commit'});
    const list=page.locator('button.cm-request').first(),chat=page.locator('.cm-chat');
    await list.click();
    await chat.waitFor();
    const cdp=await page.context().newCDPSession(page);
    const swipe=async(x,y,dx,dy)=>{
      const point=(fraction)=>[{x:x+dx*fraction,y:y+dy*fraction}];
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(0)});
      for(const fraction of [.2,.48,.75,1])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(fraction)});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    // Normal Safari retains browser history ownership.
    await page.evaluate(async()=>{const {initializeEdgeBack}=await import('/src/mobile/edgeBack.ts');initializeEdgeBack();});
    await swipe(width-6,245,-105,0);
    assert.equal(await chat.count(),1);
    await page.evaluate(async()=>{
      Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
      const {initializeEdgeBack}=await import('/src/mobile/edgeBack.ts');initializeEdgeBack();
    });
    await chat.locator('.cm-chat-person').click();
    const profile=page.locator('.mp-profile');
    await profile.waitFor();
    await swipe(6,245,105,0);
    await swipe(width-6,245,-26,0);
    await swipe(width-6,245,-18,105);
    assert.equal(await profile.count(),1);
    await page.evaluate(()=>{
      const area=document.createElement('div');
      area.id='qa-own-horizontal';
      area.dataset.nfGestureOwner='';
      area.style.cssText='position:fixed;z-index:999;inset:190px 0 auto;height:100px;';
      document.body.append(area);
    });
    await swipe(width-6,245,-120,0);
    assert.equal(await profile.count(),1);
    await page.locator('#qa-own-horizontal').evaluate(el=>{el.remove();document.documentElement.dataset.nfKeyboard='';});
    await swipe(width-6,245,-120,0);
    assert.equal(await profile.count(),1);
    await page.evaluate(()=>{delete document.documentElement.dataset.nfKeyboard;});
    await swipe(width-6,245,-120,0);
    await chat.waitFor();
    await page.evaluate(()=>{
      const dialog=document.createElement('dialog');
      dialog.innerHTML='<button data-nf-back="local" disabled>السابق</button>';
      dialog.style.cssText='box-sizing:border-box;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0';
      document.body.append(dialog); dialog.showModal();
      dialog.firstElementChild.onclick=()=>dialog.dataset.fired='yes';
    });
    await swipe(width-6,245,-120,0);
    assert.equal(await chat.count(),1);
    await page.locator('dialog[open]').evaluate(el=>{el.dataset.nfBackScope='';});
    await swipe(width-6,245,-120,0);
    assert.equal(await page.locator('dialog[data-fired]').count(),0);
    await page.locator('dialog[open] button').evaluate(el=>el.disabled=false);
    await swipe(width-6,245,-120,0);
    assert.equal(await page.locator('dialog[data-fired]').count(),1);
    await page.locator('dialog[open]').evaluate(el=>el.remove());
    const composer=chat.locator('.cm-chat-compose textarea');
    const draft='هذي مسودة ما أرسلتها';
    await composer.fill(draft);
    await composer.blur();
    assert.equal(await composer.evaluate(el=>el===document.activeElement),false);
    await swipe(width-6,245,-120,0);
    assert.equal(await chat.count(),1);
    assert.equal(await composer.inputValue(),draft);
    await composer.fill('');
    await composer.blur();
    await swipe(width-6,245,-120,0);
    await list.waitFor();
    assert.equal(await chat.count(),0);
    await page.close();
    console.log('Passed RTL profile/chat edge navigation, blurred draft protection, cancellation, modal isolation, and browser ownership at',width);
  }
} finally {await browser?.close();await server.close();}
