import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let loader, answeredProfilePrompts, initialDraft, toProfile, profileBaseline, validateStep, publicProfile;
before(async () => {
  loader = await createServer({ configFile: false, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false } });
  ({ answeredProfilePrompts } = await loader.ssrLoadModule('/src/profile/profilePrompts.ts'));
  ({ initialDraft, toProfile, profileBaseline, validateStep } = await loader.ssrLoadModule('/src/onboarding/draft.ts'));
  ({ publicProfile } = await loader.ssrLoadModule('/src/profile/publicProfile.ts'));
});
after(() => loader?.close());

test('optional prompts survive the existing edit/save/public-preview roundtrip and can be cleared', () => {
  const profile = { displayName: 'نور', age: 29, gender: 'woman', city: 'الرياض', profession: 'التصميم والفنون', bio: 'نبذة', contact: 'private', preferredMinAge: 25, preferredMaxAge: 40, familyPreference: '',
    lookingFor: 'شريك يحسن الاستماع', lifeTogether: 'قهوة ووقت هادئ', valuesStatement: 'أحتاج الوضوح', surveyAnswers: { private: 'لا تُنشر' } };
  const draft = initialDraft('owner', profile);
  assert.equal(validateStep('story', draft.answers, true), null);
  const saved = toProfile(draft.answers);
  assert.deepEqual(answeredProfilePrompts(publicProfile(saved, 'owner')).map(({ key, answer }) => [key, answer]), [
    ['lookingFor', profile.lookingFor], ['lifeTogether', profile.lifeTogether], ['valuesStatement', profile.valuesStatement],
  ]);
  const cleared = toProfile({ ...draft.answers, lifeTogether: '', valuesStatement: '   ' });
  assert.notEqual(profileBaseline(saved), profileBaseline(cleared));
  assert.equal(answeredProfilePrompts(publicProfile(cleared, 'owner')).length, 1);
  assert.equal(initialDraft('owner', cleared).answers.lifeTogether, '');
});

test('no prompt is inferred from private answers or populated from placeholder text', () => {
  assert.deepEqual(answeredProfilePrompts({ lookingFor: '', valuesStatement: '  ', lifeTogether: '\n', bio: 'نبذة', contact: 'secret', surveyAnswers: { secret: 'private' }, partnerCriteria: { secret: 'private' } }), []);
  const result = answeredProfilePrompts({ lifeTogether: '  تفاصيل اختار مشاركتها  ', personalityAnswers: { secret: 'private' } });
  assert.equal(result.length, 1);
  assert.equal(result[0].answer, 'تفاصيل اختار مشاركتها');
  assert(!JSON.stringify(result).includes('private'));
});
