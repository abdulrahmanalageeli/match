// Isolated browser check. Interview and account draft responses are synthetic.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import preferences from '../src/compatibility/catalog.json' with { type: 'json' };
import personality from '../src/compatibility/personality-catalog.json' with { type: 'json' };
import scenarios from '../src/interview/opening-scenarios.json' with { type: 'json' };
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
  import '/src/accessibility.css';
  initializeDevicePreferences();
  window.applied = [];
  function Fixture() {
    const [choices, setChoices] = useState(null);
    useEffect(() => {
      void fetch('/__hybrid-draft').then(response => response.json()).then(setChoices);
    }, []);
    if (!choices) return null;
    return <InterviewPanel open auth={{ testSession: 'isolated-browser-fixture' }} onboarding direct={location.hash === '#direct'}
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
          lastMode: 'luna', lastRequestId: payload.requestId, proposals: [
            { ...proposal, id: 'personality:depth:self', kind: 'personality', fieldId: 'depth', values: ['E'] },
          ],
        } };
        break;
      case 'directConfirm':
      case 'structuredConfirm':
        assert.deepEqual(payload.choices.map(({ id }) => id).sort(), expectedIds);
        assert.equal(payload.choices.find(({ id }) => id === firstId).values[0], 'B');
        assert.equal(payload.choices.find(({ id }) => id === firstPartnerId).values[0], 'A');
        snapshot = { revision: snapshot.revision + 1, coverage: { answered: 44, required: 44 }, structuredConfirmation: true,
          document: { ...snapshot.document, status: 'confirmed', confirmed: payload.choices.map(choice => {
            const [kind, fieldId, side] = choice.id.split(':');
            return { ...proposal, ...choice, kind, fieldId, side };
          }) },
        };
        break;
      case 'choiceHelp':
        assert.equal(payload.fieldId, firstId);
        if (payload.answer === 'ممكن، لكن لسه ما حسمت قراري') assert.equal(payload.priorAnswer, 'ما أدري');
        return route.fulfill({ json: { document: null, revision: snapshot.revision, choiceHelp: !payload.answer
          ? { message: 'الخيارات تختلف في قرارك بشأن الأطفال.', explanations: { A: 'الإنجاب جزء من خطتك.', B: 'تفضّل حياة بدون أطفال.', C: 'تحتاج وقتًا لتحديد رغبتك.' } }
          : payload.answer === 'ما أدري'
            ? { message: 'تقصد إنك محتار أو إنك ما تبي أطفال؟', code: null }
            : { message: 'وصفت قرارًا ما حسمته إلى الآن.', code: 'C' } } });
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
  assert.equal(await page.locator('#wi-answer').getAttribute('maxlength'), '900');
  assert.match(await page.locator('#wi-answer-count').innerText(), /٩٠٠/);
  await page.locator('#wi-answer').fill(opening);
  await page.getByRole('button', { name: 'إرسال الرسالة', exact: true }).click();
  const card = page.locator('.wi-hybrid-card');
  await card.waitFor();
  assert.equal(calls.some(call=>['structuredConfirm','directConfirm'].includes(call.action)),false);
  releaseOpening();
  await card.waitFor();
  const self = card.locator('fieldset').first();
  const manual = self.locator('button').nth(1);
  const portrait = page.locator('.wi-living-portrait');
  const fill = portrait.locator('.wi-portrait-mark i > span').first();
  const emptyFill = await fill.getAttribute('style');
  await manual.click();
  assert.equal(await manual.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await fill.getAttribute('style'), emptyFill, 'A tap immediately fills part of the portrait');
  await portrait.locator(':scope > summary').click();
  await portrait.locator('.wi-portrait-theme > summary').first().click();
  const mirror = portrait.getByRole('combobox', { name:'الأطفال، في حياتي' });
  assert.equal(await mirror.inputValue(), 'B');
  await mirror.selectOption('C');
  assert.equal(await self.locator('button').nth(2).getAttribute('aria-pressed'), 'true');
  await mirror.selectOption('B');
  await portrait.locator(':scope > summary').click();
  assert.deepEqual(calls.filter(({ action }) => action === 'answer').map(({ answer }) => answer), [opening]);
  assert.deepEqual(draft[firstId], ['B']);
  const help = self.getByRole('button',{name:'مو عارف وش أختار؟'});
  await help.click();
  assert.equal(calls.filter(call => call.action === 'choiceHelp').length, 0);
  await self.getByRole('button', { name: 'اشرحي الخيارات' }).click();
  await self.getByText('الإنجاب جزء من خطتك.').waitFor();
  const description = self.getByLabel('أو قلها بطريقتك');
  const map = self.getByRole('button', { name: 'اقترحي أقرب خيار' });
  await description.fill('ما أدري');
  await map.click();
  await self.getByText('تقصد إنك محتار أو إنك ما تبي أطفال؟').waitFor();
  const accept = self.getByRole('button', { name: 'استخدم هذا الخيار' });
  assert.equal(await accept.count(), 0);
  await self.getByLabel('ردّ على لونا').fill('ممكن، لكن لسه ما حسمت قراري');
  await self.getByRole('button', { name: 'إرسال التوضيح' }).click();
  await accept.waitFor();
  await page.screenshot({ path: resolve(output, 'choice-help-390.png') });
  assert.deepEqual(draft[firstId], ['B'], 'A proposed option never writes to the draft');
  assert.equal(await manual.getAttribute('aria-pressed'), 'true');
  await accept.click();
  assert.equal(await self.locator('button').nth(2).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(draft[firstId], ['C']);
  await manual.click();

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), false);
    assert.equal(await card.evaluate(element => element.scrollWidth > element.clientWidth), false);
    await page.screenshot({ path: resolve(output, `cards-${width}.png`) });
  }
  await page.setViewportSize({width:375,height:667});
  await page.emulateMedia({colorScheme:'dark'});
  await page.evaluate(()=>document.documentElement.style.setProperty('--nf-system-text','32px'));
  assert.equal(await card.evaluate(el=>el.scrollWidth > el.clientWidth), false);
  assert.equal(await dialog.evaluate(el=>el.scrollWidth > el.clientWidth), false);
  await page.screenshot({path:resolve(output,'luna-dark-large-375.png')});
  await page.evaluate(()=>document.documentElement.style.removeProperty('--nf-system-text'));
  await page.emulateMedia({colorScheme:'light'});

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.wi-hybrid').waitFor();
  // Reload preserves the self answer and leaves the partner choice open.
  assert.deepEqual(draft[firstId], ['B']);
  const actionsBeforeCards = calls.length;
  let scaleChecked = false;
  for (let index = 0; index <= 16 && await card.count(); index++) {
    const groups = card.locator('fieldset').filter({hasNot:page.locator('fieldset')});
    for (let at = 0; at < await groups.count(); at++) {
      const group = groups.nth(at);
      const radios = group.getByRole('radio');
      if (await radios.count()) {
        if (!scaleChecked) assert.equal(await group.locator('input:checked').count(), 0);
        await radios.first().check();
        assert.equal(await radios.first().isChecked(), true);
        if (!scaleChecked) {
          await page.screenshot({ path: resolve(output, 'personality-scale-390.png') });
          scaleChecked = true;
        }
      } else if (!await group.locator('button[aria-pressed=true]').count()) await group.locator('button').first().click();
    }
    await page.getByRole('button', { name: 'متابعة', exact: true }).click();
  }
  assert.equal(await card.count(), 0);
  assert.equal(scaleChecked, true);
  assert.equal(calls.length, actionsBeforeCards, 'Structured taps do not call the interview API');
  assert.equal(await page.locator('.wi-hybrid-batch').count(), 0);
  await page.screenshot({ path: resolve(output, 'review-390.png') });
  const confirmation = page.getByRole('button', { name: 'اعتماد إجاباتي', exact: true });
  assert.equal(await confirmation.isDisabled(), false);
  assert.equal(calls.length, actionsBeforeCards, 'Reviewing the choices stays local');
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  assert.deepEqual(calls.slice(actionsBeforeCards).map(({ action }) => action), ['structuredConfirm']);
  assert.equal(await page.evaluate(() => window.applied[0]?.length), 44);
  draft = {};
  snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: 44 } };
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#wi-answer').fill(opening);
  await page.getByRole('button', { name:'إرسال الرسالة', exact:true }).click();
  // The member still chooses their own response and their partner preference.
  await page.locator('.wi-hybrid-stage h1').filter({hasText:'الأطفال'}).waitFor();
  const callsBeforeEdit = calls.length;
  await portrait.locator(':scope > summary').click();
  await portrait.getByText('حياتكم اليومية', { exact: true }).click();
  const personalityAnswer = portrait.getByRole('combobox', { name: 'عمق الحوار، عن شخصيتي' });
  assert.equal(await personalityAnswer.inputValue(), 'E');
  assert.match(await personalityAnswer.locator('..').innerText(), /من لونا/);
  await page.screenshot({ path: resolve(output, 'portrait-390.png') });
  await personalityAnswer.selectOption('C');
  assert.doesNotMatch(await personalityAnswer.locator('..').innerText(), /من لونا/);
  assert.deepEqual(draft['personality:depth:self'], ['C']);
  assert.equal(calls.length, callsBeforeEdit, 'Editing from the portrait only updates the existing draft');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await portrait.locator(':scope > summary').click();
  await portrait.getByText('حياتكم اليومية', { exact: true }).click();
  assert.equal(await personalityAnswer.inputValue(), 'C');
  const reflection = 'يهمّك إنكم ترتّبون أموركم سوا من البداية.';
  const followUp = 'في مصاريف البيت، وش تحبّون تتفقون عليه من بدري؟';
  snapshot.document = { ...snapshot.document, status:'review', lastMode:'luna', currentQuestion:{topic:'practical', text:reflection+'\u2029'+followUp,suggestions:[]} };
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByText(reflection, {exact:true}).waitFor();
  assert.equal(await page.locator('.wi-closing .wi-next-question').innerText(), followUp);
  assert(await card.isVisible(), 'the optional question leaves the assessment available');
  await page.screenshot({path:resolve(output,'luna-opening-reply.png')});
  await page.getByRole('button',{name:'أردّ على لونا'}).click();
  assert.equal(await page.locator('#wi-clarification').getAttribute('maxlength'),'700');
  await page.getByRole('button',{name:'إلغاء التوضيح'}).click();
  assert.equal(await page.locator('#wi-clarification').count(),0);
  snapshot = {document:initialInterviewDocument(true),revision:1,coverage:{answered:0,required:44}};
  snapshot.document.currentQuestion.text = scenarios[0].clarification;
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#wi-answer').waitFor();
  assert.equal(await page.locator('#wi-answer').getAttribute('maxlength'),'700');
  assert.match(await page.locator('#wi-answer-count').innerText(),/٧٠٠/);
  const guidedChoices = calls.find(call => call.action === 'structuredConfirm').choices;
  draft = Object.fromEntries(guidedChoices.map(({ id, values }) => [id, values]));
  delete draft[firstId];
  snapshot = { document: initialInterviewDocument(true), revision: 1, coverage: { answered: 0, required: 44 } };
  const directStart = calls.length;
  await page.goto(url + '#direct');
  await page.reload({waitUntil:'domcontentloaded'});
  await card.waitFor();
  assert.equal(await page.locator('#wi-answer').count(), 0);
  await manual.click();
  await page.getByRole('button', { name: 'متابعة', exact: true }).click();
  assert.equal(await confirmation.isEnabled(), true);
  await confirmation.click();
  await page.locator('.wi-complete').waitFor();
  assert.deepEqual(calls.slice(directStart).map(call => call.action), ['load', 'directConfirm']);
  assert.equal(await page.evaluate(() => window.applied[0]?.length), 44);
  assert.deepEqual(errors, []);
  console.log('PASS: mobile 320–390px, reviewed Luna response, saved draft, explicit partner choices, and one 44-field confirmation');
} finally {
  releaseOpening();
  await browser?.close();
  await server.close();
}
