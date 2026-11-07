import test from 'node:test';
import assert from 'node:assert/strict';
import { adminSessionKey as key, adminStorage, clearAdminSession } from '../src/sessionStorage.ts';

function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
test('admin login survives a new tab and upgrades the existing tab session', () => {
  const localStorage = storage(), sessionStorage = storage();
  sessionStorage.setItem(key, 'existing-session');
  const chosen = adminStorage({ localStorage, sessionStorage });
  assert.equal(chosen, localStorage);
  assert.equal(sessionStorage.getItem(key), null);
  assert.equal(adminStorage({ localStorage, sessionStorage: storage() }).getItem(key), 'existing-session');
  sessionStorage.setItem(key, 'older-token');
  chosen.setItem(key, 'refreshed-token');
  assert.equal(adminStorage({ localStorage, sessionStorage }).getItem(key), 'refreshed-token');
});
test('logout removes current and legacy credentials without clearing unrelated app data', () => {
  const browser = { localStorage: storage(), sessionStorage: storage() };
  for (const store of Object.values(browser)) {
    store.setItem(key, 'session'); store.setItem(key + '-user', 'cached-user'); store.setItem('unrelated', 'keep');
  }
  clearAdminSession(browser);
  for (const store of Object.values(browser)) {
    assert.equal(store.getItem(key), null); assert.equal(store.getItem(key + '-user'), null); assert.equal(store.getItem('unrelated'), 'keep');
  }
  assert.equal(adminStorage(browser).getItem(key), null);
});
test('blocked persistent storage falls back to the current tab', () => {
  const sessionStorage = storage();
  const browser = { get localStorage() { throw new Error('Blocked'); }, sessionStorage };
  assert.equal(adminStorage(browser), sessionStorage);
  sessionStorage.setItem(key, 'session'); clearAdminSession(browser);
  assert.equal(sessionStorage.getItem(key), null);
});
