import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let loader, generatedPublicProfileDraft, missingPublicProfileDraft;
test.before(async () => {
  loader = await createServer({ configFile:false, appType:'custom', logLevel:'error', optimizeDeps:{noDiscovery:true}, server:{middlewareMode:true,hmr:false} });
  ({ generatedPublicProfileDraft, missingPublicProfileDraft } = await loader.ssrLoadModule('/src/onboarding/profileDraftFallback.ts'));
});
test.after(() => loader?.close());

const answers = { city:'الرياض', profession:'التقنية والبرمجة', familyPreference:'من البداية', interestIds:['reading'], priorityCategories:[], bio:'', lookingFor:'', lifeTogether:'', valuesStatement:'', marriageIntent:'' };

test('fallback writes complete editable public copy from confirmed draft facts', () => {
  const result = generatedPublicProfileDraft(answers);
  assert.match(result.bio, /الرياض/);
  assert.match(result.bio, /التقنية والبرمجة/);
  for (const value of Object.values(result)) assert(value.trim().length > 0);
});

test('fallback never replaces writing already supplied by the member', () => {
  const result = missingPublicProfileDraft({ ...answers, bio:'نصي أنا' }, 1);
  assert.equal(result.bio, undefined);
  assert(result.lookingFor);
});

test('rephrasing changes form without inventing a different city or profession', () => {
  const first = generatedPublicProfileDraft(answers, 0), second = generatedPublicProfileDraft(answers, 1);
  assert.notEqual(first.bio, second.bio);
  assert.match(second.bio, /الرياض/);
  assert.match(second.bio, /التقنية والبرمجة/);
});
