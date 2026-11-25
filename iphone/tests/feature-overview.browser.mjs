import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

// Run against npm run build:demo so navigation tests the normal bundled entry point.
const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(root, '.tmp/overview');
await mkdir(output, { recursive: true });
const server = await preview({ root, build: { outDir: process.env.WUDAYN_TEST_DIST || 'dist' }, preview: { host: '127.0.0.1', port: 0 } });
const base = server.resolvedUrls.local[0];
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  for (const [width, height] of [[375, 812], [393, 852], [430, 932], [1280, 800]]) {
    const page = await browser.newPage({ viewport: { width, height }, locale: 'ar-SA', reducedMotion: 'reduce', serviceWorkers: 'block' });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const guide = page.locator('.wd-overview');
    const welcome = page.locator('.nf-welcome');
    await guide.waitFor();
    assert.equal(await welcome.count(), 0);
    await page.evaluate(() => document.fonts.ready);
    for (let chapter = 0; chapter < 4; chapter++) {
      const tab = guide.locator('nav button').nth(chapter);
      assert.equal(await tab.getAttribute('aria-current'), 'step');
      const shot=guide.locator('.wd-overview-screen--current');
      await shot.evaluate(img=>img.decode());
      assert.ok(await shot.evaluate(img=>img.naturalWidth>=390 && img.naturalHeight>=844 && !!img.alt));
      assert.equal(await shot.evaluate(img=>img.getAnimations().length),0);
      assert.equal(await guide.locator('.wd-overview-points li').count(), 3);
      assert.ok(await shot.evaluate(img=>Math.abs((img.clientWidth/img.clientHeight)-(img.naturalWidth/img.naturalHeight))<.01),'whole screenshot is visible without cropping');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ animations: 'disabled', path: resolve(output, `chapter-${chapter}-${width}.png`) });
      await guide.locator('footer .f-primary').click();
    }
    await welcome.waitFor();
    assert.equal(await page.locator('.wd-launch-screen').count(), 0);
    if (width <= 759) {
      const hero = welcome.locator('.wd-welcome-hero picture img');
      assert.ok(await hero.evaluate(image => image.currentSrc.endsWith('/shared-future-mobile.webp')));
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await welcome.waitFor();
    assert.equal(await guide.count(), 0);
    await welcome.getByRole('button', { name: 'جولة في وُدَين' }).click();
    if (width===393) {
      await page.emulateMedia({reducedMotion:'no-preference'});
      const frames=await guide.evaluate(async node=>{
        node.querySelectorAll('nav button')[1].click();
        const samples=[];
        for(let i=0;i<20;i++){
          await new Promise(requestAnimationFrame);
          const screen=node.querySelector('.wd-overview-screen--current');
          samples.push(getComputedStyle(screen).transform+' '+getComputedStyle(screen).opacity);
        }
        return samples;
      });
      assert.ok(new Set(frames).size>4,'switching chapters visibly animates the full scene');
      await page.emulateMedia({reducedMotion:'reduce'});
    }
    await guide.getByRole('button', { name: /العضويات/ }).click();
    await guide.getByRole('button', { name: 'السابق' }).click();
    assert.equal(await guide.getByRole('button', { name: /الخصوصية/ }).getAttribute('aria-current'), 'step');
    await guide.getByRole('button', { name: 'تخطّي الجولة' }).click();
    await welcome.waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Passed first visit, all guide chapters, persistence, guest replay and skip on mobile and desktop.');
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.httpServer.close(resolveClose));
}
