import assert from 'node:assert/strict';
import test from 'node:test';
import { describeFit } from '../compatibility/model.ts';
import { applicableDimensions, practicalAnswerKeys } from '../compatibility/practical-catalog.ts';
import { personalityQuestionsFor } from '../compatibility/personality.ts';
import { createProfileReading } from './profileReading.ts';
import { pairedPersonality } from './pairedPersonality.ts';
import { personalityPortrait } from './personalityPortrait.ts';

const version = 'marriage-v4';
const questions = personalityQuestionsFor('personality-v2');

test('the opening grounds a personal reading in the member’s personality and practical answers', () => {
  const member={personalityAnswers:{start_conversation:'E',explore_views:'E'},surveyAnswers:{closeness_pace:'A'}};
  const portrait=personalityPortrait(member,'personality-v2',version);
  assert.match(portrait.text,/مبادرتك بالسؤال/);
  assert.match(portrait.text,/التفاصيل الشخصية/);
  assert.deepEqual(portrait.evidence.map(e=>e.key),['personality:start_conversation','personality:explore_views','answer:closeness_pace']);
  member.surveyAnswers.closeness_pace='B';
  assert.match(personalityPortrait(member,'personality-v2',version).text,/كلمة صريحة/);
  assert.deepEqual(personalityPortrait({},'personality-v2',version).evidence,[]);
});

test('paired interpretations follow the people, handle shared habits and require complete evidence', () => {
  const slower = {lasting_tension:'D',make_amends:'C'};
  const repairs = {lasting_tension:'A',make_amends:'E'};
  const read = (a,b) => pairedPersonality('personality-v2',a,b,'نواف');
  const normal = read(slower,repairs);
  assert.match(normal.findings[0].text,/أثر الموقف لديك.*الإصلاح لدى نواف/);
  assert.match(read(repairs,slower).findings[0].text,/أثر الموقف لدى نواف.*الإصلاح لديك/);
  const both = {lasting_tension:'D',make_amends:'D'};
  assert.match(read(both,both).findings[0].text,/كل منكما/);
  assert.equal(read(slower,{make_amends:'E'}).findings.length,0);
  assert.equal(read({lasting_tension:'B',make_amends:'B'},slower).findings.length,0);
  assert.deepEqual(normal.review[0].ownEvidence.map(entry=>entry.value),['يشبهني','يشبهني إلى حد ما']);
  assert(!JSON.stringify(normal.review).includes('نواف'));
});

test('withholding a source domain also withholds its paired interpretation', async () => {
  const {member} = profile('woman',false);
  const {member:person} = profile('man',false);
  Object.assign(member.personalityAnswers,{lasting_tension:'D',make_amends:'C'});
  Object.assign(person.personalityAnswers,{lasting_tension:'A',make_amends:'E'});
  const report=createProfileReading(()=>({member,person,fit:describeFit(member,person).fit}),()=>{});
  await report.request(person.id,'request');
  await report.generate(person.id);
  const draft=await report.request(person.id,'get');
  const id='interaction-lasting_tension-make_amends';
  assert(draft.review.some(item=>item.id===id));
  const outlook=draft.review.find(item=>item.id==='outlook-'+id);
  assert.deepEqual(outlook.ownEvidence,draft.review.find(item=>item.id===id).ownEvidence);
  const shared=await report.request(person.id,'review',Object.fromEntries(draft.review.map(item=>[item.id,item.id!=='personality-stability'])));
  assert(!shared.findings.some(item=>item.id===id));
  assert(!shared.findings.some(item=>item.id===outlook.id));
});

