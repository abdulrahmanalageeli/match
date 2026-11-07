import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadFailure, recoverStaleChunk } from '../src/chunkRecovery.ts';

const oldEntry = 'https://nisfayn.example/assets/index-old.js';
const newEntry = 'https://nisfayn.example/assets/index-new.js';
const failure = new TypeError('Failed to fetch dynamically imported module: https://nisfayn.example/assets/Settings-old.js');
function fixture(overrides = {}) {
  const saved = new Map(); let reloads = 0, fetches = 0;
  const options = { online: true, currentEntry: oldEntry, latestEntry: async () => { fetches++; return newEntry; },
    storage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    reload: () => { reloads++; }, ...overrides };
  return { options, reloads: () => reloads, fetches: () => fetches };
}

test('ordinary render and network errors never enter deployment recovery', async () => {
  const f = fixture();
  for (const error of [new Error('Failed to fetch'), new Error('Cannot read properties of null'), null]) {
    assert.equal(isChunkLoadFailure(error), false);
    assert.equal(await recoverStaleChunk(error, f.options), 'unavailable');
  }
  assert.equal(f.fetches(), 0); assert.equal(f.reloads(), 0);
});

test('known dynamic import failures reload only for a newer deployed entry, once per target release', async () => {
  const f = fixture();
  assert.equal(await recoverStaleChunk(failure, f.options), 'reloaded');
  assert.equal(await recoverStaleChunk(failure, f.options), 'unavailable');
  assert.equal(await recoverStaleChunk(failure, { ...f.options, currentEntry: newEntry }), 'unavailable');
  assert.equal(f.reloads(), 1);
  for (const message of ['Importing a module script failed.', 'error loading dynamically imported module', 'Unable to preload CSS for /assets/Settings-old.css']) assert.equal(isChunkLoadFailure(new Error(message)), true);
});

test('current release, missing entry, foreign entry, offline and failed HTML checks do not reload', async () => {
  for (const latest of [oldEntry, null, 'https://other.example/assets/index-new.js', 'https://nisfayn.example/login.js']) {
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
