import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import ts from 'typescript';
import {assessmentVersion,dimensionsForVersion,comparePreferences,interests} from '../compatibility/model.ts';
import {personalityQuestionsFor,legacyPersonalityOptions as personalityOptions} from '../compatibility/personality.ts';
import {applicableDimensions,hasPartnerQuestion,practicalAnswerKeys} from '../compatibility/practical-catalog.ts';
import personas from './demoPersonas.json' with {type:'json'};
import {demoEvidence} from '../../api/_lib/demo-deep-evidence.mjs';

// Load only the fictional fixture block. Browser transport/simulation imports
// are tested separately and must never execute while inspecting seed coverage.
const dimensions=dimensionsForVersion('marriage-v3');
const personalityQuestions=personalityQuestionsFor('personality-v1');
const dataFile=new URL('./data.ts',import.meta.url);
const content=await readFile(dataFile,'utf8');
const fixtures=content.slice(content.indexOf('const sampleLifeAnswers'),content.indexOf('const demoPortraitFiles'));
const imports=`import {assessmentVersion,dimensionsForVersion} from ${JSON.stringify(new URL('../compatibility/model.ts',import.meta.url).href)};
import {personalityQuestionsFor,partnerTraitQuestions} from ${JSON.stringify(new URL('../compatibility/personality.ts',import.meta.url).href)};
import {demoAssessmentSeeds,demoSurvey} from ${JSON.stringify(new URL('./demoAssessmentSeeds.mjs',import.meta.url).href)};
import {beenaScenarios} from ${JSON.stringify(new URL('../beena/model.ts',import.meta.url).href)};`;
const compiled=ts.transpileModule(fixtures,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {demoPeople,demoProfile}=await import('data:text/javascript;base64,'+Buffer.from(imports+compiled).toString('base64'));

test('fictional roster contains 10 distinct adults per gender with complete valid assessments',()=>{
  assert.equal(demoPeople.length,20);
  assert.equal(new Set(demoPeople.map(p=>p.id)).size,20);
  assert.equal(new Set(demoPeople.map(p=>p.bio)).size,20);
  for(const gender of ['man','woman'])assert.equal(demoPeople.filter(p=>p.gender===gender).length,10);
  for(const p of demoPeople){
    assert.equal(p.isDemo,true);assert(p.age>=18);
    assert(p.bio.length>=80);assert(p.lookingFor&&p.valuesStatement&&p.lifeTogether&&p.education);
    assert(p.interestIds.length>=2&&p.interestIds.length<=3);
    assert(p.interestIds.every(id=>interests.some(item=>item.id===id)));
    for(const d of dimensions){
      for(const id of [d.id,d.partnerId])assert(d.options.some(o=>o.code===p.surveyAnswers[id]),`${p.id}: ${id}`);
    }
    for(const q of personalityQuestions)assert(personalityOptions.some(o=>o.code===p.personalityAnswers[q.id]),`${p.id}: ${q.id}`);
    const current={...p,...p.currentAssessment};
    assert.equal(current.assessmentVersion,assessmentVersion);
    const topics=applicableDimensions(assessmentVersion,current.surveyAnswers,p.marriageBasics.childrenCount,p.partnerCriteria.children);
    assert.deepEqual(new Set(Object.keys(current.surveyAnswers)),new Set(topics.flatMap(d=>practicalAnswerKeys(d,assessmentVersion))));
    assert.equal(Object.keys(current.personalityAnswers).length,20);
    for(const d of topics){
      for(const id of practicalAnswerKeys(d,assessmentVersion))assert(d.options.some(o=>o.code===current.surveyAnswers[id]),`${p.id}: ${id}`);
    }
    for(const q of personalityQuestionsFor(current.personalityVersion)){
      assert(q.options.some(o=>o.code===current.personalityAnswers[q.id]),`${p.id}: ${q.id}`);
    }
    const currentComparison=comparePreferences(current,{...current,id:'current-'+p.id,gender:p.gender==='man'?'woman':'man'});
    assert.equal(currentComparison.fit.assessmentComplete,true);
    assert.equal(currentComparison.fit.personality.complete,true);
    const peer={...p,id:'opposite-'+p.id,gender:p.gender==='man'?'woman':'man'};
    const comparison=comparePreferences(p,peer);
    assert.equal(comparison.fit.assessmentComplete,true);
    assert.equal(comparison.fit.personality.complete,true);
  }
  // Real named testing accounts inherit this template: do not invent their answers.
  assert.equal(demoProfile.marriageBasics.marriageTimeline,undefined);
  assert.equal(demoProfile.marriageBasics.meetingPreference,undefined);
});

test('roster spans every measured personality dimension and realistic life situations',()=>{
  for(const q of personalityQuestions){
    const values=new Set(demoPeople.map(p=>p.personalityAnswers[q.id]));
    assert(values.has('A')&&values.has('E'),`${q.id} should include both ends of the actual assessment`);
    assert(values.size>=4);
  }
  assert(new Set(demoPeople.map(p=>p.city)).size>=6);
  assert.equal(new Set(demoPeople.map(p=>p.marriageBasics.marriageTimeline)).size,5);
  assert.equal(new Set(demoPeople.map(p=>p.marriageBasics.meetingPreference)).size,4);
  assert(demoPeople.some(p=>p.marriageBasics.maritalStatus==='divorced'));
  assert(demoPeople.some(p=>p.marriageBasics.maritalStatus==='widowed'));
  assert(demoPeople.some(p=>p.marriageBasics.childrenCount>0));
  assert(demoPeople.some(p=>p.surveyAnswers.children_plan==='B'));
  assert(demoPeople.some(p=>p.surveyAnswers.children_plan==='C'));
});

test('demo portraits remain valid and optional while server persona briefs match source profiles',async()=>{
  for(const gender of ['man','woman'])assert.equal(demoPeople.filter(p=>p.gender===gender&&p.demoPhoto).length,7);
  assert.equal(demoPeople.find(p=>p.id==='p01').demoPhoto,'/demo/portraits/fahad.webp');
  assert.equal(demoPeople.find(p=>p.id==='wp01').demoPhoto,'/demo/portraits/sarah-realistic-v2.webp');
  for(const p of demoPeople.filter(p=>p.demoPhoto))await access(new URL('../../public'+p.demoPhoto,import.meta.url));
  assert.deepEqual(personas,demoPeople.map(p=>({id:p.id,name:p.alias,bio:p.bio,interests:p.interestIds,
    style:personalityQuestions.map(q=>q.prompt+' '+personalityOptions.find(o=>o.code===p.personalityAnswers[q.id]).label).join('؛ '),
    age:p.age,city:p.city,occupation:p.occupation,gender:p.gender})));
});

test('remote demo report evidence matches every applicable answer in the same profile and instrument', () => {
  assert.equal(demoEvidence('unknown'), null);
  for (const person of demoPeople) {
    for (const profile of [person, person.currentAssessment]) {
      const version = profile.assessmentVersion;
      const evidence = demoEvidence(person.id, version);
      const entries = new Map(evidence.entries.map(entry => [entry.key, entry]));
      assert.equal(evidence.assessmentVersion, version);
      assert.equal(evidence.personalityVersion, profile.personalityVersion);
      assert.equal(evidence.entries.length, Object.keys(profile.surveyAnswers).length + personalityQuestionsFor(profile.personalityVersion).length);
      assert.equal(entries.size, evidence.entries.length);
      for (const topic of dimensionsForVersion(version)) {
        if (!Object.hasOwn(profile.surveyAnswers,topic.id)) {
          assert.equal(entries.has('answer:'+topic.id),false);
          assert.equal(entries.has('answer:'+topic.partnerId),false);
          continue;
        }
        const own = topic.options.find(option => option.code === profile.surveyAnswers[topic.id]);
        assert.equal(entries.get('answer:' + topic.id).answer, own.self, person.id);
        const partnerKey = 'answer:' + topic.partnerId;
        if (!hasPartnerQuestion(topic.id, version)) {
          assert.equal(entries.has(partnerKey), false, person.id);
          continue;
        }
        const wanted = topic.options.find(option => option.code === profile.surveyAnswers[topic.partnerId]);
        assert.equal(entries.get(partnerKey).answer, wanted.partner, person.id);
      }
      for (const question of personalityQuestionsFor(profile.personalityVersion)) {
        const selected = question.options.find(option => option.code === profile.personalityAnswers[question.id]);
        assert.equal(entries.get('personality:' + question.id).answer, selected.label, person.id);
      }
    }
  }
});