test('the final chapter includes a future opportunity, friction and a step to take now', async () => {
  const {member}=profile('woman',false), {member:person}=profile('man',false);
  const report=createProfileReading(()=>({member,person,fit:describeFit(member,person).fit}),()=>{});
  await report.request(person.id,'request');
  await report.generate(person.id);
  const draft=await report.request(person.id,'get');
  const shared=await report.request(person.id,'review',Object.fromEntries(draft.review.map(item=>[item.id,true])));
  const outlooks=shared.findings.filter(item=>item.section==='conclusion');
  assert(outlooks.length>0 && outlooks.length<=2);
  for (const item of outlooks) assert.match(item.text,/\n\nفرصة بينكما: .+\n\nما قد يصعب: .+\n\nمن الآن: .+/);
});

function profile(gender, skipParenting) {
  const member = {
    id: gender, gender, alias: gender === 'woman' ? 'نورة' : 'خالد', city: 'الرياض', age: 30,
    assessmentVersion: version, personalityVersion: 'personality-v2',
    surveyAnswers: { children_plan: skipParenting ? 'B' : 'A' },
    marriageBasics: { childrenCount: 0 },
    partnerCriteria: { children: { mode: skipParenting ? 'require' : 'any', target: 'none' } },
    personalityAnswers: Object.fromEntries(questions.map(question => [question.id, gender === 'woman' ? 'E' : 'A'])),
  };
  const topics = applicableDimensions(version, member.surveyAnswers, 0, member.partnerCriteria.children);
  const keys = topics.flatMap(topic => practicalAnswerKeys(topic, version));
  member.surveyAnswers = { ...Object.fromEntries(keys.map(key => [key, 'A'])), ...member.surveyAnswers,
    partner_residence_plan: 'A', parenting_approach: 'A', partner_parenting_approach: 'A' };
  return {member, keys};
}

test('local readings cover the current 46- and 44-answer routes with disclosure review', async () => {
  for (const skipParenting of [false, true]) {
    const {member, keys} = profile('woman', skipParenting);
    const {member:person} = profile('man', skipParenting);
    const reports = createProfileReading(() => ({member, person, fit:describeFit(member, person).fit}), () => {});
    await reports.request(person.id, 'request');
    await reports.generate(person.id);
    const draft = await reports.request(person.id, 'get');
    assert.deepEqual(draft.findings, []);
    const evidence = draft.review.flatMap(finding => finding.ownEvidence);
    assert.equal(new Set(evidence.map(entry => entry.key)).size, skipParenting ? 44 : 46);
    assert.deepEqual(new Set(evidence.map(entry => entry.key)), new Set([
      ...keys.map(key => `answer:${key}`), ...questions.map(question => `personality:${question.id}`),
    ]));
    assert(!JSON.stringify(draft.review).includes(person.alias));
    const shared = await reports.request(person.id, 'review', Object.fromEntries(draft.review.map(finding => [finding.id, finding.id !== 'residence_plan'])));
    assert(!shared.findings.some(finding => finding.id === 'residence_plan'));
    assert.equal(shared.findings.filter(finding => finding.id.startsWith('personality-')).length, 5);
    const portrait=shared.findings.find(finding=>finding.id==='interaction-portraits');
    assert.match(portrait.text,/إليك: [\s\S]+إلى خالد: /);
    assert(!JSON.stringify(draft.review.find(item=>item.id===portrait.id)).includes(person.alias));
    const stress = shared.findings.find(finding => finding.id === 'personality-stability').text;
    assert.match(stress, /وقت الانزعاج/);
    assert.match(stress, /إنصات يريحك ومساعدة عملية/);
    const prose = shared.findings.map(finding => finding.text).join('\n');
    assert.doesNotMatch(prose, /إجابتك:|إجابة خالد:|بخصوص الشريك:|تشبهني|اختارا مهمة مشتركة|مسؤولية أسبوعية يتولاها|خطّطا ليوم|خطّطا لعطلة|قسّما مسؤوليات/);
    for (const question of questions) assert(!prose.includes(question.prompt));
    assert.match(shared.findings.find(finding => finding.id === 'children_plan').text, /رغبته في الإنجاب/);
    member.personalityAnswers.calm_before_acting = 'B';
    assert.equal((await reports.request(person.id, 'get')).status, 'stale');
  }
});
