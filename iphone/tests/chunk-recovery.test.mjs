import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadFailure, recoverStaleChunk, recoveryNavigationUrl } from '../src/chunkRecovery.ts';

const oldEntry = 'https://nisfayn.example/assets/index-old.js';
const newEntry = 'https://nisfayn.example/assets/index-new.js';
const currentPage = 'https://nisfayn.example/?test=1&actor=reham#invite=keep-me';
const failure = new TypeError('Failed to fetch dynamically imported module: https://nisfayn.example/assets/Settings-old.js');
function fixture(overrides = {}) {
  const saved = new Map(), navigations = []; let reloads = 0, fetches = 0;
  const options = { online: true, currentEntry: oldEntry, currentPage, latestEntry: async () => { fetches++; return newEntry; },
    storage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    reload: url => { reloads++; navigations.push(url); }, ...overrides };
  return { options, navigations, reloads: () => reloads, fetches: () => fetches };
}

test('ordinary render and network errors never enter deployment recovery', async () => {
  const f = fixture();
  for (const error of [new Error('Failed to fetch'), new Error('Load failed'), new Error('Cannot read properties of null'), null]) {
    assert.equal(isChunkLoadFailure(error), false);
    assert.equal(await recoverStaleChunk(error, f.options), 'unavailable');
  }
  assert.equal(f.fetches(), 0); assert.equal(f.reloads(), 0);
});

test('known dynamic import failures recover a newer deployed entry once per target release', async () => {
  const f = fixture();
  assert.equal(await recoverStaleChunk(failure, f.options), 'reloaded');
  assert.equal(await recoverStaleChunk(failure, f.options), 'unavailable');
  assert.equal(await recoverStaleChunk(failure, { ...f.options, currentEntry: newEntry }), 'unavailable');
  assert.equal(f.reloads(), 1);
  const navigation = new URL(f.navigations[0]);
  assert.equal(navigation.searchParams.get('actor'), 'reham');
  assert.equal(navigation.searchParams.get('test'), '1');
  assert.equal(navigation.hash, '#invite=keep-me');
  assert.match(navigation.searchParams.get('__nf_reload'), /^\/assets\/index-new\.js:\d+$/);
  for (const message of ['Importing a module script failed.', 'error loading dynamically imported module', 'Unable to preload CSS for /assets/Settings-old.css', 'Failed to load module script: unexpected MIME type', 'Module script load failed']) assert.equal(isChunkLoadFailure(new Error(message)), true);
});

test('same-release module failure gets one fresh document retry and the URL marker prevents another', async () => {
  const f = fixture({ currentEntry: newEntry });
  assert.equal(await recoverStaleChunk(failure, f.options), 'reloaded');
  assert.equal(await recoverStaleChunk(failure, f.options), 'unavailable');
  const afterNavigation = fixture({ currentEntry: newEntry, currentPage: f.navigations[0] });
  assert.equal(await recoverStaleChunk(failure, afterNavigation.options), 'unavailable');
  assert.equal(afterNavigation.reloads(), 0);
  const nextRelease = fixture({ currentPage: f.navigations[0], latestEntry: async () => 'https://nisfayn.example/assets/index-next.js' });
  assert.equal(await recoverStaleChunk(failure, nextRelease.options), 'reloaded');
  const withoutPage = fixture({ currentPage: undefined, currentEntry: newEntry });
  assert.equal(await recoverStaleChunk(failure, withoutPage.options), 'unavailable');
});

test('recovery URL preserves navigation state and only accepts matching HTTP origins', () => {
  const url = new URL(recoveryNavigationUrl('https://nisfayn.example/index.html?test=1&actor=abdulrahman&filter=a&filter=b#saved', newEntry, 123));
  assert.equal(url.pathname, '/index.html');
  assert.equal(url.searchParams.get('actor'), 'abdulrahman');
  assert.equal(url.searchParams.get('test'), '1');
  assert.deepEqual(url.searchParams.getAll('filter'), ['a', 'b']);
  assert.equal(url.hash, '#saved');
  assert.equal(url.searchParams.get('__nf_reload'), '/assets/index-new.js:123');
  const manualRetry = new URL(recoveryNavigationUrl(url.href, newEntry, 456));
  assert.deepEqual(manualRetry.searchParams.getAll('__nf_reload'), ['/assets/index-new.js:456']);
  assert.equal(manualRetry.hash, '#saved');
  for (const [page, entry] of [[currentPage, 'https://other.example/assets/index-new.js'], ['file:///app/index.html', newEntry], ['capacitor://localhost/', newEntry], ['invalid', newEntry], [currentPage, 'https://nisfayn.example/login.js']]) {
    assert.equal(recoveryNavigationUrl(page, entry, 123), null);
  }
});

test('missing or foreign entry, offline and failed HTML checks do not reload', async () => {
  for (const latest of [null, 'https://other.example/assets/index-new.js', 'https://nisfayn.example/login.js']) {
    const f = fixture({ latestEntry: async () => latest });
    assert.equal(await recoverStaleChunk(failure, f.options), 'unavailable'); assert.equal(f.reloads(), 0);
  }
  for (const currentEntry of [null, 'capacitor://localhost/assets/index-old.js', 'https://nisfayn.example/src/main.tsx']) {
    const f = fixture({ currentEntry });
    assert.equal(await recoverStaleChunk(failure, f.options), 'unavailable'); assert.equal(f.fetches(), 0);
  }
  const offline = fixture({ online: false });
  assert.equal(await recoverStaleChunk(failure, offline.options), 'offline'); assert.equal(offline.fetches(), 0);
  const failed = fixture({ latestEntry: async () => { throw new Error('timeout'); } });
  assert.equal(await recoverStaleChunk(failure, failed.options), 'unavailable'); assert.equal(failed.reloads(), 0);
  const foreignPage = fixture({ currentPage: 'https://other.example/' });
  assert.equal(await recoverStaleChunk(failure, foreignPage.options), 'unavailable'); assert.equal(foreignPage.reloads(), 0);
});

test('blocked or silently failing session storage prevents automatic reload loops', async () => {
  for (const storage of [
    { getItem() { throw Error('blocked'); }, setItem() {} },
    { getItem() { return null; }, setItem() { throw Error('quota'); } },
    { getItem() { return null; }, setItem() {} },
  ]) {
    const f = fixture({ storage });
    assert.equal(await recoverStaleChunk(failure, f.options), 'unavailable'); assert.equal(f.reloads(), 0);
  }
});
