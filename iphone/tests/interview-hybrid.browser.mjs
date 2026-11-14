// Isolated browser check. Interview and account draft responses are synthetic.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import preferences from '../src/compatibility/catalog.json' with { type: 'json' };
import personality from '../src/compatibility/personality-catalog.json' with { type: 'json' };
import { initialInterviewDocument } from '../api/_lib/interview.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NISFAYN_PLAYWRIGHT_MODULE ||
  'C:/Users/timgo/PycharmProjects/Tracker/.venv/lib/site-packages/playwright/driver/package');
const output = resolve(root, '.tmp/interview-hybrid');
await mkdir(output, { recursive: true });

const fixture = `
  import React, { useEffect, useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { InterviewPanel } from '/src/interview/InterviewPanel';
  import { initializeDevicePreferences } from '/src/settings/preferences';
  import '/src/typography.css';
  import '/src/ambient.css';
  import '/src/design.css';
  import '/src/flows.css';
  import '/src/screens.css';
  initializeDevicePreferences();
  window.applied = [];
  function Fixture() {
    const [choices, setChoices] = useState(null);
    useEffect(() => {
      void fetch('/__hybrid-draft').then(response => response.json()).then(setChoices);
    }, []);
    if (!choices) return null;
    return <InterviewPanel open auth={{ testSession: 'isolated-browser-fixture' }} onboarding
      assessmentContext={Object.entries(choices).map(([id, values]) => ({ id, values }))}
      onStructuredDraftChange={next => {
        setChoices(next);
        void fetch('/__hybrid-draft', { method: 'POST', body: JSON.stringify(next) });
      }} onClose={() => {}} onApply={confirmed => window.applied.push(confirmed)} />;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  cacheDir: resolve(root, 'node_modules/.vite-interview-hybrid'),
  optimizeDeps: {
    entries: [],
    include: ['react', 'react-dom/client', 'react/jsx-runtime', 'lucide-react', '@capacitor/core', '@supabase/supabase-js', 'react-native-reanimated', 'react-native-worklets'],
  },
  server: { host: '127.0.0.1', port: 5297, strictPort: true, hmr: false },
  plugins: [{
    name: 'interview-hybrid-browser-fixture',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:interview-hybrid') return '\0interview-hybrid';
    },
    async load(id) {
      if (id === '\0interview-hybrid') {
        return (await transformWithEsbuild(fixture, 'fixture.tsx', { loader: 'tsx', jsx: 'automatic' })).code;
      }
    },
    configureServer(dev) {
      dev.middlewares.use(async (request, response, next) => {
        if (request.url !== '/__interview-hybrid') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end(await dev.transformIndexHtml(request.url,
          '<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/@id/__x00__interview-hybrid"></script></body></html>'));
      });
    },
  }],
});

const firstId = 'preference:children_plan:self';
const firstPartnerId = 'preference:children_plan:partner';
const expectedIds = [
  ...preferences.dimensions.flatMap(({ id }) => [`preference:${id}:self`, `preference:${id}:partner`]),
  ...personality.map(({ id }) => `personality:${id}:self`),
].sort();
const opening = 'أرغب في الزواج وبناء أسرة، وأفضّل أن ننظم أمورنا سويًا.';
const proposal = {
  id: firstId, kind: 'preference', fieldId: 'children_plan', side: 'self', values: ['A'],
  summary: 'اقتراح من مقدمتك', needsClarification: false,
  evidence: [{ turnId: 'intro', quote: 'بناء أسرة' }],
};
const calls = [];
const errors = [];
let draft = {};
let snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: 44 } };
let releaseOpening;
const openingResponse = new Promise(resolveOpening => { releaseOpening = resolveOpening; });
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-SA', reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const { hostname, pathname } = new URL(route.request().url());
    if (hostname !== '127.0.0.1') return route.abort();
    if (pathname === '/__hybrid-draft') {
      if (route.request().method() === 'POST') draft = JSON.parse(route.request().postData());
      return route.fulfill({ json: draft });
    }
    if (pathname !== '/api/interview') return route.continue();
    const payload = route.request().postDataJSON();
    calls.push(payload);
    switch (payload.action) {
      case 'load': break;
      case 'draft':
        snapshot = { ...snapshot, revision: snapshot.revision + 1, document: { ...snapshot.document, draftAnswer: payload.answer } };
        break;
      case 'answer':
        assert.equal(payload.answer, opening);
        assert.equal(payload.hybrid, true);
        assert.equal(payload.assessmentContext, undefined);
        await openingResponse;
        snapshot = { revision: snapshot.revision + 1, coverage: { answered: 1, required: 44 }, document: {
          ...snapshot.document, status: 'review', currentQuestion: null, pendingAnalysis: false, draftAnswer: '',
          turns: [{ id: 'intro', topic: 'intent', question: snapshot.document.currentQuestion.text, answer: opening, skipped: false }],
          lastMode: 'luna', lastRequestId: payload.requestId, proposals: [proposal],
        } };
        break;
      case 'structuredConfirm':
        assert.deepEqual(payload.choices.map(({ id }) => id).sort(), expectedIds);
        assert.equal(payload.choices.find(({ id }) => id === firstId).values[0], 'B');
        assert.equal(payload.choices.find(({ id }) => id === firstPartnerId).values[0], preferences.dimensions[0].partnerDefault.B);
        snapshot = { revision: snapshot.revision + 1, coverage: { answered: 44, required: 44 }, structuredConfirmation: true,
          document: { ...snapshot.document, status: 'confirmed', confirmed: payload.choices.map(choice => {
            const [kind, fieldId, side] = choice.id.split(':');
            return { ...proposal, ...choice, kind, fieldId, side };
          }) },
        };
        break;
      default: throw Error('Unexpected interview action: ' + payload.action);
    }
    return route.fulfill({ json: snapshot });
  });

  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(45000);
  const url = 'http://127.0.0.1:5297/__interview-hybrid';
  const dialog = page.locator('.wi-dialog');
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('#wi-answer').fill(opening);
  await page.getByRole('button', { name: 'إرسال الرسالة', exact: true }).click();
  const card = page.locator('.wi-hybrid-card');
  await card.waitFor();
  const self = card.locator('fieldset').first();
  const manual = self.locator('button').nth(1);
  await manual.click();
  assert.equal(await manual.getAttribute('aria-pressed'), 'true');
  const portrait = page.locator('.wi-living-portrait');
  await portrait.locator(':scope > summary').click();
  await portrait.locator('.wi-portrait-theme > summary').first().click();
  const mirror = portrait.getByRole('combobox', { name:'الأطفال، في حياتي' });
  assert.equal(await mirror.inputValue(), 'B');
  await mirror.selectOption('C');
  assert.equal(await self.locator('button').nth(2).getAttribute('aria-pressed'), 'true');
  await mirror.selectOption('B');
  await portrait.locator(':scope > summary').click();
  const help = card.getByRole('button',{name:'مو عارف وش أختار؟'});
  await help.click();
  assert.match(await card.locator('.wi-card-help').innerText(), /اختر اللي يصف حياتك/);
  await help.click();
  assert.deepEqual(calls.filter(({ action }) => action === 'answer').map(({ answer }) => answer), [opening]);
  assert.equal(await page.locator('.wi-coverage-note').filter({ hasText: 'لونا تقرأ رسالتك' }).count(), 1);
  releaseOpening();
  await page.locator('.wi-coverage-note').filter({ hasText: 'لونا تقرأ رسالتك' }).waitFor({ state: 'hidden' });
  assert.equal(await manual.getAttribute('aria-pressed'), 'true', 'Late AI response preserved the newer selection');
  assert.deepEqual(draft[firstId], ['B']);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), false);
    assert.equal(await card.evaluate(element => element.scrollWidth > element.clientWidth), false);
    await page.screenshot({ path: resolve(output, `cards-${width}.png`) });
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.wi-hybrid').waitFor();
  // Reload can skip a finished card awaiting only a proposed partner answer.
  assert.deepEqual(draft[firstId], ['B']);
  const actionsBeforeCards = calls.length;
  for (let index = 0; index <= 16 && await card.count(); index++) {
    const groups = card.locator('fieldset');
    for (let at = 0; at < await groups.count(); at++) {
      const group = groups.nth(at);
      if (!await group.locator('button[aria-pressed=true]').count()) await group.locator('button').first().click();
    }
    await page.getByRole('button', { name: 'متابعة', exact: true }).click();
  }
  assert.equal(await card.count(), 0);
  assert.equal(calls.length, actionsBeforeCards, 'Structured taps do not call the interview API');
  const batch = page.locator('.wi-hybrid-batch');
  assert(await batch.locator('select').count() > 0);
  assert(await batch.locator('select').evaluateAll(choices => choices.every(select => select.value === '')));
  assert.equal(await page.getByRole('button', { name: 'اعتماد إجاباتي', exact: true }).isDisabled(), true);
  await page.screenshot({ path: resolve(output, 'review-390.png') });
  await batch.getByRole('button', { name: /من المقترحات/u }).click();
  const confirmation = page.getByRole('button', { name: 'اعتماد إجاباتي', exact: true });
  assert.equal(await confirmation.isDisabled(), false);
  assert.equal(calls.length, actionsBeforeCards, 'Accepting the visible proposals only updates the draft');
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  assert.deepEqual(calls.slice(actionsBeforeCards).map(({ action }) => action), ['structuredConfirm']);
  assert.equal(await page.evaluate(() => window.applied[0]?.length), 44);
  draft = {};
  snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: 44 } };
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#wi-answer').fill(opening);
  await page.getByRole('button', { name:'إرسال الرسالة', exact:true }).click();
  // A sufficient opening answer plus its catalog partner suggestion allows
  // this untouched card to be skipped once analysis has completed.
  await page.locator('.wi-hybrid-stage h1').filter({hasText:'مدينة السكن'}).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: mobile 320–390px, late Luna response, saved draft, opt-in defaults, and one 44-field confirmation');
} finally {
  releaseOpening();
  await browser?.close();
  await server.close();
}
