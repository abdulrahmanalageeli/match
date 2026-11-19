import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import current from '../src/compatibility/personality-catalog.json' with {type:'json'};
import legacy from '../src/compatibility/personality-catalog-v1.json' with {type:'json'};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const { chromium } = createRequire(import.meta.url)(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const server = await createServer({root,mode:'demo',cacheDir:'node_modules/.vite-assessment-version',optimizeDeps:{entries:['tests/fixtures/registration-qa.html']},server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({channel:'chrome',headless:true});
  for (const [mode,catalog] of [['current',current],['legacy',legacy]]) {
    const page = await browser.newPage({viewport:{width:402,height:874},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route => new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    const url=server.resolvedUrls.local[0]+'tests/fixtures/registration-qa.html?assessment='+mode+'&chapter=';
    page.setDefaultTimeout(60000);
    await page.goto(url+'compatibility',{waitUntil:'domcontentloaded'});
    const slider=page.getByRole('slider',{name:catalog.at(-1).prompt});
    await slider.waitFor().catch(async error => {console.error(errors, await page.locator('body').innerText());throw error;});
    await slider.press('End');
    await page.locator('footer button[type=submit]').click();
    await page.locator('main[data-chapter=details]').waitFor();
    await page.goto(url+'review',{waitUntil:'domcontentloaded'});
    await page.locator('main[data-chapter=review]').waitFor();
    assert.equal(await page.locator('[aria-label="محاور شخصيتي"] dt').count(),mode==='current'?5:0);
    assert.deepEqual(errors,[]);
    console.log(mode,'passed remaining required item and final review');
    await page.close();
  }
} finally {await browser?.close(); await server.close();}
