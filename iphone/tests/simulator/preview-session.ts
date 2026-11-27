import { testProfile } from '../../src/testing/pair';

const actor = 'abdulrahman';
const profile = testProfile(actor);
const reham = { ...testProfile('reham'), displayName: 'رهام' };
const matchedAt = new Date().toISOString();
const pair = {
  actor, profileRevision: 'v1', matched: true, matchedAt,
  profiles: { abdulrahman: profile, reham },
  messages: [], read: {}, delivered: {}, stage: 0, agree: {},
  exclusive: false, exclusiveConsent: {}, call: null,
  callPermission: { status: 'none' }, seriousness: { status: 'none' },
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.includes('/functions/v1/pair-test')) return originalFetch(input, init);
  const action = JSON.parse(String(init?.body || '{}')).action;
  const data = ['notifications', 'gallery_list', 'push_updates'].includes(action) ? [] : pair;
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};

export const previewSession = { actor, profile, session: 'f'.repeat(64), profileRevision: 'v1' } as const;
