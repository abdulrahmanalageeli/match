import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(root, '.tmp/device-unlock');
await mkdir(output, { recursive: true });
const server = await createServer({
  root, envFile: false, cacheDir: resolve(root, 'node_modules/.vite-device-unlock'),
  define: {
    'import.meta.env.VITE_MARRIAGE_ENV': 'undefined',
    'import.meta.env.VITE_MARRIAGE_BACKEND': '"local"',
    'import.meta.env.VITE_API_BASE_URL': '"https://member.example.test"',
  },
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const base = server.resolvedUrls.local[0];
  const account = { user: { id: 'fixture-member', email: 'member@example.test', applicationStatus: 'pending' },
    membership: { active: false, tier: 'free' }, profile: null, introduction: null };
  await page.addInitScript(() => {
    const mode = new URLSearchParams(location.search).get('mode');
    window.lockCalls = [];
    if (mode === 'web') return;
    window.CapacitorCustomPlatform = { name: 'ios' };
    const methods = ['read', 'save', 'privacyStatus', 'privacyConfigure', 'setCaptureScope'];
    const status = { available: true, enabled: mode === 'enabled', delay: 60,
      biometry: mode === 'passcode' ? 'none' : mode === 'touch' ? 'Touch ID' : 'Face ID' };
    window.Capacitor = {
      PluginHeaders: [{ name: 'PrivateSession', methods: methods.map(name => ({ name, rtype: 'promise' })) }],
      async nativePromise(plugin, method, options) {
        if (method === 'read') return { token: mode === 'restored' ? 'fixture-session' : null };
        if (method === 'privacyStatus') { window.lockCalls.push(method); return status; }
        if (method === 'privacyConfigure') {
          window.lockCalls.push(options);
          if (window.lockCalls.length === 2) throw Error('Cancelled');
          return { ...status, enabled: true };
        }
        return {};
      },
    };
  });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://member.example.test') {
      if (url.pathname === '/login' && route.request().postDataJSON().password === 'failed-login') {
        return route.fulfill({ status: 401, json: { error: 'بيانات الدخول غير صحيحة.' } });
      }
      return route.fulfill({ json: url.pathname === '/login' ? { token: 'fixture-session', state: account } : account });
    }
    if (url.origin !== new URL(base).origin) return route.abort();
    if (url.pathname === '/__device-unlock' && !url.searchParams.has('html-proxy')) {
      const html = `<!doctype html><html dir="rtl" lang="ar">
        <meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>
        <script type="module">
          import React from "react";
          import { createRoot } from "react-dom/client";
          import App from "/src/App.tsx";
          import "/src/design.css";
          import "/src/flows.css";
          import "/src/screens.css";
          import "/src/typography.css";
          createRoot(document.querySelector("#root")).render(React.createElement(App, { openLogin: true }));
        </script></html>`;
      return route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml(url.pathname, html) });
    }
    return route.continue();
  });
  async function signIn(mode) {
    await page.goto(base + '__device-unlock?mode=' + mode);
    await page.getByRole('heading', { name: 'أهلًا بعودتك' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.lockCalls), []);
    const email = page.locator('input[name=email]');
    if (!await email.isVisible()) await page.getByRole('button', { name: 'المتابعة بالبريد الإلكتروني' }).click();
    await email.fill('member@example.test');
    if (mode === 'face') {
      await page.locator('input[name=password]').fill('failed-login');
      await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'بيانات الدخول غير صحيحة.' }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.lockCalls), []);
    }
    await page.locator('input[name=password]').fill('fixture-only');
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await page.getByRole('heading', { name: 'أهلًا بعودتك' }).waitFor({ state: 'detached' });
  }
  const dialog = page.getByRole('dialog', { name: /تفعيل/ });
  await signIn('face');
  await dialog.waitFor();
  await page.screenshot({ path: resolve(output, 'face-id.png') });
  const enable = dialog.getByRole('button', { name: /Face ID/ });
  await enable.click();
  await dialog.getByRole('alert').waitFor();
  await enable.click();
  await dialog.waitFor({ state: 'detached' });
  const config = { enabled: true, delay: 60 };
  assert.deepEqual(await page.evaluate(() => window.lockCalls), ['privacyStatus', config, config]);
  await signIn('touch');
  await dialog.getByRole('button', { name: /Touch ID/ }).waitFor();
  await page.setViewportSize({ width: 375, height: 667 });
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await dialog.getByRole('button', { name: 'لاحقًا' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => window.lockCalls), ['privacyStatus']);
  for (const mode of ['enabled', 'passcode', 'web']) {
    await signIn(mode);
    if (mode !== 'web') await page.waitForFunction(() => window.lockCalls.includes('privacyStatus'));
    assert.equal(await dialog.count(), 0);
    assert.deepEqual(await page.evaluate(() => window.lockCalls), mode === 'web' ? [] : ['privacyStatus']);
  }
  await page.goto(base + '__device-unlock?mode=restored');
  await page.getByRole('heading', { name: 'طلبك قيد المراجعة' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.lockCalls), []);
  assert.deepEqual(errors, []);
  console.log('Passed sign-in offer, retry, native success, skip, enabled, unavailable, web, and restored session.');
} finally {
  await browser?.close();
  await server.close();
}
