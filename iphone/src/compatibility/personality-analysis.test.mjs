import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './personality-catalog.json' with {type:'json'};
import {comparePreferences,personalityPercentage} from './model.ts';
import {analyzePersonality, validatedPersonalityEvidence, personalityDomains, personalityTopics, distributionSteps} from './personality-analysis.ts';

const answers=letter=>Object.fromEntries(catalog.map(question=>[question.id,letter]));
const first={id:'personality-a',gender:'woman',age:28,city:'الرياض',preferredMinAge:18,preferredMaxAge:60,personalityVersion:'personality-v1',personalityAnswers:answers('A')};
const second={...first,id:'personality-b',gender:'man',age:31};
const fit=(a=first,b=second)=>comparePreferences(a,b).fit.personality;

test('12 equal-weight answers reconcile to the exact score with four domains and no partner responses',()=>{
 assert.equal(new Set(personalityDomains.flatMap(domain=>domain.questionIds)).size,12);
 assert.deepEqual(Object.keys(personalityTopics).sort(),catalog.map(question=>question.id).sort());
 for(const [gap,letter] of [...'ABCDE'].entries()){
  const result=fit(first,{...second,personalityAnswers:answers(letter)});
  assert.equal(result.percentage,100-gap*25);
  const evidence=validatedPersonalityEvidence(result);assert(evidence);
  assert.equal(evidence.distribution[distributionSteps[gap].key],12);
  assert(evidence.domains.every(domain=>domain.percentage===100-gap*25&&domain.covered===3&&domain.total===3));
  assert.deepEqual(result,fit({...second,personalityAnswers:answers(letter)},first));
  assert(!('answers' in result));assert(!('distances' in result));
 }
});

test('domain rounding does not change the overall calculation or invalidate correct evidence',()=>{
 const result=fit(first,{...second,personalityAnswers:{...answers('A'),initiative:'C',openness:'C',social_energy:'C'}});
 assert.equal(result.percentage,88);
 assert.deepEqual(result.domains.map(domain=>domain.percentage),[83,83,83,100]);
 assert.equal(Math.round(result.domains.reduce((sum,domain)=>sum+domain.percentage,0)/4),87);
 assert(validatedPersonalityEvidence(result));
 assert.deepEqual(result.distribution,{same:9,near:0,different:3,far:0,opposite:0});
});

test('missing, invalid, or stale answers suppress all domain percentages and distribution',()=>{
 for(const changed of [{personalityAnswers:{...answers('A'),support:undefined}},{personalityAnswers:{...answers('A'),support:'Z'}},{personalityVersion:'personality-v0'}]){
  const result=fit(first,{...second,...changed});
  assert.equal(result.complete,false);assert.equal(result.percentage,null);assert.equal(result.distribution,null);
  assert(result.domains.every(domain=>domain.percentage===null));
  assert.equal(validatedPersonalityEvidence(result),null);assert.equal(analyzePersonality(result),null);
 }
 const partial=fit(first,{...second,personalityAnswers:{initiative:'A'}});
 assert.deepEqual(partial.domains.map(domain=>domain.covered),[1,0,0,0]);
});

test('malformed or stale evidence cannot produce a detailed explanation',()=>{
 const original=fit();
 const corruptions=[
  result=>{delete result.method;},result=>{result.version='personality-v2';},result=>{result.method='other';},
  result=>{result.complete=false;},result=>{result.total=1;},result=>{result.covered=11;},result=>{result.percentage=99;},
  result=>{result.distribution.same=11;},result=>{result.distribution.near=-1;},result=>{result.distribution.extra=0;},
  result=>{result.distribution.same='12';},result=>{result.domains[0].percentage=99;},result=>{result.domains[0].percentage=75;},
  result=>{result.domains[0].id='other';},result=>{result.domains[0].covered=2;},result=>{result.domains[0].total=4;},
  result=>{result.domains.reverse();},result=>{result.domains.pop();},
  result=>{result.similarities[0]='unknown';},result=>{result.similarities[0]=result.similarities[1];},
  result=>{result.differences=[result.similarities[0]];},result=>{result.similarities=null;},
 ];
 for(const corrupt of corruptions){const result=structuredClone(original);corrupt(result);assert.equal(validatedPersonalityEvidence(result),null);assert.equal(analyzePersonality(result),null);}
 for(const value of [null,undefined,[],{},false,'same'])assert.equal(validatedPersonalityEvidence(value),null);
});

test('displayed percentage rejects invalid new evidence while keeping legacy scores readable',()=>{
 const good=fit();assert.equal(personalityPercentage({personality:good}),100);
 const legacy=structuredClone(good);delete legacy.method;delete legacy.domains;delete legacy.distribution;
 assert.equal(personalityPercentage({personality:legacy}),100);
 for(const changed of [{method:'future-method'},{method:undefined},{percentage:99},{distribution:null},{domains:[]},{complete:false}]){
  assert.equal(personalityPercentage({personality:{...good,...changed}}),null);
 }
});

test('insights select supported topics only and remain neutral about either person’s answer direction',()=>{
 const result=fit(first,{...second,personalityAnswers:{...answers('A'),conflict_pace:'E',support:'D',quiet_comfort:'C'}});
 const analysis=analyzePersonality(result);assert(analysis);
 assert.equal(analysis.strengths.length,2);assert.equal(analysis.discussion.length,2);
 for(const topic of analysis.strengths){assert(result.similarities.includes(topic.id));assert.equal(topic.interpretation,personalityTopics[topic.id].similarity);}
 for(const topic of analysis.discussion){assert(result.differences.includes(topic.id));assert.equal(topic.interpretation,personalityTopics[topic.id].discussion);assert(topic.prompt.endsWith('؟'));}
 assert.deepEqual(analyzePersonality(fit({...second,personalityAnswers:{...answers('E'),conflict_pace:'A',support:'B',quiet_comfort:'C'}},{...first,personalityAnswers:answers('E')})),analysis);
 assert.equal(analyzePersonality(fit()).discussion.length,0);
 assert.equal(analyzePersonality(fit(first,{...second,personalityAnswers:answers('E')})).strengths.length,0);
});
