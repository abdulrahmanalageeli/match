// Synthetic chat, profile, attachment and draft. Run with Node from either project root.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const require = createRequire(import.meta.url);
const playwright = process.env.NISFAYN_PLAYWRIGHT_MODULE || (() => {
  try { return require.resolve('playwright'); }
  catch { return 'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package'; }
})();
const { chromium } = require(playwright);
const output = resolve(root, '.tmp/capture-privacy');
await mkdir(output, { recursive: true });
const server = await createServer({
  root,
  cacheDir: 'node_modules/.vite-capture-privacy',
  optimizeDeps: { entries: ['tests/fixtures/chat-privacy-qa.html'] },
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA', reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  const note = page.locator('.wd-capture-note');
  const scope = name => page.locator('html[data-capture-scope="' + name + '"]').waitFor({state:'attached'});
  const snapshot = file => page.screenshot({path: resolve(output, file + '.png')});
  async function coversViewport() {
    await note.waitFor();
    assert.ok(await note.evaluate(node => [[2, 2], [innerWidth / 2, innerHeight / 2], [innerWidth - 2, innerHeight - 2]]
      .every(([x,y]) => node.contains(document.elementFromPoint(x,y)))), 'Privacy cover must cover the entire viewport, including top-layer dialogs');
  }

  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/chat-privacy-qa.html?actor=abdulrahman&case=capture', {waitUntil:'commit',timeout:90000});
  const open = page.getByRole('button', {name:/فتح المحادثة مع/});
  await open.waitFor({timeout:90000});
  assert.equal(await page.locator('html').getAttribute('data-capture-scope'), null);
  await page.keyboard.press('PrintScreen');
  assert.equal(await note.isVisible(), false);
  await open.click();
  const input = page.getByRole('textbox', {name:'رسالتك'});
  await input.waitFor();
  const webPrivacyUi = page.locator('.wd-capture-note, .wd-capture-trigger, .wd-capture-watermark, .cm-chat-capture-notice');
  const assertWebScope = async () => {
    assert.equal(await page.locator('html').getAttribute('data-capture-scope'), null);
    assert.equal(await webPrivacyUi.count(), 0);
  };
  await assertWebScope();
  await page.keyboard.press('PrintScreen');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true})));
  await assertWebScope();
  assert.equal(await page.locator('html').getAttribute('data-capture-hidden'), null);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true})));
  await page.evaluate(() => {
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('.cm-chat-privacy-cover').count(),0);
  assert.ok(await input.isVisible());
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.emulateMedia({media:'print'});
  assert.ok(await input.isVisible());
  await page.emulateMedia({media:'screen'});
  await page.locator('[data-server-id=regular]').getByRole('button',{name:'فتح الصورة بحجمها الكامل'}).click();
  await page.getByRole('button',{name:'إغلاق الصورة',exact:true}).waitFor();
  await assertWebScope();
  assert.ok(await page.locator('.cm-photo-viewer img').evaluate(img =>
    img.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true}))));
  await page.getByRole('button',{name:'إغلاق الصورة',exact:true}).click();
  await page.getByRole('button',{name:'عرض ملف رهام'}).click();
  await page.locator('.mp-hero h1').waitFor();
  await assertWebScope();

  // Repeat in a native iOS bridge fixture to exercise the protected scope and lifecycle.
  await page.addInitScript(() => {
    window.CapacitorCustomPlatform = {name:'ios'};
    window.Capacitor = {
      PluginHeaders:[{name:'PrivateSession', methods:['setCaptureScope','read','save','clear'].map(name=>({name, rtype:'promise'}))}],
      nativePromise:async (_plugin, method) => method === 'read' ? {token:null} : {},
    };
  });
  await page.reload();
  await open.click();
  await scope('chat');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.wd-capture-trigger, .wd-capture-watermark').count(), 0);
  await page.locator('[data-server-id=reply]').waitFor();
  await snapshot('chat');
  // Exercise the native lifecycle bridge with a silent, playing media stream.
  const playback = await page.evaluate(async () => {
    const context = new AudioContext();
    const stream = context.createMediaStreamDestination().stream;
    const audio = new Audio();
    audio.muted = true;
    audio.srcObject = stream;
    const voice = document.createElement('div');
    voice.className = 'cm-voice-note';
    voice.append(audio);
    document.body.append(voice);
    try {
      await audio.play();
      const wasPlaying = !audio.paused;
      window.dispatchEvent(new Event('wudayn:privacy-covered'));
      const covered = document.documentElement.hasAttribute('data-capture-native-hidden');
      const paused = audio.paused;
      window.dispatchEvent(new Event('wudayn:privacy-visible'));
      return {wasPlaying, covered, paused, visible: !document.documentElement.hasAttribute('data-capture-native-hidden'), stayedPaused: audio.paused};
    } finally {
      stream.getTracks().forEach(track => track.stop());
      await context.close();
      voice.remove();
    }
  });
  assert.deepEqual(playback, {wasPlaying:true, covered:true, paused:true, visible:true, stayedPaused:true});

  await input.fill('PRIVATE-MESSAGE-302');
  await page.getByRole('button', {name:'إرسال الرسالة', exact:true}).click();
  await page.getByText('PRIVATE-MESSAGE-302', {exact:true}).waitFor();
  const draft = 'مسودة خاصة PRIVATE-DRAFT-731';
  await input.fill(draft);
  await page.keyboard.press('PrintScreen');
  await coversViewport();
  await snapshot('chat-privacy-note');
  const leave = () => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true})));
  const returnToPage = () => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true})));
  await leave();
  await returnToPage();
  await coversViewport();
  await page.locator('.wd-capture-resume:visible').click();
  assert.equal(await input.inputValue(), draft);
  await note.waitFor({state:'hidden'});

  await leave();
  await note.waitFor();
  await snapshot('chat-private-preview');
  await returnToPage();
  await note.waitFor({state:'hidden'});
  const toolsButton = page.getByRole('button', {name:'خيارات المحادثة'});
  await toolsButton.click();
  const sheet = page.locator('dialog.cm-sheet[open]');
  await sheet.waitFor();
  await page.keyboard.press('PrintScreen');
  await coversViewport();
  await page.locator('.wd-capture-resume:visible').click();
  await sheet.waitFor();
  await sheet.evaluate(el => { const probe = document.createElement('p'); probe.textContent = 'PRIVATE-DIALOG-917'; el.append(probe); });
  // Simulate the browser lifecycle signal without relying on headless tab scheduling.
  await leave();
  await coversViewport();
  assert.ok(await note.evaluate(el => el.matches(':modal')), 'Backgrounding with an open sheet must promote the privacy note to the top layer');
  await returnToPage();
  await note.waitFor({state:'hidden'});
  await sheet.waitFor();

  await page.emulateMedia({media:'print'});
  await note.waitFor();
  assert.equal(await sheet.isVisible(), false, 'Private top-layer dialog must be hidden in print');
  const pdfPath = resolve(output, 'chat-private.pdf');
  await page.pdf({path:pdfPath, printBackground:true, format:'A4'});
  const pdfText = process.env.PDF_PYTHON
    ? execFileSync(process.env.PDF_PYTHON, ['-X','utf8','-c',
      'from pypdf import PdfReader; import sys; print(chr(12).join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', pdfPath], {encoding:'utf8'})
    : execFileSync(process.env.PDFTOTEXT || 'pdftotext', ['-enc','UTF-8',pdfPath,'-'], {encoding:'utf8'});
  assert.doesNotMatch(pdfText, /PRIVATE-(?:DRAFT|DIALOG|MESSAGE)/);
  assert.match(pdfText, /[\u0600-\u06ff]/, 'The PDF must contain the Arabic privacy note');
  assert.equal(pdfText.split('\f').filter(page => page.trim()).length, 1);
  await page.emulateMedia({media:'screen'});
  await sheet.getByRole('button', {name:'إغلاق',exact:true}).click();
  await page.locator('[data-server-id=regular]').getByRole('button',{name:'فتح الصورة بحجمها الكامل'}).click();
  await page.getByRole('button',{name:'إغلاق الصورة',exact:true}).waitFor();
  await scope('chat');
  await page.emulateMedia({media:'print'});
  assert.equal(await page.getByRole('button',{name:'إغلاق الصورة',exact:true}).isVisible(), false);
  await page.emulateMedia({media:'screen'});
  assert.equal(await page.locator('.cm-photo-viewer .wd-capture-watermark').count(), 0);
  await snapshot('chat-photo');
  await leave();
  await coversViewport();
  await returnToPage();
  await page.getByRole('button',{name:'إغلاق الصورة',exact:true}).waitFor({state:'hidden'});

  await page.getByRole('button',{name:'عرض ملف رهام'}).click();
  await scope('profile');
  await page.locator('.mp-hero h1').waitFor();
  await snapshot('profile');
  await page.getByRole('button',{name:'العودة للمحادثة'}).click();
  await scope('chat');
  assert.equal(await input.inputValue(), draft);
  await page.getByRole('button',{name:'رجوع',exact:true}).click();
  await open.waitFor();
  assert.equal(await page.locator('html').getAttribute('data-capture-scope'), null);
  assert.equal(await page.locator('.wd-capture-trigger:visible').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: ordinary browser chat, profile, photo viewer and print; iOS bridge scopes, lifecycle covers, protected print, media and drafts.');
} finally {
  await browser?.close();
  await server.close();
}
