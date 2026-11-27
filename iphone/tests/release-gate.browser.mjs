// Production release gate and anonymous policy RPC. Only the native bridge and network are local fixtures.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createDatabase } from '../supabase/tests/harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { playwright = require('C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package'); }
const origin = 'https://release-fixture.test';
const storeUrl = 'https://apps.apple.com/app/id123456789';
const shots = resolve(root, '.tmp/release-gate');
const bundled = await build({
  absWorkingDir: root, stdin: { resolveDir: root, loader: 'tsx', contents: `
    import { createRoot } from 'react-dom/client';
    import { ReleaseGate } from './src/release/ReleaseGate';
    import './src/design.css';
    import './src/flows.css';
    import './src/typography.css';
    import './src/accessibility.css';
    function Member() {
      window.memberRenders++;
      return <main data-testid="member">حساب العضو</main>;
    }
    window.memberRenders = 0;
    createRoot(document.querySelector('#root')).render(<ReleaseGate><Member/></ReleaseGate>);
  ` },
  jsx: 'automatic', bundle: true, outfile: 'bundle.js', write: false,
  external: ['/fonts/*', '/brand/*'],
  define: { 'import.meta.env.VITE_WUDAYN_WEB_BUILD': '"10"', 'import.meta.env.VITE_MARRIAGE_ENV': '"live"' },
  plugins: [{ name: 'release-environment', setup(b) {
    const sources = {
      '../cloud': `
        export const cloudSelected = true;
        export const cloudConnection = {url: location.origin, key:'fixture-anon-key'};`,
      '@capacitor/core': `
        export const Capacitor = {isNativePlatform:()=>location.pathname==='/ios', getPlatform:()=>location.pathname.slice(1)};
      `,
      '../notifications/push': `
        export const readNativeBuild = async () => Number(sessionStorage.getItem('fixture-build') || 10);
        export async function openStoreListing(url) {
          if (window.storeFailure) throw new Error('store unavailable');
          window.openedListing = url;
        }`,
    };
    b.onResolve({ filter: /^(\.\.\/cloud|@capacitor\/core|\.\.\/notifications\/push)$/ },
      args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: sources[args.path] }));
  } }],
});
const assets = new Map(bundled.outputFiles.map(file => ['/' + basename(file.path), Buffer.from(file.contents)]));
const db = await createDatabase();
let browser;
try {
  browser = await playwright.chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true,
    locale: 'ar-SA', timezoneId: 'America/New_York', reducedMotion: 'reduce' });
  page.setDefaultTimeout(6000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let network = true;
  let releaseRequest;
  const requests = [];
  const setPolicy = (platform, minimum, recommended = 0, until = null) => db.query(
    'update marriage.release_policies set minimum_build=$2,recommended_build=$3,store_url=$4,maintenance_until=$5,revision=revision+1 where platform=$1',
    [platform, minimum, recommended, platform === 'ios' ? storeUrl : null, until]);
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== origin) return route.abort();
    if (path === '/ios' || path === '/web') return route.fulfill({ contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><div id="root"></div><script src="/bundle.js"></script></html>' });
    if (assets.has(path)) return route.fulfill({ body: assets.get(path), contentType: path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    if (/^\/fonts\/[a-z0-9_-]+\.woff2$|^\/brand\/wudayn-(icon|emblem)-v2\.png$/i.test(path)) {
      return route.fulfill({ body: await readFile(resolve(root, 'public', '.' + path)), contentType: path.endsWith('.png') ? 'image/png' : 'font/woff2' });
    }
    if (path === '/rest/v1/rpc/wudayn_release_policy') {
      if (releaseRequest) await releaseRequest;
      assert.equal(request.method(), 'POST');
      assert.equal(request.headers().apikey, 'fixture-anon-key');
      assert.equal(request.headers().authorization, undefined);
      const { target_platform: platform } = request.postDataJSON();
      assert.equal(platform, new URL(request.frame().url()).pathname.slice(1));
      requests.push(platform);
      if (!network) return route.abort('internetdisconnected');
      const policy = await db.transaction(async tx => {
        await tx.exec('set local role anon');
        return (await tx.query('select public.wudayn_release_policy($1) as policy', [platform])).rows[0].policy;
      });
      return route.fulfill({ json: policy });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await mkdir(shots, { recursive: true });
  const member = page.getByTestId('member');
  const mandatory = page.getByRole('heading', { name: 'حدّث وُدَين عشان تكمّل' });
  const button = name => page.getByRole('button', { name, exact: true });
  const visit = platform => page.goto(origin + '/' + platform);
  const foreground = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const assertGate = async (locator, capture) => {
    await locator.waitFor();
    const layout = await page.locator('.wd-release-screen').evaluate(el => ({
      direction: getComputedStyle(el).direction,
      widthFits: document.documentElement.scrollWidth <= window.innerWidth,
      reduced: getComputedStyle(el.querySelector('.wd-release-layout')).animationName,
      targetSize: Array.from(el.querySelectorAll('button')).every(button => button.getBoundingClientRect().height >= 44),
      headingFocused: document.activeElement === el.querySelector('h1'),
    }));
    assert.deepEqual(layout, { direction: 'rtl', widthFits: true, reduced: 'none', targetSize: true, headingFocused: true });
    assert.equal(await member.isVisible(), false);
    if (capture) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(shots, capture) });
    }
  };

  await setPolicy('ios', 11);
  let resolveInitial;
  releaseRequest = new Promise(resolve => { resolveInitial = resolve; });
  await visit('ios');
  await page.getByRole('status').getByText('جارٍ التحقق من الإصدار…').waitFor();
  assert.equal(await page.evaluate(() => window.memberRenders), 0);
  resolveInitial();
  releaseRequest = null;
  await assertGate(mandatory, 'required-ios.png');
  assert.equal(await page.evaluate(() => window.memberRenders), 0);
  await page.evaluate(() => { window.storeFailure = true; });
  await button('فتح App Store').click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => window.openedListing), undefined);
  await page.evaluate(() => { window.storeFailure = false; });
  await button('فتح App Store').click();
  assert.equal(await page.evaluate(() => window.openedListing), storeUrl);
  network = false;
  await Promise.all([page.waitForEvent('requestfailed', req => req.url().endsWith('/wudayn_release_policy')), visit('ios')]);
  await assertGate(mandatory);
  network = true;
  await page.evaluate(() => sessionStorage.setItem('fixture-build', '11'));
  await foreground();
  await member.waitFor();
  await page.evaluate(() => sessionStorage.removeItem('fixture-build'));
  await setPolicy('ios', 10, 12);
  await foreground();
  const banner = page.getByRole('complementary', { name: 'يتوفر تحديث لوُدَين' });
  await banner.waitFor();
  assert.equal(await member.isVisible(), true);
  await button('لاحقًا').click();
  await banner.waitFor({ state: 'detached' });
  await page.reload();
  await member.waitFor();
  assert.equal(await banner.isVisible(), false);
  await setPolicy('ios', 10, 11);
  await Promise.all([page.waitForResponse('**/rpc/wudayn_release_policy'), foreground()]);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await banner.isVisible(), false, 'already dismissed a higher recommended build');
  await setPolicy('ios', 10, 13);
  await foreground();
  await banner.waitFor();
  await button('لاحقًا').click();
  await banner.waitFor({state:'detached'});
  await setPolicy('ios', 11, 13);
  await foreground();
  await assertGate(mandatory);
  await setPolicy('ios', 0);
  await button('إعادة التحقق').click();
  await member.waitFor();
  const until = new Date(Date.now() + 3_600_000).toISOString();
  await setPolicy('ios', 0, 0, until);
  await foreground();
  const maintenance = page.getByRole('heading', { name: 'نعود بعد الصيانة' });
  await assertGate(maintenance, 'maintenance-ios.png');
  const riyadh = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh',
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  assert.equal(await page.locator('time').getAttribute('datetime'), until);
  assert.equal(await page.locator('time').textContent(), riyadh.format(new Date(until)));
  network = false;
  await Promise.all([page.waitForEvent('requestfailed', req => req.url().endsWith('/wudayn_release_policy')), page.reload()]);
  await assertGate(maintenance);
  network = true;
  const shortWindow = new Date(Date.now() + 1800).toISOString();
  await setPolicy('ios', 0, 0, shortWindow);
  await button('إعادة التحقق').click();
  await page.locator('time[datetime="' + shortWindow + '"]').waitFor();
  await member.waitFor();

  // A different platform has its own eligibility, cache, and update destination.
  network = false;
  await visit('web');
  await assertGate(page.getByRole('heading', { name: 'تعذّر التحقق من الإصدار' }));
  network = true;
  await setPolicy('web', 11);
  await button('حاول مرة أخرى').click();
  await assertGate(mandatory);
  await setPolicy('web', 10);
  await Promise.all([page.waitForEvent('domcontentloaded'), button('تحديث الصفحة').click()]);
  await member.waitFor();
  await page.evaluate(() => localStorage.clear());
  await setPolicy('web', 0);
  await page.reload();
  await member.waitFor();
  assert.equal(await banner.isVisible(), false, 'the default zero-threshold policy has no banner');
  network = false;
  await page.reload();
  await assertGate(page.getByRole('heading', { name: 'تعذّر التحقق من الإصدار' }));
  assert.equal(await page.evaluate(() => window.memberRenders), 0, 'an old permissive cache never admits a cold offline client');
  network = true;
  await setPolicy('web', 10, 10);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await member.waitFor();
  assert.equal(await banner.isVisible(), false, 'exactly meeting both thresholds admits silently');
  assert.ok(requests.includes('ios') && requests.includes('web'));
  assert.deepEqual(pageErrors, []);
  console.log('PASS release gate: cold start, upgraded build equality, store success/failure, cached blocks offline, live threshold change and rollback, optional dismissal and mandatory override, maintenance expiry/Riyadh, fresh offline recovery, web reload, RTL and reduced motion.');
  console.log('Screenshots: ' + shots);
} finally {
  await browser?.close();
  await db.close();
}
