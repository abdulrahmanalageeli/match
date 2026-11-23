import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let loader, generatedBio;
test.before(async () => {
  loader = await createServer({ configFile:false, appType:'custom', logLevel:'error', optimizeDeps:{noDiscovery:true}, server:{middlewareMode:true,hmr:false, ws: false} });
  ({ generatedBio } = await loader.ssrLoadModule('/src/onboarding/profileDraftFallback.ts'));
});
test.after(() => loader?.close());

const answers = { city:'الرياض', profession:'التقنية والبرمجة', familyPreference:'من البداية', interestIds:['reading'], priorityCategories:[], bio:'', lookingFor:'', lifeTogether:'', valuesStatement:'', marriageIntent:'' };

test('public bio uses only public facts and invents no values or relationship plans', () => {
  assert.equal(generatedBio({ ...answers, city:'', profession:'' }), '');
  assert.equal(generatedBio({ ...answers, city:'', profession:'طالب / طالبة' }), 'أدرس حاليًا.');
  const first = generatedBio(answers), second = generatedBio(answers, 1);
  assert.notEqual(first, second);
  for (const text of [first, second]) {
    assert.match(text, /الرياض/);
    assert.match(text, /التقنية والبرمجة/);
    assert.doesNotMatch(text, /زوج|أفضّل|الاحترام|الصراحة/);
  }
});

test('the writing editor offers only grounded phrases from the confirmed interview, without changing the bio', async () => {
  const { writingNotes } = await loader.ssrLoadModule('/src/onboarding/PrivateWritingNotes.tsx');
  const doc = {status:'confirmed', turns:[{id:'1',answer:'أهوى الرسم. أفضّل شخصًا صبورًا.'}],
    statements:[{topic:'interest',subject:'self',turnId:'1',quote:'أهوى الرسم'},
      {topic:'description',subject:'partner',turnId:'1',quote:'صبورًا'},
      {topic:'description',subject:'self',turnId:'missing',quote:'كريم'}]};
  assert.deepEqual(writingNotes(doc),{bio:['أهوى الرسم'],lookingFor:['صبورًا']});
  assert.deepEqual(writingNotes({...doc,status:'review'}),{bio:[],lookingFor:[]});
  assert.doesNotMatch(generatedBio(answers),/الرسم/);
});
