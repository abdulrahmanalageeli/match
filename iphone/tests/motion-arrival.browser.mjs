// Compare two locally built copies of the app. External requests are blocked.
// node tests/motion-arrival.browser.mjs <dist-directory> <before|after>
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';

const [dist, phase] = process.argv.slice(2);
assert(dist && ['before', 'after'].includes(phase));
const webkit = process.argv.includes('--webkit');
const playwright = createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE ||
  'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const out = resolve('.tmp/flagship-motion', webkit ? phase+'-webkit' : phase);
await mkdir(out, { recursive: true });
const server = await preview({ build: { outDir: resolve(dist) }, preview: { host: '127.0.0.1', port: 5337, strictPort: true } });
const browser = webkit ? await playwright.webkit.launch() : await playwright.chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const [width,height,reduced] of [[375,667,false],[390,844,false],[430,932,false],[375,667,true]]) {
    const record = width === 390 && !webkit;
    const context = await browser.newContext({ viewport:{width,height}, isMobile:true, hasTouch:true,
      reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers:'block',
      ...(record ? {recordVideo:{dir:out,size:{width,height}}} : {}) });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const page = await context.newPage();page.on('pageerror', e=>console.error(e.message));
    await page.addInitScript(() => {
      window.framesQA = [];
      function sample(now) {
        const main = document.querySelector('main.wd-welcome');
        if(main) {
          window.framesQA.push({now, locked:main.inert});
          if (!main.inert) return;
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.goto('http://127.0.0.1:5337/', {waitUntil:'domcontentloaded'});
    const join = page.locator('.nf-join');
    await join.waitFor();
    if (!reduced && !webkit) await page.screenshot({path: resolve(out,'arrival-'+width+'.png')});
    await page.waitForFunction(() => window.framesQA.some(frame=>!frame.locked));
    const frames = await page.evaluate(()=>window.framesQA);
    const wait = Math.round(frames.find(f=>!f.locked).now-frames[0].now);
    if(phase==='after' || reduced) assert.equal(wait,0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(phase==='after' && !reduced) {
      await page.waitForFunction(()=>document.querySelector('.wd-logo-first')?.getAnimations().every(a=>a.playState!=='running'));
    }
    if(phase==='after' && !webkit) {
      await join.scrollIntoViewIfNeeded();
      const box=await join.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down();
      if(reduced) assert.equal(await join.evaluate(el=>getComputedStyle(el).scale),'none');
      else await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.nf-join')).scale)<.99);
      await page.mouse.up();
    } else await join.click();
    await page.locator('input[name=email]').waitFor();
    await page.waitForFunction(()=>!document.documentElement.dataset.nfWelcomeHandoff);
    if(record) await page.screenshot({path:resolve(out,'account.png')});
    const video=page.video();
    await context.close();
    if(video) {await video.saveAs(resolve(out,'welcome-to-account.webm'));await video.delete();}
    results.push({width,height,reduced,firstInteractiveFrameMs:wait,samples:frames.length});
  }
  await writeFile(resolve(out,'frames.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
} finally { await browser.close();await new Promise(done=>server.httpServer.close(done)); }
