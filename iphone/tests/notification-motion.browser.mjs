import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE || 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output = resolve('.tmp/notification-motion');
await mkdir(output, { recursive: true });
const fixture = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NotificationFeed} from '/src/notifications/NotificationFeed';
import {MotionPressButton} from '/src/motion/Reanimated';
import '/src/design.css';
import '/src/community/community.css';
import '/src/motion.css';
import '/src/typography.css';
const person={id:'fixture',alias:'عضو توضيحي',age:30,city:'الرياض',occupation:'',bio:'',interests:[],reasons:[]};
const events=Array.from({length:12},(_,i)=>({id:'visit-'+i,kind:'profile_visit',person,createdAt:'2026-11-13T12:00:00Z'}));
window.qa={opened:0,reads:0,hold:false};
const source={watch:()=>()=>{},notifications:()=>window.qa.hold?new Promise(resolve=>{window.qa.release=()=>resolve(events)}):Promise.resolve(events),progress:()=>Promise.resolve(undefined),readNotifications:()=>{window.qa.reads++;return new Promise((resolve,reject)=>{window.qa.reject=reject})}};
function Fixture(){const [connections,setConnections]=useState([]);window.qa.refresh=()=>{window.qa.hold=true;setConnections([{id:'accepted',status:'accepted',direction:'incoming',person}])};return <main className="phone-app"><MotionPressButton id="press-test">متابعة</MotionPressButton><NotificationFeed source={source} connections={connections} onProfile={()=>{window.qa.opened++}} onConversation={()=>{}} onRequest={()=>{}}/></main>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
const server = await createServer({
  cacheDir: resolve('node_modules/.vite-notification-motion'),
  optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'react/jsx-runtime', 'lucide-react', 'react-native-reanimated', 'react-native-worklets'] },
  server: { host: '127.0.0.1', port: 5399 },
  plugins: [{ name: 'notification-motion-fixture',
    resolveId(id) { if (id === 'virtual:notification-motion') return '\0notification-motion'; },
    async load(id) { if (id === '\0notification-motion') return (await transformWithEsbuild(fixture, 'fixture.tsx', { loader: 'tsx', jsx: 'automatic' })).code; },
    configureServer(dev) { dev.middlewares.use(async (req, res, next) => {
      if (req.url !== '/__notification-motion') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await dev.transformIndexHtml('/__notification-motion', '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/__x00__notification-motion"></script></body></html>'));
    }); },
  }],
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(new URL('/__notification-motion', server.resolvedUrls.local[0]).href, { waitUntil: 'domcontentloaded' });
    await page.locator('.cm-notification-row').first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.cm-notification-row').length === 12);
    const start = performance.now();
    await page.locator('.cm-notification-row').first().click();
    await page.waitForFunction(() => window.qa.opened === 1 && window.qa.reads === 1);
    console.log(width + 'px: notification opened with receipt still pending in ' + Math.round(performance.now() - start) + 'ms (includes automation)');
    await page.evaluate(() => window.qa.reject(new Error('offline receipt')));
    await page.waitForTimeout(50);
    assert.equal(await page.locator('.nf-feed-error').count(), 0);
    assert.equal(await page.locator('.cm-notification-row[data-unread=true]').count(), 12);
    await page.evaluate(() => { window.scrollTo(0, 400); window.qa.before = window.scrollY; window.qa.refresh(); });
    await page.waitForFunction(() => !!window.qa.release);
    assert.equal(await page.locator('.cm-notification-row[data-kind=visit]').count(), 12, 'refresh keeps existing events mounted');
    assert.equal(await page.evaluate(() => window.scrollY), await page.evaluate(() => window.qa.before));
    await page.evaluate(() => window.qa.release());
    await page.waitForTimeout(250);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, 'feed-' + width + '.png') });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('.cm-notification-row').first().waitFor();
  assert.equal(await page.locator('.nf-feed-entry').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  const press = page.locator('#press-test');
  await press.dispatchEvent('pointerdown', { button: 0 });
  assert.equal(await press.evaluate(el => getComputedStyle(el).scale), 'none');
  await press.dispatchEvent('pointerup', { button: 0 });
  assert.deepEqual(errors, []);
  console.log('PASS: pending/failed receipts never block navigation; refresh preserves rows and scroll; 390/320px and reduced motion');
} finally { await browser?.close(); await server.close(); }
